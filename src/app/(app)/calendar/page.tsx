import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar-view";
import { PageHeader } from "@/components/page-header";
import { isDayKey, monthGrid, paddedRange, weekDays } from "@/lib/calendar";
import { listScheduled } from "@/lib/posts/queries";
import { requireUser } from "@/lib/supabase/session";
import { dayKey } from "@/lib/time";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser();
  const today = dayKey(new Date(), profile.timezone);
  const anchor = isDayKey(sp.date) ? sp.date : today;
  const view = sp.view === "week" ? "week" : "month";
  const days = view === "week" ? weekDays(anchor) : monthGrid(anchor);
  const { from, to } = paddedRange(days);
  const rows = await listScheduled(supabase, user.id, from, to);
  const posts = rows.flatMap((p) => (p.scheduled_at ? [{ id: p.id, content: p.content, status: p.status, scheduled_at: p.scheduled_at }] : []));

  return (
    <>
      <PageHeader title="Calendar" description="See what is scheduled and move it around." />
      <CalendarView view={view} anchor={anchor} days={days} today={today} timezone={profile.timezone} posts={posts} />
    </>
  );
}
