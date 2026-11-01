"use client";

import { motion, useReducedMotion } from "motion/react";
import { CATEGORY_COLOR, CATEGORY_LABELS } from "@/components/expenses/labels";
import type { CategoryBreakdown } from "@/lib/expenses";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

function percent(share: number): string {
  const pct = share * 100;
  return pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

/** One bar: a rounded track with a coloured fill that slides to its share (transform only, off for reduced motion). */
function Bar({ share, color, delay }: { share: number; color: string; delay: number }) {
  const reduce = useReducedMotion();
  const pct = Math.max(2, Math.min(100, share * 100));
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
        initial={reduce ? false : { x: "-100%" }}
        animate={{ x: `${pct - 100}%` }}
        transition={{ duration: 0.7, ease: EASE_OUT, delay }}
      />
    </div>
  );
}

/**
 * Spending by category as a ranked list of animated bars. Every value is also
 * printed as text (amount and share), so nothing depends on seeing the bar.
 * One group per currency, or a single PHP group when converted.
 */
export function CategoryBars({ groups, label, className }: { groups: CategoryBreakdown[]; label: string; className?: string }) {
  return (
    <div className={cn("grid gap-6", className)} data-testid="category-breakdown">
      {groups.map((group) => (
        <section key={group.currency} aria-label={`${label}, ${group.currency}`} className="grid gap-3">
          {groups.length > 1 || group.currency !== "PHP" ? (
            <p className="flex items-baseline justify-between gap-3 text-xs font-medium text-muted-foreground">
              <span>{group.currency}</span>
              <span className="tabular-nums">Total {formatMoney(group.total, group.currency)}</span>
            </p>
          ) : null}
          <ul className="grid gap-3">
            {group.rows.map((row, i) => (
              <li key={row.category} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[row.category] }} aria-hidden />
                    <span className="truncate font-medium">{CATEGORY_LABELS[row.category]}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{formatMoney(row.amount, group.currency)}</span>
                    <span className="ml-2 inline-block w-9 text-right text-xs text-muted-foreground">{percent(row.share)}</span>
                  </span>
                </div>
                <Bar share={row.share} color={CATEGORY_COLOR[row.category]} delay={0.08 + i * 0.05} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
