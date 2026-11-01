import { formatMoney, type Currency } from "@/lib/money";
import { rateWithMonthly } from "@/lib/engagement";
import { UNIT_LABELS } from "@/lib/billing";
import type { RateUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A retainer rate with its per-month amount beside it: "£250.00 / hour" and,
 * beneath, "about £44,000.00 / month" worked out from the working schedule.
 * A per-month rate shows once. Money stays in the project's own currency.
 * Server safe.
 */
export function RateWithMonthly({
  rate,
  unit,
  currency,
  hoursPerDay,
  daysPerMonth,
  monthly: monthlyOverride,
  layout = "stacked",
  className,
}: {
  rate: number;
  unit: RateUnit | null | undefined;
  currency: Currency;
  hoursPerDay?: number;
  daysPerMonth?: number;
  /** Use this monthly figure (a prospect's own estimate) instead of the computed one. */
  monthly?: number;
  layout?: "stacked" | "inline";
  className?: string;
}) {
  const u: RateUnit = unit ?? "hour";
  const r = rateWithMonthly(u, rate, hoursPerDay, daysPerMonth);
  const monthly = monthlyOverride ?? r.monthly;
  return (
    <span className={cn("tabular-nums", layout === "stacked" ? "inline-flex flex-col" : "inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span>
        {formatMoney(rate, currency)} <span className="text-[0.85em] font-normal text-muted-foreground">/ {UNIT_LABELS[u].singular}</span>
      </span>
      {u !== "month" && monthly !== null && monthly > 0 ? (
        <span className="text-[0.85em] font-normal text-muted-foreground">about {formatMoney(monthly, currency)} / month</span>
      ) : null}
    </span>
  );
}
