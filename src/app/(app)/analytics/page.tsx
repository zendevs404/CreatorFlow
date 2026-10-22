import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { AppearDiv, CountUp } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { RefreshAnalyticsButton } from "@/components/refresh-analytics-button";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/supabase/session";
import { getConnectionState } from "@/lib/threads/accounts";
import { formatInZone } from "@/lib/time";

export const metadata: Metadata = { title: "Analytics" };

const fmt = (n: number | null) => (n === null ? "—" : new Intl.NumberFormat("en-US").format(n));

export default async function AnalyticsPage() {
  const { supabase, user, profile } = await requireUser();
  const connection = await getConnectionState(supabase, user.id);

  if (connection.status === "disconnected") {
    return (
      <>
        <PageHeader title="Analytics" description="Performance data comes straight from the Threads API." />
        <EmptyState title="Connect Threads to see analytics" action={<Button asChild><Link href="/settings">Integration settings</Link></Button>}>
          No metrics are shown until a Threads account is connected and Threads returns real data.
        </EmptyState>
      </>
    );
  }
  if (connection.needsReauth || !connection.insightsEnabled) {
    return (
      <>
        <PageHeader title="Analytics" description="Performance data comes straight from the Threads API." />
        <EmptyState title={connection.needsReauth ? "Reconnect Threads" : "Analytics permission needed"} action={<Button asChild variant="primary"><Link href="/settings">Reconnect in Settings</Link></Button>}>
          {connection.needsReauth
            ? "Threads rejected the saved connection, so no data can be loaded."
            : "This connection was made before analytics existed. Reconnect to grant the threads_manage_insights permission. (The permission must also be added to your Meta app.)"}
        </EmptyState>
      </>
    );
  }

  const [{ data: account }, { data: posts }, { data: insights }] = await Promise.all([
    supabase.from("account_insights").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("posts").select("id,content,published_at").eq("user_id", user.id).eq("status", "published").order("published_at", { ascending: false }).limit(25),
    supabase.from("post_insights").select("*").eq("user_id", user.id),
  ]);
  const byPost = new Map((insights ?? []).map((i) => [i.post_id, i]));
  const hasAny = Boolean(account) || (insights ?? []).length > 0;

  const cards: [string, number | null][] = account
    ? [
        ["Followers", account.followers_count],
        ["Views (7 days)", account.views_7d],
        ["Likes (7 days)", account.likes_7d],
        ["Replies (7 days)", account.replies_7d],
        ["Reposts (7 days)", account.reposts_7d],
        ["Quotes (7 days)", account.quotes_7d],
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Analytics"
        description={account ? `Last updated ${formatInZone(account.fetched_at, profile.timezone)}. Numbers are exactly what Threads returned.` : "Performance data comes straight from the Threads API."}
        actions={<RefreshAnalyticsButton />}
      />
      {!hasAny ? (
        <EmptyState title="No data loaded yet">Press “Refresh from Threads” to load your account and post metrics. Nothing is shown until Threads returns it.</EmptyState>
      ) : (
        <div className="space-y-8">
          {cards.length > 0 ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cards.map(([label, n], i) => (
                <AppearDiv key={label} index={i} className="rounded-panel bg-surface p-4 ring-1 ring-line">
                  <dt className="text-sm text-ink-2">{label}</dt>
                  <dd className="mt-1 text-3xl font-semibold tabular-nums">{n === null ? "—" : <CountUp value={n} />}</dd>
                </AppearDiv>
              ))}
            </dl>
          ) : null}

          <section aria-labelledby="posts-h">
            <h2 id="posts-h" className="mb-3 font-semibold">
              Recent published posts
            </h2>
            {(posts ?? []).length === 0 ? (
              <EmptyState title="No published posts yet">Metrics appear here once a post has been published to Threads.</EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-panel bg-surface ring-1 ring-line">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="text-left text-ink-2">
                    <tr>
                      <th className="p-3 font-medium">Post</th>
                      {["Views", "Likes", "Replies", "Reposts", "Quotes"].map((h) => (
                        <th key={h} className="p-3 text-right font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(posts ?? []).map((p) => {
                      const i = byPost.get(p.id);
                      return (
                        <tr key={p.id}>
                          <td className="max-w-64 p-3">
                            <p className="truncate font-medium">{p.content.trim() || "Image post"}</p>
                            <p className="text-xs text-ink-2">{p.published_at ? formatInZone(p.published_at, profile.timezone) : ""}</p>
                          </td>
                          {[i?.views, i?.likes, i?.replies, i?.reposts, i?.quotes].map((v, idx) => (
                            <td key={idx} className="p-3 text-right tabular-nums">
                              {fmt(v ?? null)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-ink-2">“—” means Threads did not return that number. Views is marked “in development” by Meta. Replies of replies are not counted.</p>
          </section>
        </div>
      )}
    </>
  );
}
