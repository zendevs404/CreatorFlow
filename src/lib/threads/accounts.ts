import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ThreadsAccountSecretRow } from "@/lib/database.types";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import type { ThreadsApi } from "@/lib/threads/api";
import { ThreadsApiError } from "@/lib/threads/api";

type Client = SupabaseClient<Database>;

export type ConnectionState =
  | { status: "disconnected" }
  | { status: "connected"; username: string | null; expiresAt: string | null; needsReauth: boolean; lastError: string | null; insightsEnabled: boolean };

/** Reads the safe columns with the user's own session (RLS + column grants hide ciphertext). */
export async function getConnectionState(supabase: Client, userId: string): Promise<ConnectionState> {
  const { data, error } = await supabase
    .from("threads_accounts")
    .select("username,token_expires_at,needs_reauth,last_error,insights_enabled")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Could not read threads_accounts", { code: error.code, message: error.message });
    throw new Error("Could not load the Threads connection. If you recently updated the app, run the newest SQL files in supabase/migrations (0003 and 0004) in the Supabase SQL Editor.");
  }
  if (!data) return { status: "disconnected" };
  return { status: "connected", username: data.username, expiresAt: data.token_expires_at, needsReauth: data.needs_reauth, lastError: data.last_error, insightsEnabled: data.insights_enabled };
}

export function canSchedule(state: ConnectionState, now = new Date()): boolean {
  if (state.status !== "connected" || state.needsReauth) return false;
  return !state.expiresAt || new Date(state.expiresAt) > now;
}

/** Stores a freshly authorized account. Only one active account per user in the MVP. */
export async function saveConnection(
  admin: Client,
  encryptionKey: string,
  p: { userId: string; threadsUserId: string; username: string | null; longLivedToken: string; expiresInSeconds: number; insightsEnabled?: boolean },
  now = new Date(),
): Promise<void> {
  const { error: revokeError } = await admin
    .from("threads_accounts")
    .update({ revoked_at: now.toISOString(), access_token_ciphertext: null })
    .eq("user_id", p.userId)
    .neq("threads_user_id", p.threadsUserId)
    .is("revoked_at", null);
  if (revokeError) throw new Error("Could not replace the previous connection.");

  const { error } = await admin.from("threads_accounts").upsert(
    {
      user_id: p.userId,
      threads_user_id: p.threadsUserId,
      username: p.username,
      access_token_ciphertext: encryptToken(p.longLivedToken, encryptionKey, `${p.userId}:${p.threadsUserId}`),
      token_expires_at: new Date(now.getTime() + p.expiresInSeconds * 1000).toISOString(),
      token_refreshed_at: now.toISOString(),
      connected_at: now.toISOString(),
      revoked_at: null,
      needs_reauth: false,
      last_error: null,
      insights_enabled: p.insightsEnabled ?? false,
    },
    { onConflict: "user_id,threads_user_id" },
  );
  if (error) throw new Error("Could not save the Threads connection.");
}

/** Forgets the stored token. (Meta's docs describe no token-revocation endpoint; the user can also remove the app in Threads settings.) */
export async function disconnectAccounts(admin: Client, userId: string, now = new Date()): Promise<void> {
  const { error } = await admin
    .from("threads_accounts")
    .update({ revoked_at: now.toISOString(), access_token_ciphertext: null, token_expires_at: null, needs_reauth: false, last_error: null })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) throw new Error("Could not disconnect Threads.");
}

const DAY = 86_400_000;

/** Meta: refresh only when the token is at least 24h old and not expired. We refresh once it has under 20 days left. */
export function isRefreshDue(a: Pick<ThreadsAccountSecretRow, "token_refreshed_at" | "connected_at" | "token_expires_at" | "needs_reauth" | "revoked_at">, now = new Date()): boolean {
  if (a.revoked_at || a.needs_reauth || !a.token_expires_at) return false;
  const expires = new Date(a.token_expires_at).getTime();
  if (expires <= now.getTime()) return false;
  const lastIssued = new Date(a.token_refreshed_at ?? a.connected_at).getTime();
  return now.getTime() - lastIssued >= DAY && expires - now.getTime() < 20 * DAY;
}

export type RefreshOutcome = "refreshed" | "needs_reauth" | "skipped";

export async function refreshAccount(admin: Client, api: ThreadsApi, encryptionKey: string, account: ThreadsAccountSecretRow, now = new Date()): Promise<RefreshOutcome> {
  if (!account.access_token_ciphertext || !isRefreshDue(account, now)) return "skipped";
  const binding = `${account.user_id}:${account.threads_user_id}`;
  try {
    const current = decryptToken(account.access_token_ciphertext, encryptionKey, binding);
    const next = await api.refreshLongLived(current);
    const { error } = await admin
      .from("threads_accounts")
      .update({
        access_token_ciphertext: encryptToken(next.accessToken, encryptionKey, binding),
        token_expires_at: new Date(now.getTime() + next.expiresInSeconds * 1000).toISOString(),
        token_refreshed_at: now.toISOString(),
        last_error: null,
      })
      .eq("id", account.id)
      .eq("user_id", account.user_id);
    if (error) throw new Error("Could not store the refreshed token.");
    return "refreshed";
  } catch (err) {
    if (err instanceof ThreadsApiError && err.kind === "unauthorized") {
      await admin.from("threads_accounts").update({ needs_reauth: true, last_error: "Token refresh was rejected. Reconnect your account." }).eq("id", account.id).eq("user_id", account.user_id);
      return "needs_reauth";
    }
    throw err;
  }
}
