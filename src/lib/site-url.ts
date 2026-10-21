/**
 * Origin to use when redirecting the browser. Behind a tunnel or reverse proxy the request's own URL can
 * show the internal host (for example http://localhost:3000), which would send the user to a different
 * origin where their session cookie does not exist. NEXT_PUBLIC_SITE_URL is the address users actually use.
 */
export function publicOrigin(requestUrl: string, siteUrl = process.env.NEXT_PUBLIC_SITE_URL): string {
  try {
    if (siteUrl) return new URL(siteUrl).origin;
  } catch {
    // fall through to the request's own origin
  }
  return new URL(requestUrl).origin;
}
