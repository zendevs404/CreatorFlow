import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { decryptToken } from "@/lib/crypto/tokens";
import { ThreadsApiError, type InsightValues, type ThreadsApi } from "@/lib/threads/api";

type Admin = SupabaseClient<Database>;

export const POST_METRICS = ["views", "likes", "replies", "reposts", "quotes"] as const;
export const ACCOUNT_RANGE_METRICS = ["views", "likes", "replies", "reposts", "quotes"] as const;
const MAX_POSTS = 25;
export const MIN_REFRESH_INTERVAL_MS = 15 * 60_000;

export type RefreshSummary =
  | { status: "ok"; postsUpdated: number; postsFailed: number; accountUpdated: boolean; message?: string }
  | { status: "skipped"; reason: "not_connected" | "insights_disabled" | "needs_reauth" | "fresh" | "rate_limited" }
  | { status: "failed"; message: string };

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/**
 * Pulls real metrics from Threads and stores a snapshot. Nothing is estimated: a metric Threads does not
 * return is stored as NULL and shown as "not available". At most 25 recent published posts are refreshed,
 * and not more often than every 15 minutes per user, to stay well inside Threads' rate limits.
 */
export async function refreshInsights(
  admin: Admin,
  api: ThreadsApi,
  encryptionKey: string,
  userId: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<RefreshSummary> {
  const now = opts.now ?? new Date();
  const { data: account, error } = await admin
    .from("threads_accounts")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { status: "failed", message: "Could not load the Threads connection." };
  if (!account || !account.access_token_ciphertext) return { status: "skipped", reason: "not_connected" };
  if (!account.insights_enabled) return { status: "skipped", reason: "insights_disabled" };
  if (account.needs_reauth) return { status: "skipped", reason: "needs_reauth" };

  const { data: last } = await admin.from("account_insights").select("fetched_at").eq("user_id", userId).maybeSingle();
  if (!opts.force && last && now.getTime() - new Date(last.fetched_at).getTime() < MIN_REFRESH_INTERVAL_MS) return { status: "skipped", reason: "fresh" };

  let token: string;
  try {
    token = decryptToken(account.access_token_ciphertext, encryptionKey, `${userId}:${account.threads_user_id}`);
  } catch {
    return { status: "failed", message: "Stored Threads token could not be read. Reconnect your account." };
  }

  let accountUpdated = false;
  let postsUpdated = 0;
  let postsFailed = 0;
  let note: string | undefined;
  try {
    // Account level: last 7 days, then followers (which does not accept a range).
    const until = Math.floor(now.getTime() / 1000);
    const since = until - 7 * 86_400;
    const week: InsightValues = await api.getUserInsights(token, account.threads_user_id, ACCOUNT_RANGE_METRICS, { since, until });
    const followers = await api.getUserInsights(token, account.threads_user_id, ["followers_count"]);
    const { error: upsertError } = await admin.from("account_insights").upsert(
      {
        user_id: userId,
        threads_account_id: account.id,
        followers_count: num(followers.followers_count),
        views_7d: num(week.views),
        likes_7d: num(week.likes),
        replies_7d: num(week.replies),
        reposts_7d: num(week.reposts),
        quotes_7d: num(week.quotes),
        range_start: new Date(since * 1000).toISOString(),
        range_end: new Date(until * 1000).toISOString(),
        fetched_at: now.toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (upsertError) throw new Error("Could not store account insights.");
    accountUpdated = true;

    const { data: posts, error: postsError } = await admin
      .from("posts")
      .select("id,external_post_id")
      .eq("user_id", userId)
      .eq("status", "published")
      .not("external_post_id", "is", null)
      .order("published_at", { ascending: false })
      .limit(MAX_POSTS);
    if (postsError) throw new Error("Could not list published posts.");

    for (const post of posts) {
      if (!post.external_post_id) continue;
      try {
        const m = await api.getMediaInsights(token, post.external_post_id, POST_METRICS);
        const { error: e } = await admin.from("post_insights").upsert(
          {
            post_id: post.id,
            user_id: userId,
            views: num(m.views),
            likes: num(m.likes),
            replies: num(m.replies),
            reposts: num(m.reposts),
            quotes: num(m.quotes),
            fetched_at: now.toISOString(),
          },
          { onConflict: "post_id" },
        );
        if (e) throw new Error("store");
        postsUpdated += 1;
      } catch (err) {
        if (err instanceof ThreadsApiError && (err.kind === "unauthorized" || err.kind === "rate_limited")) throw err;
        postsFailed += 1;
      }
    }
    if (postsFailed > 0) note = `${postsFailed} post${postsFailed === 1 ? "" : "s"} could not be read from Threads.`;
    return { status: "ok", postsUpdated, postsFailed, accountUpdated, message: note };
  } catch (err) {
    if (err instanceof ThreadsApiError) {
      console.error("Threads insights error", { kind: err.kind, status: err.status, ...err.detail, message: err.message });
      if (err.kind === "unauthorized") {
        await admin.from("threads_accounts").update({ needs_reauth: true, last_error: "Threads rejected the access token." }).eq("id", account.id).eq("user_id", userId);
        return { status: "skipped", reason: "needs_reauth" };
      }
      if (err.kind === "rate_limited") return { status: "skipped", reason: "rate_limited" };
      return { status: "failed", message: `Threads could not return insights: ${err.message}` };
    }
    return { status: "failed", message: "Could not refresh insights." };
  }
}
