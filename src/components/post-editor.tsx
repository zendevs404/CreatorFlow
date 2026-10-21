"use client";

import { Clock, ImagePlus, Save, Send, Trash2, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { StatusBadge } from "@/components/status-badge";
import { deletePost, savePost } from "@/lib/posts/actions";
import type { EditorMedia } from "@/lib/posts/media";
import { isUserEditable, type PostStatus } from "@/lib/posts/status";
import { createClient } from "@/lib/supabase/client";
import { countCharacters, THREADS_IMAGE_MIME_TYPES, THREADS_MEDIA_MAX_ITEMS, THREADS_TEXT_LIMIT } from "@/lib/threads/limits";
import { validateAspectRatio, validateImageFile } from "@/lib/threads/media-validation";
import { utcToZonedLocal } from "@/lib/time";
import { cn } from "@/lib/utils";

type EditorPost = { id: string; content: string; status: PostStatus; scheduled_at: string | null; failure_reason: string | null };

type Props = {
  /** "create" resets every field after a successful save; "edit" calls onDone. */
  mode: "create" | "edit";
  post: EditorPost | null;
  initialMedia?: EditorMedia[];
  timezone: string;
  displayName: string;
  userId: string;
  /** Whether a usable Threads connection exists. Scheduling needs one; drafts do not. */
  threadsReady: boolean;
  /** Single-column layout, used inside the Posts modal. */
  compact?: boolean;
  onDone?: () => void;
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

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });
}

