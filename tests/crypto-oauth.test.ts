import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { buildAuthorizeUrl, createOAuthState, oauthStateMatches, redirectUriFor, threadsScopes } from "@/lib/threads/oauth";

const key = randomBytes(32).toString("base64");

describe("token encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const enc = encryptToken("THQVJ-secret-token", key, "user:1");
    expect(enc).not.toContain("THQVJ");
    expect(decryptToken(enc, key, "user:1")).toBe("THQVJ-secret-token");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptToken("t", key, "b")).not.toBe(encryptToken("t", key, "b"));
  });
  it("rejects a wrong key, a different binding, and tampering", () => {
    const enc = encryptToken("token", key, "user:1");
    expect(() => decryptToken(enc, randomBytes(32).toString("base64"), "user:1")).toThrow("could not be decrypted");
    expect(() => decryptToken(enc, key, "user:2")).toThrow("could not be decrypted");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."), key, "user:1")).toThrow("could not be decrypted");
  });
  it("refuses keys that are not 32 bytes", () => {
    expect(() => encryptToken("t", Buffer.from("short").toString("base64"), "b")).toThrow();
  });
});

describe("OAuth helpers", () => {
  it("generates unpredictable, url-safe state", () => {
    const a = createOAuthState();
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(a).not.toBe(createOAuthState());
  });
  it("matches state in constant time and rejects missing or different values", () => {
    expect(oauthStateMatches("abc", "abc")).toBe(true);
    expect(oauthStateMatches("abc", "abd")).toBe(false);
    expect(oauthStateMatches("abc", "abcd")).toBe(false);
    expect(oauthStateMatches(undefined, "abc")).toBe(false);
    expect(oauthStateMatches("abc", null)).toBe(false);
  });
  it("leaves out the insights permission when it is switched off", () => {
    const url = new URL(buildAuthorizeUrl({ appId: "1", redirectUri: "https://x/cb", state: "s", withInsights: false }));
    expect(url.searchParams.get("scope")).toBe("threads_basic,threads_content_publish");
    expect(threadsScopes(true)).toContain("threads_manage_insights");
  });
  it("builds the authorization URL with the documented parameters", () => {
    const url = new URL(buildAuthorizeUrl({ appId: "123", redirectUri: redirectUriFor("https://app.example.com/"), state: "s" }));
    expect(url.origin + url.pathname).toBe("https://threads.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/threads/callback");
    expect(url.searchParams.get("scope")).toBe("threads_basic,threads_content_publish,threads_manage_insights");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("s");
  });
});
