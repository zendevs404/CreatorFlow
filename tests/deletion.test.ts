// @vitest-environment node
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleDataDeletion, handleDeauthorize } from "@/lib/threads/deletion";
import { fakeAdmin } from "./fake-admin";

const SECRET = "route-test-secret";
const state = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.admin }));

function signed(payload: object, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${createHmac("sha256", secret).update(body).digest("base64url")}.${body}`;
}
function post(url: string, signedRequest?: string) {
  const form = new FormData();
  if (signedRequest) form.set("signed_request", signedRequest);
  return new NextRequest(url, { method: "POST", body: form });
}

describe("deletion services", () => {
  it("revokes tokens on deauthorize", async () => {
    const { admin, calls } = fakeAdmin({ threads_accounts: [{ id: "a1", threads_user_id: "T1", revoked_at: null }] });
    expect(await handleDeauthorize(admin, "T1")).toBe(1);
    expect(calls.updates[0]?.patch).toMatchObject({ access_token_ciphertext: null, token_expires_at: null });
  });

  it("deletes Threads-derived data and logs the request", async () => {
    const { admin, calls } = fakeAdmin({ threads_accounts: [{ id: "a1", user_id: "u1", threads_user_id: "T1" }] });
    const r = await handleDataDeletion(admin, "T1");
    expect(r.found).toBe(true);
    expect(r.confirmationCode).toMatch(/^[0-9a-f]{24}$/);
    expect(calls.deletes).toEqual(expect.arrayContaining(["post_insights", "account_insights", "threads_accounts"]));
    expect(calls.updates.find((u) => u.table === "posts")?.patch).toEqual({ external_post_id: null, external_container_id: null, threads_account_id: null });
    expect(calls.inserts[0]?.row).toMatchObject({ confirmation_code: r.confirmationCode, status: "completed" });
  });

  it("still answers (no_data) for an id we never stored", async () => {
    const { admin, calls } = fakeAdmin({ threads_accounts: [] });
    const r = await handleDataDeletion(admin, "unknown");
    expect(r.found).toBe(false);
    expect(calls.inserts[0]?.row).toMatchObject({ status: "no_data" });
  });
});

describe("Meta callback routes", () => {
  beforeEach(() => {
    vi.stubEnv("THREADS_APP_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
    state.admin = fakeAdmin({ threads_accounts: [{ id: "a1", user_id: "u1", threads_user_id: "T1" }] }).admin;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("data-deletion: valid signature returns the JSON Meta requires", async () => {
    const { POST } = await import("@/app/api/threads/data-deletion/route");
    const res = await POST(post("http://localhost:3000/api/threads/data-deletion", signed({ algorithm: "HMAC-SHA256", user_id: "T1" })));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; confirmation_code: string };
    expect(body.confirmation_code).toMatch(/^[0-9a-f]{24}$/);
    expect(body.url).toBe(`https://app.example.com/data-deletion?code=${body.confirmation_code}`);
  });

  it("rejects bad or missing signatures with 400 and does nothing", async () => {
    const { POST } = await import("@/app/api/threads/data-deletion/route");
    const { POST: deauth } = await import("@/app/api/threads/deauthorize/route");
    expect((await POST(post("http://x/api", signed({ user_id: "T1" }, "wrong")))).status).toBe(400);
    expect((await POST(post("http://x/api"))).status).toBe(400);
    expect((await deauth(post("http://x/api", "garbage"))).status).toBe(400);
  });

  it("deauthorize: valid signature revokes and returns 200", async () => {
    const { POST } = await import("@/app/api/threads/deauthorize/route");
    expect((await POST(post("http://x/api", signed({ user_id: "T1" })))).status).toBe(200);
  });

  it("answers 503 when the app secret is not configured", async () => {
    vi.stubEnv("THREADS_APP_SECRET", "");
    const { POST } = await import("@/app/api/threads/deauthorize/route");
    expect((await POST(post("http://x/api", signed({ user_id: "T1" })))).status).toBe(503);
  });
});
