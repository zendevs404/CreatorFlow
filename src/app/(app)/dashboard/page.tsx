import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, PenLine, Plug } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { canSchedule, getConnectionState } from "@/lib/threads/accounts";
import { dashboardData } from "@/lib/posts/queries";
import { requireUser } from "@/lib/supabase/session";
import { formatInZone } from "@/lib/time";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { supabase, user, profile } = await requireUser();
  const { upcoming, recent, byStatus } = await dashboardData(supabase, user.id);
  const connection = await getConnectionState(supabase, user.id);
  const ready = canSchedule(connection);
  const summary = [
    ["Drafts", byStatus.draft],
    ["Scheduled", byStatus.scheduled],
    ["Published", byStatus.published],
    ["Failed", byStatus.failed],
  ] as const;

  return (
    <>
      <PageHeader
        title={`Hello, ${profile.display_name ?? "there"}`}
        description="Your Threads workspace at a glance."
        actions={
          <Button asChild variant="primary">
            <Link href="/studio">
              <PenLine /> New post
            </Link>
          </Button>
        }
      />

      <section aria-label="Threads connection" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-panel bg-surface p-5 ring-1 ring-line">
        <div className="flex items-center gap-3">
          <Plug aria-hidden className="size-5 text-ink-2" />
          <div>
            <p className="font-medium">
              {connection.status === "connected" ? (ready ? `Threads connected${connection.username ? ` as @${connection.username}` : ""}` : "Threads needs to be reconnected") : "No Threads account connected"}
            </p>
            <p className="text-sm text-ink-2">
              {ready ? "Scheduled posts publish automatically, even when you are offline." : "Connect your account to schedule posts. You can still write and save drafts."}
            </p>
          </div>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/settings">{ready ? "Integration settings" : "Connect now"}</Link>
        </Button>
      </section>

      <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map(([label, n]) => (
          <div key={label} className="rounded-panel bg-surface p-4 ring-1 ring-line">
            <dt className="text-sm text-ink-2">{label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="upcoming">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="upcoming" className="font-semibold">
              Upcoming
            </h2>
            <Link href="/calendar" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              Calendar <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              action={
                <Button asChild size="sm">
                  <Link href="/studio">
                    <CalendarDays /> Schedule a post
                  </Link>
                </Button>
              }
            >
              Schedule a post and it will appear here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line rounded-panel bg-surface ring-1 ring-line">
              {upcoming.map((p) => (
                <li key={p.id} className="p-4">
                  <Link href={`/posts?edit=${p.id}`} className="line-clamp-2 break-words font-medium hover:underline">
                    {p.content.trim() || "Untitled draft"}
                  </Link>
                  <p className="mt-1 text-xs text-ink-2">{p.scheduled_at ? formatInZone(p.scheduled_at, profile.timezone) : null}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="activity">
          <h2 id="activity" className="mb-3 font-semibold">
            Publishing activity
          </h2>
          {recent.length === 0 ? (
            <EmptyState title="No publishing activity yet">Each attempt to publish to Threads is listed here with its outcome.</EmptyState>
          ) : (
            <ul className="divide-y divide-line rounded-panel bg-surface ring-1 ring-line">
              {recent.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <StatusBadge status={a.outcome === "succeeded" ? "published" : a.outcome === "failed" ? "failed" : "publishing"} />
                  <span className="min-w-0 flex-1 truncate text-ink-2">{a.error_message ?? "Completed"}</span>
                  <time className="text-xs text-ink-2" dateTime={a.started_at}>
                    {formatInZone(a.started_at, profile.timezone)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
