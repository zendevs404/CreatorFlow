import { describe, expect, it } from "vitest";
import { canSchedule, isRefreshDue } from "@/lib/threads/accounts";

const DAY = 86_400_000;
const now = new Date("2026-10-20T00:00:00Z");
const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();
const acct = (o: Partial<Parameters<typeof isRefreshDue>[0]> = {}) => ({
  token_refreshed_at: iso(-30 * DAY),
  connected_at: iso(-30 * DAY),
  token_expires_at: iso(30 * DAY),
  needs_reauth: false,
  revoked_at: null,
  ...o,
});

describe("token refresh timing (Meta: >= 24h old, not expired, 60-day tokens)", () => {
  it("refreshes tokens with under 20 days left", () => {
    expect(isRefreshDue(acct({ token_expires_at: iso(10 * DAY) }), now)).toBe(true);
  });
  it("waits while the token has plenty of life left", () => {
    expect(isRefreshDue(acct({ token_refreshed_at: iso(-5 * DAY), token_expires_at: iso(55 * DAY) }), now)).toBe(false);
  });
  it("never refreshes a token younger than 24 hours", () => {
    expect(isRefreshDue(acct({ token_refreshed_at: iso(-2 * 3_600_000), token_expires_at: iso(10 * DAY) }), now)).toBe(false);
  });
  it("does not try to refresh expired, revoked, or flagged accounts", () => {
    expect(isRefreshDue(acct({ token_expires_at: iso(-1000) }), now)).toBe(false);
    expect(isRefreshDue(acct({ revoked_at: iso(-DAY) }), now)).toBe(false);
    expect(isRefreshDue(acct({ needs_reauth: true }), now)).toBe(false);
  });
});

describe("canSchedule", () => {
  it("needs a connected, valid, unflagged account", () => {
    expect(canSchedule({ status: "disconnected" }, now)).toBe(false);
    expect(canSchedule({ status: "connected", username: "a", expiresAt: iso(DAY), needsReauth: false, lastError: null }, now)).toBe(true);
    expect(canSchedule({ status: "connected", username: "a", expiresAt: iso(-DAY), needsReauth: false, lastError: null }, now)).toBe(false);
    expect(canSchedule({ status: "connected", username: "a", expiresAt: iso(DAY), needsReauth: true, lastError: null }, now)).toBe(false);
  });
});
