import { ThreadsApiError, type ContainerStatus, type ThreadsApi } from "@/lib/threads/api";

/**
 * Publishing stages, written against a small store interface so they can be tested without a database
 * and run unchanged inside durable Inngest steps. Guarantees:
 *  - a post is only worked on while its status is 'publishing' (cancelled/rescheduled/deleted posts are skipped);
 *  - the Threads container id is stored before publishing and reused on retries;
 *  - before calling threads_publish the container status is checked, so a retry after a lost response
 *    never publishes twice;
 *  - results never contain tokens or signed URLs (Inngest persists step results).
 */

export type PostSnapshot = {
  id: string;
  userId: string;
  status: string;
  content: string;
  externalContainerId: string | null;
  externalPostId: string | null;
  mediaPaths: string[];
};

export type AccountSnapshot = { id: string; threadsUserId: string; token: string };

export type PublishStore = {
  loadPost(postId: string): Promise<PostSnapshot | null>;
  /** Returns null when no usable connection exists; throws PublishFailure for expired/flagged ones. */
  loadAccount(userId: string): Promise<AccountSnapshot | null>;
  signMediaUrls(paths: string[]): Promise<string[]>;
  saveContainer(post: PostSnapshot, containerId: string, accountId: string): Promise<boolean>;
  markPublished(post: PostSnapshot, externalPostId: string | null): Promise<boolean>;
  markFailed(post: PostSnapshot, reason: string): Promise<void>;
  deferPost(post: PostSnapshot, until: Date, reason: string): Promise<void>;
  flagAccountNeedsReauth(accountId: string, message: string): Promise<void>;
  startAttempt(post: PostSnapshot): Promise<number>;
  /** Closes the post's open ("started") attempt. */
  finishAttempt(post: PostSnapshot, outcome: "succeeded" | "failed", code: string | null, message: string | null): Promise<void>;
};

export type PublishFailureCode = "not_connected" | "unauthorized" | "rate_limited" | "provider_error" | "invalid_request" | "container_failed";

export class PublishFailure extends Error {
  constructor(
    readonly code: PublishFailureCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PublishFailure";
  }
}

export type Deps = { api: ThreadsApi; store: PublishStore; now?: () => Date };

export type PrepareResult = { action: "skip"; reason: string } | { action: "go"; attemptNumber: number };
export type ContainerResult =
  | { kind: "ready"; containerId: string; hasMedia: boolean }
  /** Carousel images were created; wait for them to finish processing, then call createCarousel. */
  | { kind: "children"; childIds: string[] }
  | { kind: "deferred"; until: string };
export type ChildCheckResult = { status: "FINISHED" | "IN_PROGRESS" | "UNKNOWN" };
export type CheckResult = { status: "FINISHED" | "IN_PROGRESS" | "PUBLISHED" };
export type PublishResult = { kind: "published"; externalPostId: string | null } | { kind: "skipped"; reason: string };

const QUOTA_RETRY_MINUTES = 30;

function translate(err: unknown, accountId?: string, store?: PublishStore): PublishFailure {
  if (err instanceof PublishFailure) return err;
  if (err instanceof ThreadsApiError) {
    // Safe to log: no tokens, URLs or request bodies. fbtrace_id lets Meta support find the request.
    console.error("Threads API error", { kind: err.kind, status: err.status, ...err.detail, message: err.message });
    if (err.kind === "unauthorized") {
      if (accountId && store) void store.flagAccountNeedsReauth(accountId, "Threads rejected the access token.").catch(() => undefined);
      return new PublishFailure("unauthorized", "Threads rejected the connection. Reconnect your account in Settings.", false);
    }
    if (err.kind === "rate_limited") return new PublishFailure("rate_limited", "Threads is rate limiting requests. Retrying later.", true);
    // Observed from Threads (code 100, subcode 4279004): a carousel item is "invalid, missing or expired" when it
    // is referenced before Threads finished processing it. Retrying after a wait is safe.
    if (err.kind === "invalid_request" && err.detail.subcode === 4279004) {
      return new PublishFailure("provider_error", `Threads is still preparing an image (${err.message})`, true);
    }
    const where = err.detail.operation ? ` when trying to ${err.detail.operation}` : "";
    const codes = err.detail.code !== undefined ? ` [code ${err.detail.code}${err.detail.subcode !== undefined ? `/${err.detail.subcode}` : ""}]` : "";
    if (err.kind === "invalid_request") return new PublishFailure("invalid_request", `Threads rejected the request${where}: ${err.message}${codes}`, false);
    return new PublishFailure("provider_error", `Threads had a temporary problem${where}: ${err.message}${codes}`, true);
  }
  return new PublishFailure("provider_error", "Unexpected error while publishing.", true);
}

