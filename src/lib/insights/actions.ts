"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { getServerEnv, missingServerEnv } from "@/lib/env";
import { refreshInsights } from "@/lib/insights/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/session";
import { createThreadsApi } from "@/lib/threads/api";

export async function refreshAnalytics(): Promise<ActionResult> {
  const { user } = await requireUser();
  if (missingServerEnv().length > 0) return { ok: false, error: "Threads is not configured on the server." };
  const result = await refreshInsights(createAdminClient(), createThreadsApi(), getServerEnv().TOKEN_ENCRYPTION_KEY, user.id);
  revalidatePath("/analytics");
  if (result.status === "ok") {
    return { ok: true, message: result.message ?? `Updated ${result.postsUpdated} post${result.postsUpdated === 1 ? "" : "s"}.` };
  }
  if (result.status === "failed") return { ok: false, error: result.message };
  const reasons = {
    not_connected: "Connect your Threads account first.",
    insights_disabled: "Reconnect Threads to grant the analytics permission.",
    needs_reauth: "Threads needs to be reconnected.",
    fresh: "Insights were refreshed a few minutes ago. Try again shortly.",
    rate_limited: "Threads is rate limiting requests. Try again later.",
  } as const;
  return { ok: false, error: reasons[result.reason] };
}
