"use client";

import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "@/components/dashboard/motion";
import { formatMoney, type Currency } from "@/lib/money";

const INCOME = "var(--success)";
const EXPENSE = "var(--chart-4)";

function Row({ label, value, max, color, currency, delay }: { label: string; value: number; max: number; color: string; currency: Currency; delay: number }) {
  const reduce = useReducedMotion();
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          {label}
        </span>
        <span className="font-semibold tabular-nums">{formatMoney(value, currency)}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color }}
          initial={reduce ? false : { x: "-100%" }}
          animate={{ x: `${pct - 100}%` }}
          transition={{ duration: 0.7, ease: EASE_OUT, delay }}
        />
      </div>
    </div>
  );
}

/** This month's money in against money out as two bars on one scale. The amounts are printed beside them. */
export function FlowMiniBars({ income, expense, currency }: { income: number; expense: number; currency: Currency }) {
  const max = Math.max(income, expense);
  return (
    <div className="grid gap-2.5" role="group" aria-label={`This month, ${currency}: received against spent`}>
      <Row label="Received" value={income} max={max} color={INCOME} currency={currency} delay={0.15} />
      <Row label="Spent" value={expense} max={max} color={EXPENSE} currency={currency} delay={0.22} />
    </div>
  );
}
