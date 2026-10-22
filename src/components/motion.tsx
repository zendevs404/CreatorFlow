"use client";

import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Shared ease: quick start, soft landing. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Items beyond this index appear together, so long lists never feel slow. */
const MAX_STAGGER_STEPS = 10;
const delayFor = (index: number) => Math.min(index, MAX_STAGGER_STEPS) * 0.04;

type AppearProps = { children: ReactNode; index?: number; className?: string };

const appear = (index: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE, delay: delayFor(index) },
});

export function AppearDiv({ children, index = 0, className }: AppearProps) {
  return (
    <motion.div className={className} {...appear(index)}>
      {children}
    </motion.div>
  );
}

export function AppearLi({ children, index = 0, className }: AppearProps) {
  return (
    <motion.li className={className} {...appear(index)}>
      {children}
    </motion.li>
  );
}

export function AppearSection({ children, index = 0, className, ...rest }: AppearProps & { "aria-labelledby"?: string; "aria-label"?: string }) {
  return (
    <motion.section className={className} {...rest} {...appear(index)}>
      {children}
    </motion.section>
  );
}

/** Counts up to `value` once. Screen readers get the final number immediately; reduced motion skips the count. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: EASE,
      onUpdate: (v) => {
        from.current = v;
        setShown(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
  return (
    <span className={className}>
      <span aria-hidden>{fmt(reduce ? value : shown)}</span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  );
}
