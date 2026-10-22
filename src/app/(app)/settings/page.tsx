import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-actions";
import { insightsEnabledByConfig, missingServerEnv } from "@/lib/env";
import { requireUser } from "@/lib/supabase/session";
import { ThreadsIntegration } from "@/components/threads-integration";
import { getConnectionState } from "@/lib/threads/accounts";
import { redirectUriFor } from "@/lib/threads/oauth";
import { formatInZone } from "@/lib/time";

export const metadata: Metadata = { title: "Settings" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-surface p-6 ring-1 ring-line">
      <h2 className="font-semibold">{title}</h2>
      {description ? <p className="mb-4 mt-1 text-sm text-ink-2">{description}</p> : <div className="mb-4" />}
      {children}
    </section>
  );
}

const THREADS_NOTICES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Threads connected." },
  denied: { ok: false, text: "Threads permission was not granted, so nothing was connected." },
  invalid_state: { ok: false, text: "The connection attempt could not be verified (it may have expired). Please try again." },
  error: { ok: false, text: "Threads could not be connected. Check the app settings and try again." },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ threads?: string }> }) {
  const { threads } = await searchParams;
  const { supabase, user, profile } = await requireUser();
  const connection = await getConnectionState(supabase, user.id);
  const notice = threads ? THREADS_NOTICES[threads] : undefined;
  const connected = connection.status === "connected";
  const expired = connected && connection.expiresAt ? new Date(connection.expiresAt) <= new Date() : false;
  const zones = Intl.supportedValuesOf("timeZone");
  const timezones = zones.includes(profile.timezone) ? zones : [profile.timezone, ...zones];

  return (
    <>
      <PageHeader title="Settings" />
      <div className="max-w-2xl space-y-6">
        <Section title="Profile" description="Your name appears in the post preview.">
          <SettingsForm displayName={profile.display_name ?? ""} timezone={profile.timezone} timezones={timezones} />
        </Section>
        <Section title="Appearance">
          <ThemeToggle />
        </Section>
        <Section title="Threads integration" description="Connect your Threads account to publish scheduled posts.">
          {notice ? (
            <p role={notice.ok ? "status" : "alert"} className={`mb-4 rounded-control px-3 py-2 text-sm ${notice.ok ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad"}`}>
              {notice.text}
            </p>
          ) : null}
          <ThreadsIntegration
            view={{
              status: connection.status,
              username: connected ? connection.username : null,
              expiresLabel: connected && connection.expiresAt ? formatInZone(connection.expiresAt, profile.timezone, { timeStyle: undefined }) : null,
              needsReauth: connected ? connection.needsReauth : false,
              expired,
              lastError: connected ? connection.lastError : null,
              insightsEnabled: connected ? connection.insightsEnabled : true,
              insightsConfigured: insightsEnabledByConfig(),
              missingServerSettings: missingServerEnv(),
              redirectUri: redirectUriFor(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
            }}
          />
        </Section>
        <Section title="Account" description={user.email ?? undefined}>
          <form action={signOut}>
            <Button type="submit">
              <LogOut /> Sign out
            </Button>
          </form>
        </Section>
      </div>
    </>
  );
}
