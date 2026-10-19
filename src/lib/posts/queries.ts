import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PostRow } from "@/lib/database.types";
import { POST_STATUSES, type PostStatus } from "@/lib/posts/status";

type Client = SupabaseClient<Database>;

export const postFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(POST_STATUSES).optional().catch(undefined),
});
export type PostFilter = z.infer<typeof postFilterSchema>;

/** Escape characters that are special in PostgREST `like` filters. */
function escapeLike(v: string) {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listPosts(supabase: Client, userId: string, filter: PostFilter): Promise<PostRow[]> {
  let query = supabase.from("posts").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(200);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.q) query = query.ilike("content", `%${escapeLike(filter.q)}%`);
  const { data, error } = await query;
  if (error) throw new Error("Could not load posts.");
  return data;
}

export async function getPost(supabase: Client, userId: string, id: string): Promise<PostRow | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase.from("posts").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Could not load the post.");
  return data;
}

export async function listScheduled(supabase: Client, userId: string, fromIso?: string, toIso?: string): Promise<PostRow[]> {
  let query = supabase
    .from("posts")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["scheduled", "published", "failed", "publishing"])
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(500);
  if (fromIso) query = query.gte("scheduled_at", fromIso);
  if (toIso) query = query.lt("scheduled_at", toIso);
  const { data, error } = await query;
  if (error) throw new Error("Could not load scheduled posts.");
  return data;
}

export async function dashboardData(supabase: Client, userId: string) {
  const nowIso = new Date().toISOString();
  const [upcoming, recent, counts] = await Promise.all([
    supabase
      .from("posts")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "scheduled")
      .gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(5),
    supabase
      .from("publishing_attempts")
      .select("id,post_id,outcome,error_message,started_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(5),
    supabase.from("posts").select("status").eq("user_id", userId),
  ]);
  if (upcoming.error || recent.error || counts.error) throw new Error("Could not load the dashboard.");
  const byStatus: Record<PostStatus, number> = { draft: 0, scheduled: 0, publishing: 0, published: 0, failed: 0, cancelled: 0 };
  for (const row of counts.data) byStatus[row.status] += 1;
  return { upcoming: upcoming.data, recent: recent.data, byStatus };
}
