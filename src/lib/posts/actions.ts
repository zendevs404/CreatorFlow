"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/supabase/session";
import { canUserTransition, type PostStatus } from "@/lib/posts/status";
import { postFormSchema, rescheduleSchema, type PostFormInput } from "@/lib/posts/schema";
import { zonedLocalToUtc } from "@/lib/time";

const FAIL = (error: string): ActionResult<never> => ({ ok: false, error });

function refresh() {
  for (const p of ["/dashboard", "/posts", "/calendar", "/studio"]) revalidatePath(p);
}

/** Create or update a post as a draft, or schedule it. Ownership is enforced here and by RLS. */
export async function savePost(input: PostFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = postFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const v = parsed.data;
  const { supabase, user } = await requireUser();
  const nextStatus: PostStatus = v.intent === "schedule" ? "scheduled" : "draft";
  const scheduledAt = v.intent === "schedule" && v.scheduledLocal ? zonedLocalToUtc(v.scheduledLocal, v.timezone) : null;
  if (v.intent === "schedule" && !scheduledAt) return FAIL("That date and time does not exist.");

  if (v.id) {
    const { data: existing, error: readError } = await supabase
      .from("posts")
      .select("id,status")
      .eq("id", v.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) return FAIL("Could not load the post. Try again.");
    if (!existing) return FAIL("That post no longer exists.");
    if (!canUserTransition(existing.status, nextStatus)) {
      return FAIL(`A ${existing.status} post cannot be changed this way.`);
    }
    const { error } = await supabase
      .from("posts")
      .update({
        content: v.content,
        status: nextStatus,
        scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
        timezone: v.timezone,
        failure_reason: null,
      })
      .eq("id", v.id)
      .eq("user_id", user.id);
    if (error) return FAIL("Could not save the post. Try again.");
    refresh();
    return { ok: true, message: nextStatus === "scheduled" ? "Scheduled." : "Draft saved.", data: { id: v.id } };
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      content: v.content,
      status: nextStatus,
      scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
      timezone: v.timezone,
    })
    .select("id")
    .single();
  if (error || !data) return FAIL("Could not save the post. Try again.");
  refresh();
  return { ok: true, message: nextStatus === "scheduled" ? "Scheduled." : "Draft saved.", data: { id: data.id } };
}

export async function deletePost(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return FAIL("Invalid post.");
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("posts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .in("status", ["draft", "scheduled", "failed", "cancelled"])
    .select("id");
  if (error) return FAIL("Could not delete the post. Try again.");
  if (!data || data.length === 0) return FAIL("This post cannot be deleted (it may be publishing or published).");
  refresh();
  return { ok: true, message: "Post deleted." };
}

/** Move a scheduled post to a new time. */
export async function reschedulePost(input: z.infer<typeof rescheduleSchema>): Promise<ActionResult> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return FAIL("Invalid date or timezone.");
  const when = zonedLocalToUtc(parsed.data.scheduledLocal, parsed.data.timezone);
  if (!when) return FAIL("That date and time does not exist.");
  if (when.getTime() < Date.now() + 60_000) return FAIL("Pick a time at least one minute from now.");
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("posts")
    .update({ scheduled_at: when.toISOString(), timezone: parsed.data.timezone })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .select("id");
  if (error) return FAIL("Could not reschedule. Try again.");
  if (!data || data.length === 0) return FAIL("Only scheduled posts can be rescheduled.");
  refresh();
  return { ok: true, message: "Rescheduled." };
}

/** Cancel a scheduled post; it stays in the list and can be rescheduled later. */
export async function cancelSchedule(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return FAIL("Invalid post.");
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("posts")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .select("id");
  if (error) return FAIL("Could not cancel. Try again.");
  if (!data || data.length === 0) return FAIL("Only scheduled posts can be cancelled.");
  refresh();
  return { ok: true, message: "Schedule cancelled." };
}
