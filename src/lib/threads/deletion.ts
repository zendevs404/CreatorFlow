import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Admin = SupabaseClient<Database>;

/** User removed the app inside Threads: forget the token. Content they wrote here stays. */
export async function handleDeauthorize(admin: Admin, threadsUserId: string, now = new Date()): Promise<number> {
  const { data, error } = await admin
    .from("threads_accounts")
    .update({ revoked_at: now.toISOString(), access_token_ciphertext: null, token_expires_at: null, needs_reauth: false, last_error: "The app was removed in Threads." })
    .eq("threads_user_id", threadsUserId)
    .is("revoked_at", null)
    .select("id");
  if (error) throw new Error("Could not revoke the connection.");
  return data.length;
}

/**
 * Meta data-deletion request: remove everything we hold that came from Threads for this user (token, account
 * link, insights, and Threads post ids). Posts the user wrote in CreatorFlow stay; deleting the CreatorFlow
 * account itself is a separate action. Returns the public confirmation code.
 */
export async function handleDataDeletion(admin: Admin, threadsUserId: string): Promise<{ confirmationCode: string; found: boolean }> {
  const confirmationCode = randomBytes(12).toString("hex");
  const { data: accounts, error } = await admin.from("threads_accounts").select("id,user_id").eq("threads_user_id", threadsUserId);
  if (error) throw new Error("Could not look up the account.");

  for (const userId of new Set(accounts.map((a) => a.user_id))) {
    const steps = [
      admin.from("post_insights").delete().eq("user_id", userId),
      admin.from("account_insights").delete().eq("user_id", userId),
      admin.from("posts").update({ external_post_id: null, external_container_id: null, threads_account_id: null }).eq("user_id", userId),
    ];
    for (const step of steps) {
      const { error: stepError } = await step;
      if (stepError) throw new Error("Could not delete Threads data.");
    }
  }
  if (accounts.length > 0) {
    const { error: deleteError } = await admin.from("threads_accounts").delete().eq("threads_user_id", threadsUserId);
    if (deleteError) throw new Error("Could not delete the Threads connection.");
  }

  const { error: logError } = await admin.from("data_deletion_requests").insert({ confirmation_code: confirmationCode, threads_user_id: threadsUserId, status: accounts.length > 0 ? "completed" : "no_data" });
  if (logError) throw new Error("Could not record the deletion request.");
  return { confirmationCode, found: accounts.length > 0 };
}
