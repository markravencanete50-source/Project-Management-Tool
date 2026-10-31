"use client";

import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "@/components/dashboard/motion";

/** A circular gauge for a 0 to 1 fraction. Decorative: the figure beside it carries the meaning. */
export function ProgressRing({
  fraction,
  size = 60,
  color = "var(--primary)",
}: {
  fraction: number;
  size?: number;
  color?: string;
}) {
  const reduce = useReducedMotion();
  const stroke = 6;
  const r = (size - stroke) / 2;
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: clamped }}
        transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.15 }}
      />
    </svg>
  );
}
