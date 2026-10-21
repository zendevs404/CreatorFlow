import { beforeEach, describe, expect, it, vi } from "vitest";
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
  type AccountSnapshot,
  type Deps,
  type PostSnapshot,
  type PublishStore,
} from "@/lib/publishing/pipeline";
import { ThreadsApiError, type ContainerStatus, type ThreadsApi } from "@/lib/threads/api";

type StatusReply = { status: ContainerStatus; errorMessage: string | null };

const POST = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-20T10:00:00Z");

function setup(over: Partial<PostSnapshot> = {}, account: AccountSnapshot | null = { id: "acc1", threadsUserId: "U1", token: "TOKEN" }) {
  const state: { post: PostSnapshot | null; events: string[] } = {
    post: { id: POST, userId: "user1", status: "publishing", content: "Hello Threads", externalContainerId: null, externalPostId: null, mediaPaths: [], ...over },
    events: [],
  };
  const store: PublishStore = {
    loadPost: vi.fn(async () => (state.post ? { ...state.post } : null)),
    loadAccount: vi.fn(async () => account),
    signMediaUrls: vi.fn(async (paths: string[]) => paths.map((p) => `https://signed.example/${p}`)),
    saveContainer: vi.fn(async (post, containerId) => {
      if (!state.post || state.post.status !== "publishing") return false;
      state.post.externalContainerId = containerId;
      return true;
    }),
    markPublished: vi.fn(async (_post, externalPostId) => {
      if (!state.post || state.post.status !== "publishing") return false;
      state.post.status = "published";
      state.post.externalPostId = externalPostId;
      state.events.push("published");
      return true;
    }),
    markFailed: vi.fn(async () => {
      if (state.post?.status === "publishing") state.post.status = "failed";
    }),
    deferPost: vi.fn(async () => {
      if (state.post) state.post.status = "scheduled";
    }),
    flagAccountNeedsReauth: vi.fn(async () => undefined),
    startAttempt: vi.fn(async () => 1),
    finishAttempt: vi.fn(async () => undefined),
  };
  const api = {
    getPublishingLimit: vi.fn(async () => ({ used: 3, total: 250 })),
    createContainer: vi.fn(async (_t: string, _u: string, p: { mediaType: string }) => (p.mediaType === "CAROUSEL" ? "CAROUSEL1" : `C${api.createContainer.mock.calls.length}`)),
    getContainerStatus: vi.fn(async (): Promise<StatusReply> => ({ status: "FINISHED", errorMessage: null })),
    publishContainer: vi.fn(async () => "MEDIA1"),
  };
  const deps: Deps = { api: api as unknown as ThreadsApi, store, now: () => NOW };
  return { state, store, api, deps };
}

beforeEach(() => vi.clearAllMocks());

