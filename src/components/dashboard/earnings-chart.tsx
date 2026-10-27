"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis } from "recharts";
import { formatMoneyCompact, type Currency } from "@/lib/money";
import type { EarningsPoint } from "@/components/dashboard/calc";

/**
 * One small bar chart for a single currency. Every value is printed on its bar
 * (nothing lives only in a tooltip). Scrolls inside its own box on narrow screens.
 */
export function EarningsChart({ currency, points }: { currency: Currency; points: EarningsPoint[] }) {
  const total = points.reduce((sum, p) => sum + p.amount, 0);
  return (
    <div className="overflow-x-auto">
      <div
        className="h-48 min-w-[600px]"
        role="img"
        aria-label={`Earnings per month in ${currency}, total ${formatMoneyCompact(total, currency)} over the last ${points.length} months`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 22, right: 8, left: 8, bottom: 0 }} accessibilityLayer={false}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} fontSize={11} stroke="var(--muted-foreground)" />
            <Bar dataKey="amount" fill="var(--primary)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="amount"
                position="top"
                fontSize={11}
                fill="var(--foreground)"
                formatter={(value: unknown) => (typeof value === "number" && value !== 0 ? formatMoneyCompact(value, currency) : "")}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
