import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { signOut } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { BottomNav, SidebarNav } from "./nav";

export function AppShell({ displayName, email, children }: { displayName: string; email: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="glass fixed inset-y-3 left-3 z-30 hidden w-60 flex-col rounded-panel p-4 md:flex">
        <Link href="/dashboard" aria-label="Creator Flow home" className="mb-6 px-2">
          <Logo size={34} />
        </Link>
        <SidebarNav />
        <div className="mt-auto space-y-3 border-t border-line pt-4">
          <div className="px-2">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-ink-2">{email}</p>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
              <LogOut /> Sign out
            </Button>
          </form>
        </div>
      </aside>
      <header className="glass sticky top-3 z-20 mx-3 mt-3 flex items-center justify-between rounded-full px-4 py-2 md:hidden">
        <Link href="/dashboard" aria-label="Creator Flow home">
          <Logo size={26} />
        </Link>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
            <LogOut />
          </Button>
        </form>
      </header>
      <main id="main" className="px-4 pb-28 pt-6 md:ml-[16.5rem] md:px-10 md:pb-12 md:pt-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