describe("happy paths", () => {
  it("publishes a text post: container -> ready -> publish once -> published", async () => {
    const { deps, api, state } = setup();
    expect(await prepare(deps, POST)).toEqual({ action: "go", attemptNumber: 1 });
    const c = await ensureContainer(deps, POST);
    expect(c).toEqual({ kind: "ready", containerId: "C1", hasMedia: false });
    expect(api.createContainer).toHaveBeenCalledWith("TOKEN", "U1", { mediaType: "TEXT", text: "Hello Threads" });
    expect((await checkContainer(deps, POST, "C1")).status).toBe("FINISHED");
    expect(await publish(deps, POST, "C1")).toEqual({ kind: "published", externalPostId: "MEDIA1" });
    expect(api.publishContainer).toHaveBeenCalledTimes(1);
    expect(state.post?.status).toBe("published");
  });

  it("publishes a single image as an IMAGE container with signed URL and caption", async () => {
    const { deps, api } = setup({ mediaPaths: ["u/a.png"] });
    const c = await ensureContainer(deps, POST);
    expect(c).toMatchObject({ kind: "ready", hasMedia: true });
    expect(api.createContainer).toHaveBeenCalledWith("TOKEN", "U1", { mediaType: "IMAGE", imageUrl: "https://signed.example/u/a.png", text: "Hello Threads" });
  });

  it("creates carousel images first, then the carousel only once they are processed", async () => {
    const { deps, api, store } = setup({ mediaPaths: ["u/a.png", "u/b.jpg", "u/c.png"] });
    const created = await ensureContainer(deps, POST);
    expect(created).toEqual({ kind: "children", childIds: ["C1", "C2", "C3"] });
    const calls = api.createContainer.mock.calls.map((x) => x[2]);
    expect(calls).toHaveLength(3);
    expect(calls.every((p) => p.mediaType === "IMAGE" && (p as { isCarouselItem?: boolean }).isCarouselItem)).toBe(true);
    expect(store.saveContainer).not.toHaveBeenCalled();

    const carousel = await createCarousel(deps, POST, ["C1", "C2", "C3"]);
    expect(carousel).toEqual({ kind: "ready", containerId: "CAROUSEL1", hasMedia: true });
    expect(api.createContainer.mock.calls[3]?.[2]).toMatchObject({ mediaType: "CAROUSEL", children: ["C1", "C2", "C3"], text: "Hello Threads" });
    expect(store.saveContainer).toHaveBeenCalledTimes(1);
  });

  it("reuses a saved carousel container instead of creating another", async () => {
    const { deps, api } = setup({ mediaPaths: ["u/a.png", "u/b.png"], externalContainerId: "SAVED" });
    expect(await createCarousel(deps, POST, ["C1", "C2"])).toMatchObject({ containerId: "SAVED" });
    expect(api.createContainer).not.toHaveBeenCalled();
  });

  it("reports carousel image status: in progress, finished, or unknown when Threads gives none", async () => {
    const { deps, api } = setup({ mediaPaths: ["u/a.png", "u/b.png"] });
    api.getContainerStatus.mockResolvedValueOnce({ status: "IN_PROGRESS", errorMessage: null });
    expect(await checkChildContainer(deps, POST, "C1")).toEqual({ status: "IN_PROGRESS" });
    expect(await checkChildContainer(deps, POST, "C1")).toEqual({ status: "FINISHED" });
    api.getContainerStatus.mockRejectedValueOnce(new ThreadsApiError("invalid_request", "no status field", 400));
    expect(await checkChildContainer(deps, POST, "C1")).toEqual({ status: "UNKNOWN" });
  });

  it("fails permanently when a carousel image has a processing ERROR, and rejects bad tokens", async () => {
    const { deps, api } = setup({ mediaPaths: ["u/a.png", "u/b.png"] });
    api.getContainerStatus.mockResolvedValueOnce({ status: "ERROR", errorMessage: "INVALID_ASPEC_RATIO" });
    await expect(checkChildContainer(deps, POST, "C1")).rejects.toMatchObject({ code: "container_failed", retryable: false });
    api.getContainerStatus.mockRejectedValueOnce(new ThreadsApiError("unauthorized", "bad token", 401));
    await expect(checkChildContainer(deps, POST, "C1")).rejects.toMatchObject({ code: "unauthorized", retryable: false });
  });

  it("retries (instead of failing) when Threads says a carousel image is not ready yet", async () => {
    const { deps, api } = setup({ mediaPaths: ["u/a.png", "u/b.png"] });
    api.createContainer.mockRejectedValue(new ThreadsApiError("invalid_request", "Invalid parameter", 400, { operation: "create the carousel container", code: 100, subcode: 4279004 }));
    await expect(createCarousel(deps, POST, ["C1", "C2"])).rejects.toMatchObject({ code: "provider_error", retryable: true });
  });
});

describe("never publishes what it should not", () => {
  it.each(["cancelled", "scheduled", "draft", "published", "failed"])("skips a %s post without calling Threads", async (status) => {
    const { deps, api } = setup({ status });
    expect((await prepare(deps, POST)).action).toBe("skip");
    await expect(ensureContainer(deps, POST)).rejects.toBeInstanceOf(PublishFailure);
    expect(await publish(deps, POST, "C1")).toMatchObject({ kind: "skipped" });
    expect(api.createContainer).not.toHaveBeenCalled();
    expect(api.publishContainer).not.toHaveBeenCalled();
  });

  it("skips a post that was deleted", async () => {
    const { deps, state, api } = setup();
    state.post = null;
    expect((await prepare(deps, POST)).action).toBe("skip");
    expect(await publish(deps, POST, "C1")).toMatchObject({ kind: "skipped" });
    expect(api.publishContainer).not.toHaveBeenCalled();
  });

  it("stops if the post is cancelled between preparing and publishing", async () => {
    const { deps, state, api } = setup();
    await ensureContainer(deps, POST);
    if (state.post) state.post.status = "cancelled";
    expect(await publish(deps, POST, "C1")).toMatchObject({ kind: "skipped" });
    expect(api.publishContainer).not.toHaveBeenCalled();
  });
});