/** Stage 1: confirm the post is still ours to publish and open an attempt record. */
export async function prepare(deps: Deps, postId: string): Promise<PrepareResult> {
  const post = await deps.store.loadPost(postId);
  if (!post) return { action: "skip", reason: "The post no longer exists." };
  if (post.status !== "publishing") return { action: "skip", reason: `The post is ${post.status}, not publishing.` };
  if (post.externalPostId) {
    // Published on Threads already (a previous run crashed before updating status): just record it.
    await deps.store.markPublished(post, post.externalPostId);
    return { action: "skip", reason: "Already published." };
  }
  return { action: "go", attemptNumber: await deps.store.startAttempt(post) };
}

/** Stage 2: quota check, then create (or reuse) the Threads container. */
export async function ensureContainer(deps: Deps, postId: string): Promise<ContainerResult> {
  const { api, store } = deps;
  const now = deps.now?.() ?? new Date();
  const post = await store.loadPost(postId);
  if (!post || post.status !== "publishing") throw new PublishFailure("invalid_request", "The post is no longer waiting to publish.", false);
  const account = await store.loadAccount(post.userId);
  if (!account) throw new PublishFailure("not_connected", "No Threads account is connected. Connect one in Settings.", false);

  try {
    if (post.externalContainerId) return { kind: "ready", containerId: post.externalContainerId, hasMedia: post.mediaPaths.length > 0 };

    const limit = await api.getPublishingLimit(account.token, account.threadsUserId);
    if (limit.used >= limit.total) return { kind: "deferred", until: new Date(now.getTime() + QUOTA_RETRY_MINUTES * 60_000).toISOString() };

    let containerId: string;
    if (post.mediaPaths.length === 0) {
      containerId = await api.createContainer(account.token, account.threadsUserId, { mediaType: "TEXT", text: post.content });
    } else {
      const urls = await store.signMediaUrls(post.mediaPaths);
      if (urls.length !== post.mediaPaths.length) throw new PublishFailure("invalid_request", "An attached image could not be found.", false);
      const text = post.content.trim() || undefined;
      if (urls.length === 1) {
        containerId = await api.createContainer(account.token, account.threadsUserId, { mediaType: "IMAGE", imageUrl: urls[0] as string, text });
      } else {
        const childIds: string[] = [];
        for (const imageUrl of urls) {
          childIds.push(await api.createContainer(account.token, account.threadsUserId, { mediaType: "IMAGE", imageUrl, isCarouselItem: true }));
        }
        // The carousel itself is created later, once Threads has finished processing every image.
        return { kind: "children", childIds };
      }
    }
    const saved = await store.saveContainer(post, containerId, account.id);
    if (!saved) throw new PublishFailure("invalid_request", "The post changed while it was being prepared.", false);
    return { kind: "ready", containerId, hasMedia: post.mediaPaths.length > 0 };
  } catch (err) {
    throw translate(err, account.id, store);
  }
}

/** Carousel stage A: is one carousel image processed? If Threads will not report a status, fall back to waiting. */
export async function checkChildContainer(deps: Deps, postId: string, childId: string): Promise<ChildCheckResult> {
  const post = await deps.store.loadPost(postId);
  if (!post || post.status !== "publishing") throw new PublishFailure("invalid_request", "The post is no longer waiting to publish.", false);
  const account = await deps.store.loadAccount(post.userId);
  if (!account) throw new PublishFailure("not_connected", "No Threads account is connected. Connect one in Settings.", false);
  try {
    const { status, errorMessage } = await deps.api.getContainerStatus(account.token, childId);
    return { status: assertUsable(status, errorMessage) === "IN_PROGRESS" ? "IN_PROGRESS" : "FINISHED" };
  } catch (err) {
    if (err instanceof ThreadsApiError && err.kind !== "unauthorized") return { status: "UNKNOWN" };
    throw translate(err, account.id, deps.store);
  }
}

