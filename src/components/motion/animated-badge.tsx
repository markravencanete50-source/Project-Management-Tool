"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

/**
 * Wraps a badge so that when `k` (the status) changes, the old badge fades out
 * and the new one pops in. The first render is not animated, so server-rendered
 * pages never flash.
 */
export function AnimatedBadge({ k, children }: { k: string; children: ReactNode }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        key={k}
        className="inline-flex"
        initial={{ opacity: 0, scale: 0.8, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: -4 }}
        transition={{ type: "spring", stiffness: 520, damping: 32, mass: 0.7 }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
