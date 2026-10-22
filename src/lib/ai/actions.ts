"use server";

import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { AiError, getAiProvider, getAiStatus } from "@/lib/ai/provider";
import { assistInputSchema, runAssist } from "@/lib/ai/assist";
import { requireUser } from "@/lib/supabase/session";

const LIMIT_PER_HOUR = 20;

export async function generateSuggestions(input: unknown): Promise<ActionResult<{ suggestions: string[] }>> {
  const parsed = assistInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const status = getAiStatus();
  const provider = getAiProvider();
  if (!status.enabled || !provider) return { ok: false, error: status.enabled ? "AI assistance is unavailable." : status.reason };

  const { supabase, user } = await requireUser();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: countError } = await supabase.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if (countError) return { ok: false, error: "Could not check your AI usage. Try again." };
  if ((count ?? 0) >= LIMIT_PER_HOUR) return { ok: false, error: `You reached the limit of ${LIMIT_PER_HOUR} AI requests per hour. Try again later.` };
  // Log before calling the provider so failed attempts also count toward the limit.
  const { error: logError } = await supabase.from("ai_usage").insert({ user_id: user.id, action: parsed.data.action });
  if (logError) return { ok: false, error: "Could not record this request. Try again." };

  try {
    return { ok: true, message: "Suggestions ready.", data: { suggestions: await runAssist(provider, parsed.data) } };
  } catch (err) {
    if (err instanceof AiError) {
      if (err.kind === "unauthorized") console.error("AI provider rejected the API key");
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "AI assistance failed. Try again." };
  }
}
