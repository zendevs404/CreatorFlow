import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { publicOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveConnection } from "@/lib/threads/accounts";
import { createThreadsApi, ThreadsApiError } from "@/lib/threads/api";
import { OAUTH_STATE_COOKIE, oauthStateMatches, redirectUriFor } from "@/lib/threads/oauth";

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request.url);
  const back = (result: string) => NextResponse.redirect(new URL(`/settings?threads=${result}`, origin));
  const jar = await cookies();
  const expectedState = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete({ name: OAUTH_STATE_COOKIE, path: "/api/threads" }); // single use

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back("denied");
  if (!oauthStateMatches(expectedState, params.get("state"))) return back("invalid_state");
  const code = params.get("code")?.replace(/#_$/, "");
  if (!code) return back("error");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", origin));

  try {
    const env = getServerEnv();
    const api = createThreadsApi();
    const short = await api.exchangeCode({ appId: env.THREADS_APP_ID, appSecret: env.THREADS_APP_SECRET, code, redirectUri: redirectUriFor(env.NEXT_PUBLIC_SITE_URL) });
    const long = await api.exchangeForLongLived({ appSecret: env.THREADS_APP_SECRET, shortLivedToken: short.accessToken });
    const profile = await api.getProfile(long.accessToken);
    if (profile.id !== short.userId) return back("error");
    if (!Number.isFinite(long.expiresInSeconds) || long.expiresInSeconds <= 0) return back("error");
    await saveConnection(createAdminClient(), env.TOKEN_ENCRYPTION_KEY, {
      userId: data.user.id,
      threadsUserId: profile.id,
      username: profile.username,
      longLivedToken: long.accessToken,
      expiresInSeconds: long.expiresInSeconds,
    });
    return back("connected");
  } catch (err) {
    // Log only the error class and HTTP status: never tokens, codes, or request URLs.
    console.error("Threads connection failed", err instanceof ThreadsApiError ? { kind: err.kind, status: err.status } : { kind: "internal" });
    return back("error");
  }
}
