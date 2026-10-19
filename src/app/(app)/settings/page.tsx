import type { Metadata } from "next";
import { LogOut, Plug } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-actions";
import { requireUser } from "@/lib/supabase/session";

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

export default async function SettingsPage() {
  const { user, profile } = await requireUser();
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2">No account connected. Connecting uses Meta&rsquo;s official OAuth and arrives in Phase 2; it needs a Meta app and Threads permissions.</p>
            <Button disabled>
              <Plug /> Connect Threads
            </Button>
          </div>
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
