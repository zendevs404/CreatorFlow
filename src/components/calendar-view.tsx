"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { addDays, addMonths } from "@/lib/calendar";
import { cancelSchedule, reschedulePost } from "@/lib/posts/actions";
import type { PostStatus } from "@/lib/posts/status";
import { dayKey, formatInZone, utcToZonedLocal } from "@/lib/time";
import { cn } from "@/lib/utils";

export type CalendarPost = { id: string; content: string; status: PostStatus; scheduled_at: string };

type Props = { view: "month" | "week"; anchor: string; days: string[]; today: string; timezone: string; posts: CalendarPost[] };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({ view, anchor, days, today, timezone, posts }: Props) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<CalendarPost | null>(null);
  const [when, setWhen] = useState("");

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts) {
      const k = dayKey(p.scheduled_at, timezone);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [posts, timezone]);

  const step = view === "month" ? (n: number) => addMonths(anchor, n) : (n: number) => addDays(anchor, 7 * n);
  const nav = (key: string, v = view) => `/calendar?view=${v}&date=${key}`;
  const title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${anchor}T00:00:00Z`));

  function open(p: CalendarPost) {
    setSelected(p);
    setWhen(utcToZonedLocal(p.scheduled_at, timezone));
  }

  function run(task: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    start(async () => {
      const r = await task();
      notify(r.ok ? "success" : "error", (r.ok ? r.message : r.error) ?? "Done");
      if (r.ok) {
        setSelected(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Previous">
            <Link href={nav(step(-1))}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-40 text-center text-lg font-semibold">{title}</h2>
          <Button asChild variant="ghost" size="icon" aria-label="Next">
            <Link href={nav(step(1))}>
              <ChevronRight />
            </Link>
          </Button>
          <Button asChild size="sm" className="ml-2">
            <Link href={nav(today)}>Today</Link>
          </Button>
        </div>
        <div className="inline-flex rounded-control bg-surface-2 p-1 ring-1 ring-line" role="group" aria-label="View">
          {(["month", "week"] as const).map((v) => (
            <Link key={v} href={nav(anchor, v)} aria-current={view === v ? "true" : undefined} className={cn("rounded-[0.6rem] px-3 py-1 text-sm capitalize", view === v ? "bg-surface shadow-sm" : "text-ink-2")}>
              {v}
            </Link>
          ))}
        </div>
      </div>
      <p className="mb-3 text-xs text-ink-2">Times shown in {timezone}.</p>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-panel bg-line ring-1 ring-line">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-surface-2 px-2 py-2 text-center text-xs font-medium text-ink-2">
            {d}
          </div>
        ))}
        {days.map((k) => {
          const items = byDay.get(k) ?? [];
          const outside = view === "month" && k.slice(0, 7) !== anchor.slice(0, 7);
          return (
            <div key={k} className={cn("bg-surface p-1.5", view === "month" ? "min-h-24" : "min-h-56", outside && "bg-surface-2 text-ink-2")}>
              <p className={cn("mb-1 grid size-6 place-items-center rounded-full text-xs tabular-nums", k === today && "bg-accent font-semibold text-accent-ink")}>{Number(k.slice(8))}</p>
              <ul className="space-y-1">
                {items.slice(0, view === "month" ? 3 : 20).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => open(p)}
                      className={cn("w-full truncate rounded-md px-1.5 py-1 text-left text-xs", p.status === "failed" ? "bg-bad/12 text-bad" : p.status === "published" ? "bg-ok/15 text-ok" : "bg-accent/12 text-accent")}
                    >
                      {formatInZone(p.scheduled_at, timezone, { dateStyle: undefined, timeStyle: "short" })} {p.content.trim() || "Untitled"}
                    </button>
                  </li>
                ))}
                {view === "month" && items.length > 3 ? <li className="px-1.5 text-xs text-ink-2">+{items.length - 3} more</li> : null}
              </ul>
            </div>
          );
        })}
      </div>

      {posts.length === 0 ? <p className="mt-4 text-center text-sm text-ink-2">No scheduled posts in this period. Schedule one from the Content Studio.</p> : null}

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected ? (
          <DialogContent title="Scheduled post" description={formatInZone(selected.scheduled_at, timezone, { dateStyle: "full", timeStyle: "short" })}>
            <div className="space-y-4">
              <StatusBadge status={selected.status} />
              <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-sm">{selected.content || "Untitled draft"}</p>
              {selected.status === "scheduled" ? (
                <>
                  <Field label={`Reschedule (${timezone})`} htmlFor="reschedule">
                    <Input id="reschedule" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" disabled={pending || !when} onClick={() => run(() => reschedulePost({ id: selected.id, scheduledLocal: when, timezone }))}>
                      Save new time
                    </Button>
                    <Button variant="danger" disabled={pending} onClick={() => run(() => cancelSchedule(selected.id))}>
                      Cancel schedule
                    </Button>
                    <Button asChild variant="ghost">
                      <Link href={`/posts?edit=${selected.id}`}>Edit text</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <Button asChild>
                  <Link href={`/posts?edit=${selected.id}`}>Open post</Link>
                </Button>
              )}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
