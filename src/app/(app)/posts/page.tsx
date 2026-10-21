import type { Metadata } from "next";
import Link from "next/link";
import { ImageIcon, Plus, Search } from "lucide-react";
import { DeletePostButton } from "@/components/delete-post-button";
import { EditPostDialog } from "@/components/edit-post-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { loadPostMedia, countPostMedia } from "@/lib/posts/media";
import { getPost, listPosts, postFilterSchema } from "@/lib/posts/queries";
import { isUserEditable, POST_STATUSES, STATUS_LABEL } from "@/lib/posts/status";
import { requireUser } from "@/lib/supabase/session";
import { canSchedule, getConnectionState } from "@/lib/threads/accounts";
import { formatInZone } from "@/lib/time";

export const metadata: Metadata = { title: "Posts" };

export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const filter = postFilterSchema.parse(sp);
  const { supabase, user, profile } = await requireUser();
  const posts = await listPosts(supabase, user.id, filter);
  const filtered = Boolean(filter.q || filter.status);
  const mediaCounts = await countPostMedia(supabase, user.id, posts.map((p) => p.id));

  const keep = new URLSearchParams();
  if (filter.q) keep.set("q", filter.q);
  if (filter.status) keep.set("status", filter.status);
  const base = keep.toString() ? `/posts?${keep.toString()}` : "/posts";
  const editHref = (id: string) => `/posts?${new URLSearchParams({ ...Object.fromEntries(keep), edit: id }).toString()}`;

  const threadsReady = canSchedule(await getConnectionState(supabase, user.id));
  const editing = sp.edit ? await getPost(supabase, user.id, sp.edit) : null;
  const editingMedia = editing ? ((await loadPostMedia(supabase, user.id, [editing.id])).get(editing.id) ?? []) : [];

  return (
    <>
      <PageHeader
        title="Posts"
        description="Every draft, scheduled, published, and failed post."
        actions={
          <Button asChild variant="primary">
            <Link href="/studio">
              <Plus /> New post
            </Link>
          </Button>
        }
      />
      <form method="get" role="search" className="mb-6 flex flex-wrap gap-3">
        <div className="relative min-w-52 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
          <Input name="q" defaultValue={filter.q} placeholder="Search post text" aria-label="Search post text" className="pl-9" />
        </div>
        <Select name="status" defaultValue={filter.status ?? ""} aria-label="Filter by status" className="w-44">
          <option value="">All statuses</option>
          {POST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Button type="submit">Apply</Button>
        {filtered ? (
          <Button asChild variant="ghost">
            <Link href="/posts">Clear</Link>
          </Button>
        ) : null}
      </form>

      {posts.length === 0 ? (
        <EmptyState
          title={filtered ? "No posts match these filters" : "No posts yet"}
          action={
            <Button asChild variant="primary">
              <Link href="/studio">Write your first post</Link>
            </Button>
          }
        >
          {filtered ? "Try a different search or clear the filters." : "Drafts and scheduled posts will show up here."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-panel bg-surface ring-1 ring-line">
          {posts.map((p) => (
            <li key={p.id} className="flex items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <Link href={editHref(p.id)} scroll={false} className="line-clamp-2 break-words font-medium hover:underline">
                  {p.content.trim() || (mediaCounts.get(p.id) ? "Image post" : "Untitled draft")}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                  <StatusBadge status={p.status} />
                  {mediaCounts.get(p.id) ? (
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="size-3.5" aria-hidden />
                      {mediaCounts.get(p.id)}
                      <span className="sr-only"> images</span>
                    </span>
                  ) : null}
                  {p.scheduled_at ? <span>{formatInZone(p.scheduled_at, profile.timezone)}</span> : <span>Updated {formatInZone(p.updated_at, profile.timezone)}</span>}
                  {p.failure_reason ? <span className="text-bad">{p.failure_reason}</span> : null}
                </div>
              </div>
              {isUserEditable(p.status) ? <DeletePostButton id={p.id} /> : null}
            </li>
          ))}
        </ul>
      )}

      {sp.edit && !editing ? (
        <p role="alert" className="mt-4 rounded-control bg-bad/10 px-3 py-2 text-sm text-bad">
          That post no longer exists. <Link href={base} className="underline">Dismiss</Link>
        </p>
      ) : null}
      {editing ? (
        <EditPostDialog
          key={`${editing.id}-${editing.updated_at}`}
          post={editing}
          media={editingMedia}
          timezone={profile.timezone}
          displayName={profile.display_name ?? "You"}
          userId={user.id}
          threadsReady={threadsReady}
          closeHref={base}
        />
      ) : null}
    </>
  );
}
