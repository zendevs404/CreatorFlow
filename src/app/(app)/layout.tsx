import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/supabase/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUser();
  return (
    <AppShell displayName={profile.display_name ?? "Your account"} email={user.email ?? ""}>
      {children}
    </AppShell>
  );
}