/** Carousel stage B: create the carousel container from processed images, and remember its id. */
export async function createCarousel(deps: Deps, postId: string, childIds: string[]): Promise<{ kind: "ready"; containerId: string; hasMedia: true }> {
  const { api, store } = deps;
  const post = await store.loadPost(postId);
  if (!post || post.status !== "publishing") throw new PublishFailure("invalid_request", "The post is no longer waiting to publish.", false);
  const account = await store.loadAccount(post.userId);
  if (!account) throw new PublishFailure("not_connected", "No Threads account is connected. Connect one in Settings.", false);
  try {
    if (post.externalContainerId) return { kind: "ready", containerId: post.externalContainerId, hasMedia: true };
    const containerId = await api.createContainer(account.token, account.threadsUserId, { mediaType: "CAROUSEL", children: childIds, text: post.content.trim() || undefined });
    const saved = await store.saveContainer(post, containerId, account.id);
    if (!saved) throw new PublishFailure("invalid_request", "The post changed while it was being prepared.", false);
    return { kind: "ready", containerId, hasMedia: true };
  } catch (err) {
    throw translate(err, account.id, store);
  }
}

/** Stage 3: is the container ready? Throws for ERROR/EXPIRED. */
export async function checkContainer(deps: Deps, postId: string, containerId: string): Promise<CheckResult> {
  const post = await deps.store.loadPost(postId);
  if (!post || post.status !== "publishing") throw new PublishFailure("invalid_request", "The post is no longer waiting to publish.", false);
  const account = await deps.store.loadAccount(post.userId);
  if (!account) throw new PublishFailure("not_connected", "No Threads account is connected. Connect one in Settings.", false);
  try {
    const { status, errorMessage } = await deps.api.getContainerStatus(account.token, containerId);
    return { status: assertUsable(status, errorMessage) };
  } catch (err) {
    throw translate(err, account.id, deps.store);
  }
}

function assertUsable(status: ContainerStatus, errorMessage: string | null): CheckResult["status"] {
  if (status === "ERROR") throw new PublishFailure("container_failed", `Threads could not process the post${errorMessage ? `: ${errorMessage}` : "."}`, false);
  if (status === "EXPIRED") throw new PublishFailure("container_failed", "The Threads draft expired before it was published.", false);
  return status;
}

/** Stage 4: publish (once). Rechecks ownership state, authorization, and the container status first. */
export async function publish(deps: Deps, postId: string, containerId: string): Promise<PublishResult> {
  const { api, store } = deps;
  const post = await store.loadPost(postId);
  if (!post || post.status !== "publishing") return { kind: "skipped", reason: "The post is no longer waiting to publish." };
  if (post.externalPostId) {
    await store.markPublished(post, post.externalPostId);
    return { kind: "published", externalPostId: post.externalPostId };
  }
  const account = await store.loadAccount(post.userId);
  if (!account) throw new PublishFailure("not_connected", "No Threads account is connected. Connect one in Settings.", false);
  try {
    const { status, errorMessage } = await api.getContainerStatus(account.token, containerId);
    const usable = assertUsable(status, errorMessage);
    if (usable === "PUBLISHED") {
      // A previous attempt published but we never recorded it. Do not publish again.
      await store.markPublished(post, null);
      return { kind: "published", externalPostId: null };
    }
    if (usable === "IN_PROGRESS") throw new PublishFailure("provider_error", "Threads is still processing the post.", true);
    const externalPostId = await api.publishContainer(account.token, account.threadsUserId, containerId);
    await store.markPublished(post, externalPostId);
    return { kind: "published", externalPostId };
  } catch (err) {
    throw translate(err, account.id, store);
  }
}

/** Terminal bookkeeping used by the job wrapper. */
export async function recordSuccess(deps: Deps, postId: string): Promise<void> {
  const post = await deps.store.loadPost(postId);
  if (post) await deps.store.finishAttempt(post, "succeeded", null, null);
}

export async function recordFailure(deps: Deps, postId: string, failure: { code: string; message: string }): Promise<void> {
  const post = await deps.store.loadPost(postId);
  if (!post) return;
  if (post.status === "publishing") await deps.store.markFailed(post, failure.message);
  await deps.store.finishAttempt(post, "failed", failure.code, failure.message);
}

export async function recordDeferred(deps: Deps, postId: string, until: string): Promise<void> {
  const post = await deps.store.loadPost(postId);
  if (!post || post.status !== "publishing") return;
  await deps.store.deferPost(post, new Date(until), "Delayed: the Threads daily publishing limit was reached.");
  await deps.store.finishAttempt(post, "failed", "rate_limited", "Daily publishing limit reached; rescheduled automatically.");
}
