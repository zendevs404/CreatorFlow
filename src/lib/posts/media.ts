import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type EditorMedia = { path: string; mime: "image/jpeg" | "image/png"; size: number; width: number; height: number; url: string };

/** Images for the given posts, with short-lived signed URLs (the bucket is private). */
export async function loadPostMedia(supabase: Client, userId: string, postIds: string[]): Promise<Map<string, EditorMedia[]>> {
  const result = new Map<string, EditorMedia[]>();
  if (postIds.length === 0) return result;
  const { data, error } = await supabase
    .from("post_media")
    .select("post_id,storage_path,mime_type,size_bytes,width,height,position")
    .eq("user_id", userId)
    .in("post_id", postIds)
    .order("position", { ascending: true });
  if (error) throw new Error("Could not load images.");
  if (data.length === 0) return result;

  const { data: signed, error: signError } = await supabase.storage.from("post-media").createSignedUrls(
    data.map((m) => m.storage_path),
    3600,
  );
  if (signError) throw new Error("Could not load images.");
  const urlByPath = new Map(signed.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));

  for (const m of data) {
    const url = urlByPath.get(m.storage_path);
    if (!url) continue;
    const item: EditorMedia = { path: m.storage_path, mime: m.mime_type, size: m.size_bytes, width: m.width, height: m.height, url };
    result.set(m.post_id, [...(result.get(m.post_id) ?? []), item]);
  }
  return result;
}

export async function countPostMedia(supabase: Client, userId: string, postIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (postIds.length === 0) return counts;
  const { data, error } = await supabase.from("post_media").select("post_id").eq("user_id", userId).in("post_id", postIds);
  if (error) throw new Error("Could not load images.");
  for (const row of data) counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1);
  return counts;
}
