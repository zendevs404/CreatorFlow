"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  /** Pixel size of the mark. */
  size?: number;
  /** Show the "Creator Flow" wordmark next to the mark. */
  wordmark?: boolean;
  /** Entrance animation (used on the sign in and sign up pages). */
  animated?: boolean;
  className?: string;
  /** Stack mark above text and centre it. */
  stacked?: boolean;
};

export function Logo({ size = 32, wordmark = true, animated = false, stacked = false, className }: Props) {
  const mark = (
    <Image src="/logo.png" alt={wordmark ? "" : "Creator Flow"} width={size} height={size} priority className="shrink-0 select-none" draggable={false} />
  );
  return (
    <div className={cn("flex items-center gap-2.5", stacked && "flex-col gap-3 text-center", className)}>
      {animated ? (
        <motion.div initial={{ opacity: 0, scale: 0.7, rotate: -12 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 180, damping: 14 }} whileHover={{ rotate: 8, scale: 1.06 }}>
          {mark}
        </motion.div>
      ) : (
        mark
      )}
      {wordmark ? (
        <motion.span
          initial={animated ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: animated ? 0.15 : 0, duration: 0.4 }}
          className={cn("font-semibold tracking-tight", stacked ? "text-2xl" : "text-base")}
        >
          Creator Flow
        </motion.span>
      ) : null}
    </div>
  );
}
