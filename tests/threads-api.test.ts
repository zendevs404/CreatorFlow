import { describe, expect, it, vi } from "vitest";
import { createThreadsApi, ThreadsApiError } from "@/lib/threads/api";

function mockFetch(status: number, body: string | object) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}
const api = (f: ReturnType<typeof mockFetch>) => createThreadsApi({ fetch: f as unknown as typeof fetch });
const bodyOf = (f: ReturnType<typeof mockFetch>) => Object.fromEntries((f.mock.calls[0]?.[1]?.body as URLSearchParams | FormData).entries());

describe("Threads API client (mocked Meta)", () => {
  it("exchanges the authorization code and keeps 17-digit user ids exact", async () => {
    const f = mockFetch(200, '{"access_token":"SHORT","token_type":"bearer","user_id":17841405793187218}');
    const r = await api(f).exchangeCode({ appId: "1", appSecret: "sec", code: "AQB", redirectUri: "https://x/cb" });
    expect(r).toEqual({ accessToken: "SHORT", userId: "17841405793187218" });
    expect(f.mock.calls[0]?.[0]).toBe("https://graph.threads.com/oauth/access_token");
    expect(bodyOf(f)).toMatchObject({ grant_type: "authorization_code", code: "AQB", redirect_uri: "https://x/cb", client_id: "1" });
  });

  it("exchanges and refreshes long-lived tokens with the documented grant types", async () => {
    const f = mockFetch(200, { access_token: "LONG", token_type: "bearer", expires_in: 5183944 });
    expect(await api(f).exchangeForLongLived({ appSecret: "sec", shortLivedToken: "SHORT" })).toEqual({ accessToken: "LONG", expiresInSeconds: 5183944 });
    expect(String(f.mock.calls[0]?.[0])).toContain("grant_type=th_exchange_token");
    const g = mockFetch(200, { access_token: "LONG2", token_type: "bearer", expires_in: 5183944 });
    await api(g).refreshLongLived("LONG");
    expect(String(g.mock.calls[0]?.[0])).toContain("refresh_access_token?grant_type=th_refresh_token");
  });

  it("creates a TEXT container and sends the token in the body, not the URL", async () => {
    const f = mockFetch(200, { id: "C1" });
    expect(await api(f).createContainer("TOK", "U1", { mediaType: "TEXT", text: "hi" })).toBe("C1");
    expect(f.mock.calls[0]?.[0]).toBe("https://graph.threads.net/v1.0/U1/threads");
    expect(bodyOf(f)).toEqual({ media_type: "TEXT", text: "hi", access_token: "TOK" });
  });

  it("creates image, carousel-item and carousel containers", async () => {
    const f = mockFetch(200, { id: "C" });
    await api(f).createContainer("T", "U", { mediaType: "IMAGE", imageUrl: "https://i/1.png", text: "cap" });
    expect(bodyOf(f)).toMatchObject({ media_type: "IMAGE", image_url: "https://i/1.png", text: "cap" });
    const g = mockFetch(200, { id: "C" });
    await api(g).createContainer("T", "U", { mediaType: "IMAGE", imageUrl: "https://i/1.png", isCarouselItem: true });
    expect(bodyOf(g)).toMatchObject({ is_carousel_item: "true" });
    const h = mockFetch(200, { id: "C" });
    await api(h).createContainer("T", "U", { mediaType: "CAROUSEL", children: ["a", "b"], text: "t" });
    expect(bodyOf(h)).toMatchObject({ media_type: "CAROUSEL", children: "a,b", text: "t" });
  });

  it("publishes with creation_id and reads container status", async () => {
    const f = mockFetch(200, { id: "M1" });
    expect(await api(f).publishContainer("T", "U", "C1")).toBe("M1");
    expect(f.mock.calls[0]?.[0]).toBe("https://graph.threads.net/v1.0/U/threads_publish");
    expect(bodyOf(f)).toMatchObject({ creation_id: "C1" });
    const g = mockFetch(200, { id: "C1", status: "FINISHED" });
    expect(await api(g).getContainerStatus("T", "C1")).toEqual({ status: "FINISHED", errorMessage: null });
    const h = mockFetch(200, { id: "C1", status: "ERROR", error_message: "INVALID_ASPEC_RATIO" });
    expect(await api(h).getContainerStatus("T", "C1")).toEqual({ status: "ERROR", errorMessage: "INVALID_ASPEC_RATIO" });
  });

  it("reads the publishing quota", async () => {
    const f = mockFetch(200, { data: [{ quota_usage: 12, config: { quota_total: 250, quota_duration: 86400 } }] });
    expect(await api(f).getPublishingLimit("T", "U")).toEqual({ used: 12, total: 250 });
  });

  it("rejects responses that are missing required fields", async () => {
    await expect(api(mockFetch(200, {})).publishContainer("T", "U", "C")).rejects.toMatchObject({ kind: "provider_error" });
    await expect(api(mockFetch(200, { status: "WEIRD" })).getContainerStatus("T", "C")).rejects.toMatchObject({ kind: "provider_error" });
  });

  it.each([
    [401, { error: { message: "bad token", type: "OAuthException", code: 190 } }, "unauthorized", false],
    [400, { error: { message: "token expired", type: "OAuthException", code: 190 } }, "unauthorized", false],
    [429, { error: { message: "slow down" } }, "rate_limited", true],
    [503, { error: { message: "down" } }, "provider_error", true],
    [400, { error: { message: "Invalid image", type: "OAuthException", code: 100 } }, "invalid_request", false],
  ])("classifies HTTP %i as %s (retryable=%s)", async (status, body, kind, retryable) => {
    const err = await api(mockFetch(status, body)).publishContainer("T", "U", "C").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ThreadsApiError);
    expect(err).toMatchObject({ kind, retryable });
  });

  it("surfaces the OAuth error shape from the token endpoint", async () => {
    const err = await api(mockFetch(400, { error_type: "OAuthException", code: 400, error_message: "Matching code was not found or was already used" }))
      .exchangeCode({ appId: "1", appSecret: "s", code: "x", redirectUri: "r" })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "invalid_request" });
    expect((err as Error).message).toContain("already used");
  });

  it("sends publishing requests form-encoded, as Meta documents", async () => {
    const f = mockFetch(200, { id: "C" });
    await api(f).createContainer("T", "U", { mediaType: "TEXT", text: "hi" });
    expect(f.mock.calls[0]?.[1]?.body).toBeInstanceOf(URLSearchParams);
    const g = mockFetch(200, { id: "M" });
    await api(g).publishContainer("T", "U", "C");
    expect(g.mock.calls[0]?.[1]?.body).toBeInstanceOf(URLSearchParams);
  });

  it("keeps Meta's error codes, user message and the failing operation", async () => {
    const f = mockFetch(400, { error: { message: "Invalid parameter", type: "OAuthException", code: 100, error_subcode: 4279009, error_user_msg: "The image could not be fetched.", fbtrace_id: "ABC123" } });
    const err = await api(f).createContainer("T", "U", { mediaType: "IMAGE", imageUrl: "https://i/1.png" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ThreadsApiError);
    expect(err).toMatchObject({ kind: "invalid_request", detail: { operation: "create the image container", code: 100, subcode: 4279009, fbtraceId: "ABC123" } });
    expect((err as Error).message).toContain("The image could not be fetched.");
  });

  it("reports network failures as retryable without leaking the URL or token", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed: https://graph.threads.net/?access_token=SECRET");
    });
    const err = await createThreadsApi({ fetch: f as unknown as typeof fetch }).getProfile("SECRET").catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "network", retryable: true });
    expect((err as Error).message).not.toContain("SECRET");
  });
});
