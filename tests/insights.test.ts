import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encryptToken } from "@/lib/crypto/tokens";
import { refreshInsights } from "@/lib/insights/service";
import { createThreadsApi, readInsightValues, ThreadsApiError, type ThreadsApi } from "@/lib/threads/api";
import { fakeAdmin } from "./fake-admin";

const KEY = randomBytes(32).toString("base64");
const USER = "u1";
const NOW = new Date("2026-10-21T10:00:00Z");
const account = (over: Record<string, unknown> = {}) => ({
  id: "acc1",
  user_id: USER,
  threads_user_id: "T1",
  access_token_ciphertext: encryptToken("TOKEN", KEY, `${USER}:T1`),
  revoked_at: null,
  needs_reauth: false,
  insights_enabled: true,
  connected_at: "2026-10-01T00:00:00Z",
  ...over,
});
const posts = [
  { id: "p1", user_id: USER, status: "published", external_post_id: "M1", published_at: "2026-10-20T00:00:00Z" },
  { id: "p2", user_id: USER, status: "published", external_post_id: "M2", published_at: "2026-10-19T00:00:00Z" },
  { id: "p3", user_id: USER, status: "published", external_post_id: null, published_at: "2026-10-18T00:00:00Z" },
  { id: "p4", user_id: USER, status: "draft", external_post_id: null, published_at: null },
];

function fakeApi() {
  return {
    getUserInsights: vi.fn(async (_t: string, _u: string, metrics: readonly string[]) =>
      metrics.includes("followers_count") ? { followers_count: 42 } : { views: 1000, likes: 50, replies: 7, reposts: 3, quotes: null },
    ),
    getMediaInsights: vi.fn(async (_t: string, id: string) => (id === "M1" ? { views: 10, likes: 2, replies: 1, reposts: 0, quotes: 0 } : { views: null, likes: 5, replies: null, reposts: null, quotes: null })),
  };
}
const run = (tables: Record<string, Record<string, unknown>[]>, api: ReturnType<typeof fakeApi>, opts = {}) => {
  const f = fakeAdmin(tables);
  return { ...f, result: refreshInsights(f.admin, api as unknown as ThreadsApi, KEY, USER, { now: NOW, ...opts }) };
};

describe("readInsightValues (Meta response shapes)", () => {
  it("reads lifetime values, total_value, and sums time series; missing metrics stay null", () => {
    const body = {
      data: [
        { name: "likes", period: "lifetime", values: [{ value: 100 }] },
        { name: "views", period: "day", values: [{ value: 10, end_time: "a" }, { value: 20, end_time: "b" }] },
        { name: "followers_count", total_value: { value: 7 } },
      ],
    };
    expect(readInsightValues(body, ["likes", "views", "followers_count", "quotes"])).toEqual({ likes: 100, views: 30, followers_count: 7, quotes: null });
  });
  it("returns all-null for an empty array (e.g. reposts of other users' posts)", () => {
    expect(readInsightValues({ data: [] }, ["likes"])).toEqual({ likes: null });
  });
});

describe("insights API requests (mocked Meta)", () => {
  it("calls the documented endpoints with the metric list", async () => {
    const f = vi.fn(async (_u: RequestInfo | URL) => new Response(JSON.stringify({ data: [{ name: "likes", values: [{ value: 1 }] }] })));
    const api = createThreadsApi({ fetch: f as unknown as typeof fetch });
    await api.getMediaInsights("T", "M1", ["views", "likes"]);
    expect(String(f.mock.calls[0]?.[0])).toMatch(/^https:\/\/graph\.threads\.net\/v1\.0\/M1\/insights\?metric=views%2Clikes&access_token=T$/);
    await api.getUserInsights("T", "U1", ["views"], { since: 100, until: 200 });
    expect(String(f.mock.calls[1]?.[0])).toContain("/v1.0/U1/threads_insights?");
    expect(String(f.mock.calls[1]?.[0])).toContain("since=100&until=200");
  });
});

