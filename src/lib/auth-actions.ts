"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { credentialsSchema, settingsSchema } from "@/lib/posts/schema";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/session";
import { revalidatePath } from "next/cache";

export async function signIn(input: { email: string; password: string }): Promise<ActionResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your details.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: "Email or password is incorrect." };
  redirect("/dashboard");
}

export async function signUp(input: { email: string; password: string }): Promise<ActionResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your details.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/dashboard` },
  });
  if (error) return { ok: false, error: "Could not create the account. Try a different email or try again later." };
  if (data.session) redirect("/dashboard");
  return { ok: true, message: "Check your email to confirm your account, then sign in." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function updateSettings(input: { displayName: string; timezone: string }): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName || null, timezone: parsed.data.timezone })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Could not save settings. Try again." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}
