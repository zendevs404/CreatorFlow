"use client";

import { motion } from "motion/react";
import { EASE } from "@/components/motion";
import { Logo } from "@/components/logo";

/** Sign in / sign up frame: slowly drifting colour glows, a card that rises in, and the logo. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
        animate={{ x: [0, 40, -30, 0], y: [0, 24, -16, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-24 size-[28rem] rounded-full bg-[#4fc98a]/15 blur-3xl"
        animate={{ x: [0, -36, 20, 0], y: [0, -20, 14, 0], scale: [1, 0.94, 1.06, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: EASE }} className="glass relative w-full max-w-sm rounded-panel p-8">
        <Logo size={72} animated stacked className="mb-6" />
        {children}
      </motion.div>
    </main>
  );
}
