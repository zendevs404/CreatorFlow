import type { MediaInput } from "@/lib/posts/schema";

export type MediaSyncPlan = {
  insert: { media: MediaInput; position: number }[];
  reposition: { path: string; position: number }[];
  remove: string[];
};

/** Pure diff between the rows that exist and the images the editor sent. */
export function planMediaSync(existing: { storage_path: string; position: number }[], desired: MediaInput[]): MediaSyncPlan {
  const current = new Map(existing.map((e) => [e.storage_path, e.position]));
  const plan: MediaSyncPlan = { insert: [], reposition: [], remove: [] };
  desired.forEach((media, position) => {
    const at = current.get(media.path);
    if (at === undefined) plan.insert.push({ media, position });
    else if (at !== position) plan.reposition.push({ path: media.path, position });
  });
  const keep = new Set(desired.map((m) => m.path));
  plan.remove = existing.filter((e) => !keep.has(e.storage_path)).map((e) => e.storage_path);
  return plan;
}