describe("refreshInsights", () => {
  it("skips without a connection, without the permission, or when reauth is needed", async () => {
    expect(await run({ threads_accounts: [] }, fakeApi()).result).toEqual({ status: "skipped", reason: "not_connected" });
    expect(await run({ threads_accounts: [account({ insights_enabled: false })] }, fakeApi()).result).toEqual({ status: "skipped", reason: "insights_disabled" });
    expect(await run({ threads_accounts: [account({ needs_reauth: true })] }, fakeApi()).result).toEqual({ status: "skipped", reason: "needs_reauth" });
  });

  it("stores exactly what Threads returned, with nulls for missing metrics, only for published posts with an id", async () => {
    const api = fakeApi();
    const { result, calls } = run({ threads_accounts: [account()], account_insights: [], posts }, api);
    expect(await result).toMatchObject({ status: "ok", postsUpdated: 2, postsFailed: 0, accountUpdated: true });
    const acct = calls.upserts.find((u) => u.table === "account_insights")?.row;
    expect(acct).toMatchObject({ followers_count: 42, views_7d: 1000, likes_7d: 50, replies_7d: 7, reposts_7d: 3, quotes_7d: null });
    const stored = calls.upserts.filter((u) => u.table === "post_insights").map((u) => u.row);
    expect(stored).toHaveLength(2);
    expect(stored.find((r) => r.post_id === "p1")).toMatchObject({ views: 10, likes: 2 });
    expect(stored.find((r) => r.post_id === "p2")).toMatchObject({ views: null, likes: 5, replies: null });
    expect(api.getMediaInsights).not.toHaveBeenCalledWith(expect.anything(), "null", expect.anything());
    expect(api.getMediaInsights).toHaveBeenCalledTimes(2);
  });

  it("is throttled to once per 15 minutes unless forced", async () => {
    const recent = [{ user_id: USER, fetched_at: new Date(NOW.getTime() - 5 * 60_000).toISOString() }];
    expect(await run({ threads_accounts: [account()], account_insights: recent, posts }, fakeApi()).result).toEqual({ status: "skipped", reason: "fresh" });
    expect((await run({ threads_accounts: [account()], account_insights: recent, posts }, fakeApi(), { force: true }).result).status).toBe("ok");
    const old = [{ user_id: USER, fetched_at: new Date(NOW.getTime() - 20 * 60_000).toISOString() }];
    expect((await run({ threads_accounts: [account()], account_insights: old, posts }, fakeApi()).result).status).toBe("ok");
  });

  it("counts a failing post but keeps going", async () => {
    const api = fakeApi();
    api.getMediaInsights.mockRejectedValueOnce(new ThreadsApiError("invalid_request", "bad", 400));
    const r = await run({ threads_accounts: [account()], account_insights: [], posts }, api).result;
    expect(r).toMatchObject({ status: "ok", postsUpdated: 1, postsFailed: 1 });
  });

  it("flags the account when Threads rejects the token, and backs off on rate limits", async () => {
    const bad = fakeApi();
    bad.getUserInsights.mockRejectedValue(new ThreadsApiError("unauthorized", "bad token", 401));
    const a = run({ threads_accounts: [account()], account_insights: [], posts }, bad);
    expect(await a.result).toEqual({ status: "skipped", reason: "needs_reauth" });
    expect(a.calls.updates.some((u) => u.table === "threads_accounts" && u.patch.needs_reauth === true)).toBe(true);

    const slow = fakeApi();
    slow.getMediaInsights.mockRejectedValue(new ThreadsApiError("rate_limited", "slow", 429));
    expect(await run({ threads_accounts: [account()], account_insights: [], posts }, slow).result).toEqual({ status: "skipped", reason: "rate_limited" });
  });

  it("never stores or logs the token", async () => {
    const { result, calls } = run({ threads_accounts: [account()], account_insights: [], posts }, fakeApi());
    await result;
    expect(JSON.stringify(calls)).not.toContain("TOKEN");
  });
});
