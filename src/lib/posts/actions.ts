"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/supabase/session";
import { canUserTransition, type PostStatus } from "@/lib/posts/status";
import { postFormSchema, rescheduleSchema, type MediaInput, type PostFormInput } from "@/lib/posts/schema";
import { planMediaSync } from "@/lib/posts/media-sync";
import { canSchedule, getConnectionState } from "@/lib/threads/accounts";
import { zonedLocalToUtc } from "@/lib/time";

const FAIL = (error: string): ActionResult<never> => ({ ok: false, error });

function refresh() {
  for (const p of ["/dashboard", "/posts", "/calendar", "/studio"]) revalidatePath(p);
}

const MEDIA_BUCKET = "post-media";

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Make the post's media rows match `media`. Returns an error message, or null on success. */
async function syncMedia(supabase: Supabase, userId: string, postId: string, media: MediaInput[]): Promise<string | null> {
  if (media.some((m) => !m.path.startsWith(`${userId}/`))) return "One of the images does not belong to your account.";

  const { data: existing, error: readError } = await supabase.from("post_media").select("storage_path,position").eq("post_id", postId).eq("user_id", userId);
  if (readError) {
    console.error("post_media read failed", { code: readError.code, message: readError.message });
    return "Could not load the post's images.";
  }
  const plan = planMediaSync(existing, media);

  for (const { media: m } of plan.insert) {
    const { data: found, error } = await supabase.storage.from(MEDIA_BUCKET).exists(m.path);
    if (error || !found) {
      console.error("post-media object check failed", { message: error?.message ?? "not found" });
      return "An uploaded image could not be found. Remove it and upload it again.";
    }
  }

  // Plain insert/update/delete (not upsert): upsert needs UPDATE rights on every column, which users deliberately lack.
  if (plan.insert.length > 0) {
    const { error } = await supabase.from("post_media").insert(
      plan.insert.map(({ media: m, position }) => ({
        post_id: postId,
        user_id: userId,
        storage_path: m.path,
        mime_type: m.mime,
        size_bytes: m.size,
        width: m.width,
        height: m.height,
        position,
      })),
    );
    if (error) {
      console.error("post_media insert failed", { code: error.code, message: error.message });
      return "Could not save the images. Try again.";
    }
  }
  for (const { path, position } of plan.reposition) {
    const { error } = await supabase.from("post_media").update({ position }).eq("post_id", postId).eq("user_id", userId).eq("storage_path", path);
    if (error) {
      console.error("post_media reorder failed", { code: error.code, message: error.message });
      return "Could not save the images. Try again.";
    }
  }
  if (plan.remove.length > 0) {
    const { error } = await supabase.from("post_media").delete().eq("post_id", postId).eq("user_id", userId).in("storage_path", plan.remove);
    if (error) {
      console.error("post_media delete failed", { code: error.code, message: error.message });
      return "Could not remove an image. Try again.";
    }
    // Best effort: an orphaned file is harmless (private, owner-only) and is not shown anywhere.
    await supabase.storage.from(MEDIA_BUCKET).remove(plan.remove);
  }
  return null;
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
  const message = nextStatus === "scheduled" ? "Scheduled." : "Draft saved.";
  if (nextStatus === "scheduled") {
    // Scheduled posts are published automatically, so a usable Threads connection is required.
    const connection = await getConnectionState(supabase, user.id);
    if (!canSchedule(connection)) return FAIL("Connect your Threads account in Settings before scheduling. Drafts can be saved without it.");
  }

  if (v.id) {
    const { data: existing, error: readError } = await supabase.from("posts").select("id,status").eq("id", v.id).eq("user_id", user.id).maybeSingle();
    if (readError) return FAIL("Could not load the post. Try again.");
    if (!existing) return FAIL("That post no longer exists.");
    if (!canUserTransition(existing.status, nextStatus)) return FAIL(`A ${existing.status} post cannot be changed this way.`);
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
    const mediaError = await syncMedia(supabase, user.id, v.id, v.media);
    if (mediaError) return FAIL(`The text was saved, but: ${mediaError}`);
    refresh();
    return { ok: true, message, data: { id: v.id } };
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
  const mediaError = await syncMedia(supabase, user.id, data.id, v.media);
  if (mediaError) {
    // Do not leave a half-saved post behind: the editor keeps the user's input so they can retry.
    await supabase.from("posts").delete().eq("id", data.id).eq("user_id", user.id);
    return FAIL(mediaError);
  }
  refresh();
  return { ok: true, message, data: { id: data.id } };
}

export async function deletePost(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return FAIL("Invalid post.");
  const { supabase, user } = await requireUser();
  const { data: media } = await supabase.from("post_media").select("storage_path").eq("post_id", id).eq("user_id", user.id);
  const { data, error } = await supabase
    .from("posts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .in("status", ["draft", "scheduled", "failed", "cancelled"])
    .select("id");
  if (error) return FAIL("Could not delete the post. Try again.");
  if (!data || data.length === 0) return FAIL("This post cannot be deleted (it may be publishing or published).");
  if (media && media.length > 0) await supabase.storage.from(MEDIA_BUCKET).remove(media.map((m) => m.storage_path));
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
