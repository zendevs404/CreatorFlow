"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { getServerEnv, insightsEnabledByConfig, missingServerEnv } from "@/lib/env";
import { requireUser } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { disconnectAccounts } from "@/lib/threads/accounts";
import { buildAuthorizeUrl, createOAuthState, OAUTH_STATE_COOKIE, OAUTH_STATE_MAX_AGE_SECONDS, redirectUriFor } from "@/lib/threads/oauth";

/** Starts the official Threads OAuth flow. The random state lives in an httpOnly cookie and is checked on return (CSRF). */
export async function connectThreads(): Promise<ActionResult> {
  await requireUser();
  const missing = missingServerEnv();
  if (missing.length > 0) return { ok: false, error: `Threads is not configured on the server. Missing: ${missing.join(", ")}.` };
  const env = getServerEnv();
  const state = createOAuthState();
  (await cookies()).set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/threads",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
  redirect(buildAuthorizeUrl({ appId: env.THREADS_APP_ID, redirectUri: redirectUriFor(env.NEXT_PUBLIC_SITE_URL), state, withInsights: insightsEnabledByConfig() }));
}

export async function disconnectThreads(): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    await disconnectAccounts(createAdminClient(), user.id);
  } catch {
    return { ok: false, error: "Could not disconnect. Try again." };
  }
  for (const path of ["/settings", "/dashboard", "/studio", "/posts"]) revalidatePath(path);
  return { ok: true, message: "Threads disconnected." };
}
