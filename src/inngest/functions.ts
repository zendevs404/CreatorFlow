import "server-only";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { createSupabasePublishStore } from "@/lib/publishing/store";
import {
  checkChildContainer,
  checkContainer,
  createCarousel,
  ensureContainer,
  prepare,
  publish,
  PublishFailure,
  recordDeferred,
  recordFailure,
  recordSuccess,
  type Deps,
} from "@/lib/publishing/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { createThreadsApi } from "@/lib/threads/api";
import { refreshAccount } from "@/lib/threads/accounts";
import { refreshInsights } from "@/lib/insights/service";
import { inngest, PUBLISH_REQUESTED } from "./client";

const payload = z.object({ postId: z.uuid(), userId: z.uuid() });

function buildDeps(): Deps {
  const env = getServerEnv();
  return { api: createThreadsApi(), store: createSupabasePublishStore(createAdminClient(), env.TOKEN_ENCRYPTION_KEY) };
}

/** Non-retryable publishing failures stop the run immediately; everything else is retried by Inngest. */
function asInngestError(e: unknown): unknown {
  return e instanceof PublishFailure && !e.retryable ? new NonRetriableError(e.message, { cause: e }) : e;
}

/** Every minute: atomically claim due posts, and hand out posts whose worker disappeared. */
export const dispatchDuePosts = inngest.createFunction(
  { id: "dispatch-due-posts", triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => {
    const claimed = await step.run("claim-due-posts", async () => {
      const { data, error } = await createAdminClient().rpc("claim_due_posts", { batch_size: 25 });
      if (error) throw new Error("Could not claim due posts.");
      return data.map((r) => ({ postId: r.id, userId: r.user_id }));
    });
    const stale = await step.run("requeue-stale-posts", async () => {
      const { data, error } = await createAdminClient().rpc("requeue_stale_publishing", { stale_after: "15 minutes" });
      if (error) throw new Error("Could not requeue stale posts.");
      return data.map((r) => ({ postId: r.id, userId: r.user_id, claimedAt: r.claimed_at }));
    });
    const events = [
      ...claimed.map((c) => ({ name: PUBLISH_REQUESTED, data: c })),
      // The event id includes claimed_at, so each requeue is delivered once.
      ...stale.map((s) => ({ id: `publish:${s.postId}:${s.claimedAt}`, name: PUBLISH_REQUESTED, data: { postId: s.postId, userId: s.userId } })),
    ];
    if (events.length > 0) await step.sendEvent("request-publishing", events);
    return { claimed: claimed.length, requeued: stale.length };
  },
);

/** Publishes one claimed post. One run per user at a time keeps us inside Threads' rate limits. */
export const publishPost = inngest.createFunction(
  {
    id: "publish-post",
    triggers: [{ event: PUBLISH_REQUESTED }],
    retries: 5,
    concurrency: { limit: 1, key: "event.data.userId" },
    onFailure: async ({ event, error }) => {
      const original = payload.safeParse(event.data.event.data);
      if (!original.success) return;
      const message = error.message.slice(0, 400) || "Publishing failed.";
      await recordFailure(buildDeps(), original.data.postId, { code: "failed", message });
    },
  },
  async ({ event, step }) => {
    const { postId } = payload.parse(event.data);

    const prep = await step.run("prepare", () => prepare(buildDeps(), postId));
    if (prep.action === "skip") return { skipped: prep.reason };

    const created = await step.run("create-container", async () => {
      try {
        return await ensureContainer(buildDeps(), postId);
      } catch (e) {
        throw asInngestError(e);
      }
    });
    if (created.kind === "deferred") {
      await step.run("defer-for-quota", () => recordDeferred(buildDeps(), postId, created.until));
      return { deferredUntil: created.until };
    }

    let container: { containerId: string; hasMedia: boolean };
    if (created.kind === "children") {
      // Threads processes each carousel image asynchronously. Wait until every image is ready before creating the carousel.
      let statusUnknown = false;
      for (const [i, childId] of created.childIds.entries()) {
        for (let n = 0; n < 6; n += 1) {
          const child = await step.run(`check-image-${i}-${n}`, async () => {
            try {
              return await checkChildContainer(buildDeps(), postId, childId);
            } catch (e) {
              throw asInngestError(e);
            }
          });
          if (child.status === "UNKNOWN") {
            statusUnknown = true;
            break;
          }
          if (child.status === "FINISHED") break;
          await step.sleep(`wait-image-${i}-${n}`, "10s");
        }
      }
      if (statusUnknown) await step.sleep("wait-for-images-fallback", "20s");
      container = await step.run("create-carousel", async () => {
        try {
          return await createCarousel(buildDeps(), postId, created.childIds);
        } catch (e) {
          throw asInngestError(e);
        }
      });
    } else {
      container = created;
    }

    // Meta recommends waiting about 30 seconds for uploaded media to be processed before publishing.
    if (container.hasMedia) await step.sleep("let-threads-process-media", "30s");

    for (let i = 0; i < 6; i += 1) {
      const check = await step.run(`check-container-${i}`, async () => {
        try {
          return await checkContainer(buildDeps(), postId, container.containerId);
        } catch (e) {
          throw asInngestError(e);
        }
      });
      if (check.status !== "IN_PROGRESS") break;
      await step.sleep(`wait-for-container-${i}`, "60s");
    }

    const result = await step.run("publish", async () => {
      try {
        return await publish(buildDeps(), postId, container.containerId);
      } catch (e) {
        throw asInngestError(e);
      }
    });
    if (result.kind === "published") await step.run("record-success", () => recordSuccess(buildDeps(), postId));
    return result;
  },
);

/** Daily: refresh long-lived tokens that are due (Meta: >= 24h old, not expired, 60-day lifetime). */
export const refreshThreadsTokens = inngest.createFunction(
  { id: "refresh-threads-tokens", triggers: [{ cron: "0 3 * * *" }] },
  async ({ step }) => {
    const ids = await step.run("find-accounts", async () => {
      const { data, error } = await createAdminClient().from("threads_accounts").select("id").is("revoked_at", null).eq("needs_reauth", false).not("access_token_ciphertext", "is", null);
      if (error) throw new Error("Could not list accounts.");
      return data.map((a) => a.id);
    });
    const outcomes: Record<string, number> = {};
    for (const id of ids) {
      const outcome = await step.run(`refresh-${id}`, async () => {
        const admin = createAdminClient();
        const { data, error } = await admin.from("threads_accounts").select("*").eq("id", id).maybeSingle();
        if (error) throw new Error("Could not load the account.");
        if (!data) return "skipped" as const;
        return refreshAccount(admin, createThreadsApi(), getServerEnv().TOKEN_ENCRYPTION_KEY, data);
      });
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
    return outcomes;
  },
);

/** Every 6 hours: refresh cached insights for connected accounts (each user is throttled to once per 15 min). */
export const refreshAllInsights = inngest.createFunction(
  { id: "refresh-insights", triggers: [{ cron: "0 */6 * * *" }] },
  async ({ step }) => {
    const userIds = await step.run("find-accounts", async () => {
      const { data, error } = await createAdminClient().from("threads_accounts").select("user_id").is("revoked_at", null).eq("needs_reauth", false).eq("insights_enabled", true).not("access_token_ciphertext", "is", null);
      if (error) throw new Error("Could not list accounts.");
      return [...new Set(data.map((a) => a.user_id))];
    });
    const outcomes: Record<string, number> = {};
    for (const userId of userIds) {
      const status = await step.run(`insights-${userId}`, async () => {
        const result = await refreshInsights(createAdminClient(), createThreadsApi(), getServerEnv().TOKEN_ENCRYPTION_KEY, userId);
        return result.status === "skipped" ? `skipped:${result.reason}` : result.status;
      });
      outcomes[status] = (outcomes[status] ?? 0) + 1;
    }
    return outcomes;
  },
);

export const functions = [dispatchDuePosts, publishPost, refreshThreadsTokens, refreshAllInsights];
