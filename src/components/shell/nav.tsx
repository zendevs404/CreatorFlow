"use client";

import { BarChart3, CalendarDays, LayoutDashboard, ListChecks, PenLine, Settings } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/studio", label: "Studio", Icon: PenLine },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/posts", label: "Posts", Icon: ListChecks },
  { href: "/analytics", label: "Analytics", Icon: BarChart3 },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors", active ? "text-accent" : "text-ink-2 hover:bg-line hover:text-ink")}
          >
            {active ? <motion.span layoutId="sidebar-pill" className="absolute inset-0 rounded-control bg-accent/12" transition={{ type: "spring", stiffness: 380, damping: 32 }} /> : null}
            <Icon className="relative size-[18px]" aria-hidden />
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="glass fixed inset-x-3 bottom-3 z-40 grid grid-cols-6 rounded-full p-1 md:hidden">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex h-11 items-center justify-center rounded-full transition-colors", active ? "text-accent" : "text-ink-2")}
          >
            {active ? <motion.span layoutId="bottom-pill" className="absolute inset-0 rounded-full bg-accent/15" transition={{ type: "spring", stiffness: 380, damping: 32 }} /> : null}
            <Icon className="relative size-5" aria-hidden />
          </Link>
        );
      })}
    </nav>
  );
}