function MediaGrid({ media, onRemove, disabled }: { media: EditorMedia[]; onRemove: (m: EditorMedia) => void; disabled: boolean }) {
  if (media.length === 0) return null;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Attached images">
      {media.map((m, i) => (
        <li key={m.path} className="group relative aspect-square overflow-hidden rounded-control bg-surface-2 ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed/blob URLs from private storage */}
          <img src={m.url} alt={`Attached image ${i + 1}`} className="size-full object-cover" />
          {!disabled ? (
            <button
              type="button"
              onClick={() => onRemove(m)}
              aria-label={`Remove image ${i + 1}`}
              className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PostEditor({ mode, post, initialMedia = [], timezone, displayName, userId, threadsReady, compact = false, onDone }: Props) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [content, setContent] = useState(post?.content ?? "");
  const [scheduledLocal, setScheduledLocal] = useState(post?.scheduled_at ? utcToZonedLocal(post.scheduled_at, timezone) : "");
  const [media, setMedia] = useState<EditorMedia[]>(initialMedia);
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const savedPaths = useRef(new Set(initialMedia.map((m) => m.path)));

  const count = useMemo(() => countCharacters(content), [content]);
  const editable = !post || isUserEditable(post.status);
  const over = count > THREADS_TEXT_LIMIT;
  const empty = content.trim().length === 0 && media.length === 0;
  const busy = pending || uploading > 0;

  const addFiles = useCallback(
    async (files: File[]) => {
      let current = media.length;
      const supabase = createClient();
      for (const file of files) {
        const problem = validateImageFile(file, current);
        if (problem) {
          notify("error", problem);
          continue;
        }
        setUploading((n) => n + 1);
        try {
          const { width, height } = await readDimensions(file);
          const ratioProblem = validateAspectRatio(width, height);
          if (ratioProblem) {
            notify("error", `${file.name}: ${ratioProblem}`);
            continue;
          }
          const ext = file.type === "image/png" ? "png" : "jpg";
          const path = `${userId}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from("post-media").upload(path, file, { contentType: file.type, upsert: false });
          if (error) {
            notify("error", `${file.name}: upload failed. Try again.`);
            continue;
          }
          current += 1;
          setMedia((m) => [...m, { path, mime: file.type === "image/png" ? "image/png" : "image/jpeg", size: file.size, width, height, url: URL.createObjectURL(file) }]);
        } catch {
          notify("error", `${file.name}: this image could not be read.`);
        } finally {
          setUploading((n) => n - 1);
        }
      }
    },
    [media.length, notify, userId],
  );

  function removeMedia(item: EditorMedia) {
    setMedia((m) => m.filter((x) => x.path !== item.path));
    // Files uploaded in this session but never saved are deleted right away; saved ones are removed by the server on save.
    if (!savedPaths.current.has(item.path)) void createClient().storage.from("post-media").remove([item.path]);
  }

  function reset() {
    setContent("");
    setScheduledLocal("");
    setMedia([]);
    setErrors({});
    savedPaths.current = new Set();
    textArea.current?.focus();
  }

  function submit(intent: "draft" | "schedule") {
    setErrors({});
    start(async () => {
      const result = await savePost({
        id: post?.id,
        content,
        media: media.map(({ path, mime, size, width, height }) => ({ path, mime, size, width, height })),
        intent,
        scheduledLocal: scheduledLocal || undefined,
        timezone,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        notify("error", result.error);
        return;
      }
      if (mode === "create") {
        notify("success", intent === "draft" ? "Draft saved. Find it in Posts." : "Scheduled. Find it in Posts or the calendar.");
        reset();
        router.refresh();
        return;
      }
      notify("success", result.message);
      if (onDone) onDone();
      else router.refresh();
    });
  }

  function remove() {
    if (!post || !window.confirm("Delete this post? This cannot be undone.")) return;
    start(async () => {
      const result = await deletePost(post.id);
      if (!result.ok) return notify("error", result.error);
      notify("success", result.message);
      if (onDone) onDone();
      else router.replace("/posts");
    });
  }

  return (
    <div className={cn("grid gap-6", !compact && "xl:grid-cols-[minmax(0,1fr)_19rem]")}>
      <section aria-label="Editor" className="min-w-0 space-y-4">
        {post ? (
          <div className="flex items-center gap-3">
            <StatusBadge status={post.status} />
          </div>
        ) : null}
        {post?.status === "failed" && post.failure_reason ? (
          <p role="alert" className="rounded-control bg-bad/10 px-3 py-2 text-sm text-bad">
            Publishing failed: {post.failure_reason}
          </p>
        ) : null}
        {!editable ? <p className="rounded-control bg-surface-2 px-3 py-2 text-sm text-ink-2">This post is {post?.status} and can no longer be edited.</p> : null}

        <div className="space-y-4 rounded-panel bg-surface p-5 ring-1 ring-line">
          <Field label="Post text" labelClassName="mb-2 text-lg font-semibold" htmlFor={`content-${mode}`} error={errors.content}>
            <Textarea
              ref={textArea}
              id={`content-${mode}`}
              rows={compact ? 6 : 9}
              value={content}
              disabled={!editable}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What do you want to say?"
              aria-invalid={over || Boolean(errors.content)}
              aria-describedby={errors.content ? `content-${mode}-error` : undefined}
              className="resize-y"
            />
          </Field>

          <MediaGrid media={media} onRemove={removeMedia} disabled={!editable} />
          {errors.media ? (
            <p role="alert" className="text-xs text-bad">
              {errors.media}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-4">
              <input
                ref={fileInput}
                type="file"
                accept={THREADS_IMAGE_MIME_TYPES.join(",")}
                multiple
                hidden
                aria-label="Choose images"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length > 0) void addFiles(files);
                }}
              />
              <Button size="sm" onClick={() => fileInput.current?.click()} disabled={!editable || uploading > 0 || media.length >= THREADS_MEDIA_MAX_ITEMS}>
                <ImagePlus /> {uploading > 0 ? "Uploading…" : "Add images"}
              </Button>
              <span className="text-xs text-ink-2">
                {media.length} / {THREADS_MEDIA_MAX_ITEMS} · JPEG or PNG, up to 8 MB
              </span>
            </div>
            <CharacterRing count={count} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {post ? (
            <Button variant="ghost" size="sm" onClick={remove} disabled={busy || !editable} aria-label="Delete post" className="mr-auto">
              <Trash2 /> Delete
            </Button>
          ) : null}
          <Button onClick={() => submit("draft")} disabled={busy || !editable || over}>
            <Save /> Save draft
          </Button>
        </div>

        <section aria-labelledby={`schedule-${mode}`} className="space-y-4 rounded-panel bg-surface p-5 ring-1 ring-line">
          <h2 id={`schedule-${mode}`} className="text-lg font-semibold">
            Schedule
          </h2>
          <Field label={`Publish at (${timezone})`} htmlFor={`scheduledLocal-${mode}`} error={errors.scheduledLocal} hint="Stored in UTC and shown in the timezone from Settings.">
            <Input
              id={`scheduledLocal-${mode}`}
              type="datetime-local"
              value={scheduledLocal}
              disabled={!editable}
              onChange={(e) => setScheduledLocal(e.target.value)}
              aria-invalid={Boolean(errors.scheduledLocal)}
              aria-describedby={errors.scheduledLocal ? `scheduledLocal-${mode}-error` : undefined}
            />
          </Field>
          <Button variant="primary" onClick={() => submit("schedule")} disabled={busy || !editable || over || empty || !threadsReady}>
            <Clock /> {post?.status === "scheduled" ? "Update schedule" : "Schedule post"}
          </Button>
          <p className="flex gap-1.5 text-xs text-ink-2">
            <Send className="mt-0.5 size-3 shrink-0" aria-hidden />
            {threadsReady ? (
              "Scheduled posts publish to Threads automatically, within about a minute of the scheduled time, even if you close this page."
            ) : (
              <span>
                Connect your Threads account in{" "}
                <Link href="/settings" className="font-medium text-accent underline-offset-4 hover:underline">
                  Settings
                </Link>{" "}
                to schedule posts. Drafts can be saved without it.
              </span>
            )}
          </p>
        </section>
      </section>

      <aside aria-label="Preview" className={cn("min-w-0 space-y-2", !compact && "xl:sticky xl:top-6 xl:self-start")}>
        <h2 className="text-sm font-semibold text-ink-2">Preview</h2>
        <article className="rounded-panel bg-surface p-4 ring-1 ring-line">
          <div className="flex items-center gap-2">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <p className="truncate text-sm font-semibold">{displayName}</p>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{content || <span className="text-ink-2">Your post appears here as you type.</span>}</p>
          {media.length > 0 ? (
            <div className={cn("mt-3 grid gap-1 overflow-hidden rounded-control", media.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {media.slice(0, 4).map((m, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- signed/blob URLs from private storage
                <img key={m.path} src={m.url} alt="" className={cn("w-full object-cover", media.length === 1 ? "max-h-72" : "aspect-square")} data-index={i} />
              ))}
            </div>
          ) : null}
          {media.length > 4 ? <p className="mt-1 text-xs text-ink-2">+{media.length - 4} more in the carousel</p> : null}
        </article>
        <p className="text-xs text-ink-2">An approximation. Threads controls the final layout. One image posts as a single image; two or more post as a carousel.</p>
      </aside>
    </div>
  );
}
