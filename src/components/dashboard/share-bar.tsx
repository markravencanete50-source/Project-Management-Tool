"use client";

import { motion } from "motion/react";
import { EASE_OUT } from "@/components/dashboard/motion";

/**
 * One stacked bar: the one-off share against the recurring share of the first
 * year. Each segment grows from the left on mount (a transform, which motion
 * switches off under prefers-reduced-motion via the dashboard MotionRoot).
 */
export function ShareBar({ oneOff, recurring }: { oneOff: number; recurring: number }) {
  const total = oneOff + recurring;
  if (total <= 0) return null;
  const oneOffPct = Math.round((oneOff / total) * 100);
  const segments = [
    { key: "oneoff", pct: oneOffPct, className: "bg-info", label: "One-off" },
    { key: "recurring", pct: 100 - oneOffPct, className: "bg-violet", label: "Recurring" },
  ].filter((s) => s.pct > 0);
  return (
    <div className="grid gap-1.5">
      <div
        role="img"
        aria-label={`First year potential: ${oneOffPct}% one-off, ${100 - oneOffPct}% recurring`}
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {segments.map((s, i) => (
          <motion.span
            key={s.key}
            className={`h-full origin-left ${s.className}`}
            style={{ width: `${s.pct}%` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 + i * 0.08 }}
          />
        ))}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-full ${s.className}`} />
            {s.label} {s.pct}%
          </span>
        ))}
      </p>
    </div>
  );
}
