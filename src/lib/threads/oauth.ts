import { randomBytes, timingSafeEqual } from "node:crypto";

/** Scopes requested at connect time. threads_basic is required; publishing needs threads_content_publish. */
export const THREADS_SCOPES = ["threads_basic", "threads_content_publish"] as const;
export const OAUTH_STATE_COOKIE = "threads_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 600;

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/** Constant-time comparison of the state echoed by Meta against the one stored in the user's cookie. */
export function oauthStateMatches(fromCookie: string | undefined, fromQuery: string | null): boolean {
  if (!fromCookie || !fromQuery) return false;
  const a = Buffer.from(fromCookie);
  const b = Buffer.from(fromQuery);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildAuthorizeUrl(p: { appId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: p.appId,
    redirect_uri: p.redirectUri,
    scope: THREADS_SCOPES.join(","),
    response_type: "code",
    state: p.state,
  });
  return `https://threads.com/oauth/authorize?${q}`;
}

export function redirectUriFor(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/api/threads/callback`;
}
