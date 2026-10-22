"use client";

import { motion } from "motion/react";
import { EASE } from "@/components/motion";

/** A template (unlike a layout) is re-created on every navigation, which replays this entrance. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
      {children}
    </motion.div>
  );
}