describe("duplicate prevention on retries", () => {
  it("reuses the stored container instead of creating another", async () => {
    const { deps, api } = setup({ externalContainerId: "EXISTING" });
    expect(await ensureContainer(deps, POST)).toMatchObject({ containerId: "EXISTING" });
    expect(api.createContainer).not.toHaveBeenCalled();
  });

  it("does not publish again when Threads says the container is already PUBLISHED", async () => {
    const { deps, api, state } = setup({ externalContainerId: "C1" });
    api.getContainerStatus.mockResolvedValue({ status: "PUBLISHED", errorMessage: null });
    expect(await publish(deps, POST, "C1")).toEqual({ kind: "published", externalPostId: null });
    expect(api.publishContainer).not.toHaveBeenCalled();
    expect(state.post?.status).toBe("published");
  });

  it("records an already-known Threads post id without calling Threads", async () => {
    const { deps, api, state } = setup({ externalPostId: "MEDIA9" });
    expect((await prepare(deps, POST)).action).toBe("skip");
    expect(state.post?.status).toBe("published");
    expect(api.publishContainer).not.toHaveBeenCalled();
  });

  it("two concurrent publish calls cannot both mark the post published", async () => {
    const { deps, store } = setup();
    const [a, b] = await Promise.all([publish(deps, POST, "C1"), publish(deps, POST, "C1")]);
    expect([a, b].filter((r) => r.kind === "published").length).toBeGreaterThanOrEqual(1);
    const results = await Promise.all((store.markPublished as ReturnType<typeof vi.fn>).mock.results.map((r) => r.value as Promise<boolean>));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("failures", () => {
  it("fails without a connected account (not retryable)", async () => {
    const { deps } = setup({}, null);
    await expect(ensureContainer(deps, POST)).rejects.toMatchObject({ code: "not_connected", retryable: false });
  });

  it("flags the account and does not retry when Threads rejects the token", async () => {
    const { deps, api, store } = setup();
    api.createContainer.mockRejectedValue(new ThreadsApiError("unauthorized", "bad token", 401));
    await expect(ensureContainer(deps, POST)).rejects.toMatchObject({ code: "unauthorized", retryable: false });
    expect(store.flagAccountNeedsReauth).toHaveBeenCalledWith("acc1", expect.any(String));
  });

  it("treats rate limits and provider outages as retryable, bad requests as final", async () => {
    const a = setup();
    a.api.createContainer.mockRejectedValue(new ThreadsApiError("rate_limited", "slow", 429));
    await expect(ensureContainer(a.deps, POST)).rejects.toMatchObject({ code: "rate_limited", retryable: true });
    const b = setup();
    b.api.createContainer.mockRejectedValue(new ThreadsApiError("provider_error", "down", 503));
    await expect(ensureContainer(b.deps, POST)).rejects.toMatchObject({ retryable: true });
    const c = setup();
    c.api.createContainer.mockRejectedValue(new ThreadsApiError("invalid_request", "Invalid parameter", 400, { operation: "create the text container", code: 100 }));
    const failure = await ensureContainer(c.deps, POST).catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: "invalid_request", retryable: false });
    expect((failure as Error).message).toBe("Threads rejected the request when trying to create the text container: Invalid parameter [code 100]");
  });

  it("defers (does not fail) when the 250/24h quota is used up", async () => {
    const { deps, api, state } = setup();
    api.getPublishingLimit.mockResolvedValue({ used: 250, total: 250 });
    const r = await ensureContainer(deps, POST);
    expect(r).toEqual({ kind: "deferred", until: "2026-10-20T10:30:00.000Z" });
    expect(api.createContainer).not.toHaveBeenCalled();
    await recordDeferred(deps, POST, "2026-10-20T10:30:00.000Z");
    expect(state.post?.status).toBe("scheduled");
  });

  it("fails permanently when Threads reports a processing ERROR or EXPIRED container", async () => {
    const { deps, api } = setup();
    api.getContainerStatus.mockResolvedValue({ status: "ERROR", errorMessage: "INVALID_ASPEC_RATIO" });
    await expect(checkContainer(deps, POST, "C1")).rejects.toMatchObject({ code: "container_failed", retryable: false });
    api.getContainerStatus.mockResolvedValue({ status: "EXPIRED", errorMessage: null });
    await expect(publish(deps, POST, "C1")).rejects.toMatchObject({ code: "container_failed" });
    expect(api.publishContainer).not.toHaveBeenCalled();
  });

  it("will not publish while the container is still IN_PROGRESS (retryable)", async () => {
    const { deps, api } = setup();
    api.getContainerStatus.mockResolvedValue({ status: "IN_PROGRESS", errorMessage: null });
    await expect(publish(deps, POST, "C1")).rejects.toMatchObject({ retryable: true });
    expect(api.publishContainer).not.toHaveBeenCalled();
  });

  it("marks a failed post failed with a reason, but never touches a published one", async () => {
    const a = setup();
    await recordFailure(a.deps, POST, { code: "invalid_request", message: "Threads rejected the post: bad image" });
    expect(a.state.post?.status).toBe("failed");
    expect(a.store.finishAttempt).toHaveBeenCalledWith(expect.anything(), "failed", "invalid_request", expect.stringContaining("bad image"));
    const b = setup({ status: "published" });
    await recordFailure(b.deps, POST, { code: "x", message: "late failure" });
    expect(b.state.post?.status).toBe("published");
    expect(b.store.markFailed).not.toHaveBeenCalled();
  });
});
