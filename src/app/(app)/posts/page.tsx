import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { DeletePostButton } from "@/components/delete-post-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { listPosts, postFilterSchema } from "@/lib/posts/queries";
import { isUserEditable, POST_STATUSES, STATUS_LABEL } from "@/lib/posts/status";
import { requireUser } from "@/lib/supabase/session";
import { formatInZone } from "@/lib/time";

export const metadata: Metadata = { title: "Posts" };

export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filter = postFilterSchema.parse(await searchParams);
  const { supabase, user, profile } = await requireUser();
  const posts = await listPosts(supabase, user.id, filter);
  const filtered = Boolean(filter.q || filter.status);

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
                <Link href={`/studio/${p.id}`} className="line-clamp-2 break-words font-medium hover:underline">
                  {p.content.trim() || "Untitled draft"}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                  <StatusBadge status={p.status} />
                  {p.scheduled_at ? <span>{formatInZone(p.scheduled_at, profile.timezone)}</span> : <span>Updated {formatInZone(p.updated_at, profile.timezone)}</span>}
                  {p.failure_reason ? <span className="text-bad">{p.failure_reason}</span> : null}
                </div>
              </div>
              {isUserEditable(p.status) ? <DeletePostButton id={p.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
