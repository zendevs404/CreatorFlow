"use client";

import { Clock, Save, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { StatusBadge } from "@/components/status-badge";
import { deletePost, savePost } from "@/lib/posts/actions";
import { isUserEditable, type PostStatus } from "@/lib/posts/status";
import { countCharacters, THREADS_TEXT_LIMIT } from "@/lib/threads/limits";
import { utcToZonedLocal } from "@/lib/time";
import { cn } from "@/lib/utils";

type Props = {
  post: { id: string; content: string; status: PostStatus; scheduled_at: string | null; failure_reason: string | null } | null;
  timezone: string;
  displayName: string;
};

function CharacterRing({ count }: { count: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(count / THREADS_TEXT_LIMIT, 1);
  const over = count > THREADS_TEXT_LIMIT;
  const near = count > THREADS_TEXT_LIMIT * 0.9;
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <circle cx="14" cy="14" r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          transform="rotate(-90 14 14)"
          stroke={over ? "var(--bad)" : near ? "var(--warn)" : "var(--accent)"}
          style={{ transition: "stroke-dashoffset 0.15s" }}
        />
      </svg>
      <span className={cn("text-sm tabular-nums", over ? "font-medium text-bad" : "text-ink-2")}>
        {count} / {THREADS_TEXT_LIMIT}
        <span className="sr-only">{over ? ` characters, ${count - THREADS_TEXT_LIMIT} over the limit` : " characters"}</span>
      </span>
    </div>
  );
}

export function PostEditor({ post, timezone, displayName }: Props) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [content, setContent] = useState(post?.content ?? "");
  const [scheduledLocal, setScheduledLocal] = useState(post?.scheduled_at ? utcToZonedLocal(post.scheduled_at, timezone) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const count = useMemo(() => countCharacters(content), [content]);
  const editable = !post || isUserEditable(post.status);
  const over = count > THREADS_TEXT_LIMIT;

  function submit(intent: "draft" | "schedule") {
    setErrors({});
    start(async () => {
      const result = await savePost({ id: post?.id, content, intent, scheduledLocal: scheduledLocal || undefined, timezone });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        notify("error", result.error);
        return;
      }
      notify("success", result.message);
      if (result.data && result.data.id !== post?.id) router.replace(`/studio/${result.data.id}`);
      else router.refresh();
    });
  }

  function remove() {
    if (!post || !window.confirm("Delete this post? This cannot be undone.")) return;
    start(async () => {
      const result = await deletePost(post.id);
      if (!result.ok) return notify("error", result.error);
      notify("success", result.message);
      router.replace("/posts");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Editor" className="space-y-4">
        <div className="flex items-center gap-3">
          {post ? <StatusBadge status={post.status} /> : <span className="text-sm text-ink-2">New post</span>}
        </div>
        {post?.status === "failed" && post.failure_reason ? (
          <p role="alert" className="rounded-control bg-bad/10 px-3 py-2 text-sm text-bad">
            Publishing failed: {post.failure_reason}
          </p>
        ) : null}
        {!editable ? <p className="rounded-control bg-surface-2 px-3 py-2 text-sm text-ink-2">This post is {post?.status} and can no longer be edited.</p> : null}

        <Field label="Post text" htmlFor="content" error={errors.content}>
          <Textarea
            id="content"
            rows={10}
            value={content}
            disabled={!editable}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What do you want to say?"
            aria-invalid={over || Boolean(errors.content)}
            aria-describedby={errors.content ? "content-error" : undefined}
          />
        </Field>

        <div className="glass sticky bottom-24 z-10 flex flex-wrap items-center justify-between gap-3 rounded-full px-4 py-2 md:bottom-6">
          <CharacterRing count={count} />
          <div className="flex flex-wrap items-center gap-2">
            {post ? (
              <Button variant="ghost" size="sm" onClick={remove} disabled={pending || !editable} aria-label="Delete post">
                <Trash2 />
              </Button>
            ) : null}
            <Button size="sm" onClick={() => submit("draft")} disabled={pending || !editable || over}>
              <Save /> Save draft
            </Button>
          </div>
        </div>

        <fieldset disabled={!editable} className="space-y-3 rounded-panel bg-surface p-5 ring-1 ring-line">
          <legend className="px-1 text-sm font-semibold">Schedule</legend>
          <Field label={`Publish at (${timezone})`} htmlFor="scheduledLocal" error={errors.scheduledLocal} hint="Posts are stored in UTC and shown in the timezone from Settings.">
            <Input id="scheduledLocal" type="datetime-local" value={scheduledLocal} onChange={(e) => setScheduledLocal(e.target.value)} aria-invalid={Boolean(errors.scheduledLocal)} aria-describedby={errors.scheduledLocal ? "scheduledLocal-error" : undefined} />
          </Field>
          <Button variant="primary" onClick={() => submit("schedule")} disabled={pending || over || content.trim().length === 0}>
            <Clock /> {post?.status === "scheduled" ? "Update schedule" : "Schedule post"}
          </Button>
          <p className="text-xs text-ink-2">
            <Send className="mr-1 inline size-3" aria-hidden />
            Automatic publishing to Threads arrives in Phase 2. Until then, scheduled posts wait in your calendar and are not sent.
          </p>
        </fieldset>
      </section>

      <aside aria-label="Preview" className="space-y-2">
        <h2 className="text-sm font-semibold text-ink-2">Preview</h2>
        <article className="rounded-panel bg-surface p-4 ring-1 ring-line">
          <div className="flex items-center gap-2">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <p className="text-sm font-semibold">{displayName}</p>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{content || <span className="text-ink-2">Your post appears here as you type.</span>}</p>
        </article>
        <p className="text-xs text-ink-2">An approximation of how the text will read. Threads controls the final layout.</p>
      </aside>
    </div>
  );
}
