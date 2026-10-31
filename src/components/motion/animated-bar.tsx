"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Progress fill that animates to its value. It slides a full-width, rounded
 * fill with translateX inside an overflow-hidden track, so the animation is
 * transform only (no width/layout work) and the rounded end stays crisp.
 * Under reduced motion the fill is simply set to its value.
 */
export function AnimatedBar({
  value,
  label,
  className,
  barClassName,
  delay = 0.1,
}: {
  value: number;
  label: string;
  className?: string;
  barClassName?: string;
  delay?: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const reduce = useReducedMotion();
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <motion.div
        className={cn(
          "absolute inset-0 rounded-full bg-primary",
          pct === 100 && "bg-success",
          barClassName,
        )}
        initial={reduce ? false : { x: "-100%" }}
        animate={{ x: `${pct - 100}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      />
    </div>
  );
}
