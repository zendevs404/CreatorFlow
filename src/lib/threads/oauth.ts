import { randomBytes, timingSafeEqual } from "node:crypto";

/** threads_basic is required; publishing needs threads_content_publish; analytics needs threads_manage_insights. */
export function threadsScopes(withInsights: boolean): string[] {
  return withInsights ? ["threads_basic", "threads_content_publish", "threads_manage_insights"] : ["threads_basic", "threads_content_publish"];
}
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

export function buildAuthorizeUrl(p: { appId: string; redirectUri: string; state: string; withInsights?: boolean }): string {
  const q = new URLSearchParams({
    client_id: p.appId,
    redirect_uri: p.redirectUri,
    scope: threadsScopes(p.withInsights ?? true).join(","),
    response_type: "code",
    state: p.state,
  });
  return `https://threads.com/oauth/authorize?${q}`;
}

export function redirectUriFor(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/api/threads/callback`;
}
