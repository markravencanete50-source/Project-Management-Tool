import { AnimatedBar } from "@/components/motion/animated-bar";
import { Badge } from "@/components/ui/badge";
import { entryAmount, formatQuantity } from "@/lib/billing";
import { expectedQuantity, meterState, type MeterState } from "@/lib/engagement";
import { formatMoney, type Currency } from "@/lib/money";
import type { RateUnit } from "@/lib/types";

const STATE: Record<Exclude<MeterState, "none">, { label: string; bar: string; badge: "info" | "success" | "warning" }> = {
  under: { label: "Under", bar: "bg-info", badge: "info" },
  on_track: { label: "On track", bar: "bg-success", badge: "success" },
  over: { label: "Over", bar: "bg-warning", badge: "warning" },
};

/**
 * This month's logged time against what the working schedule expects:
 * "{logged} of {expected} expected hours", with the amount logged versus expected.
 */
export function TimeMeter({
  unit,
  rate,
  currency,
  loggedHundredths,
  hoursPerDay,
  daysPerMonth,
  monthLabel,
}: {
  unit: RateUnit;
  rate: number;
  currency: Currency;
  loggedHundredths: number;
  hoursPerDay: number;
  daysPerMonth: number;
  monthLabel: string;
}) {
  const expected = expectedQuantity(unit, hoursPerDay, daysPerMonth);
  const state = meterState(loggedHundredths, expected);
  if (state === "none") return null;
  const word = unit === "hour" ? "hours" : "days";
  const pct = (loggedHundredths / expected) * 100;
  const s = STATE[state];
  return (
    <section aria-label={`Schedule check for ${monthLabel}`} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{monthLabel} against your schedule</h3>
        <Badge variant={s.badge} dot>
          {s.label}
        </Badge>
      </div>
      <AnimatedBar value={pct} label={`${monthLabel} logged against expected`} barClassName={s.bar} className="h-2.5" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm tabular-nums">
        <span>
          <span className="font-semibold">{formatQuantity(loggedHundredths, unit).replace(/ \w+$/, "")}</span> of{" "}
          {formatQuantity(expected, unit).replace(/ \w+$/, "")} expected {word}
        </span>
        <span className="text-muted-foreground">
          {formatMoney(entryAmount(loggedHundredths, rate), currency)} of {formatMoney(entryAmount(expected, rate), currency)} expected
        </span>
      </div>
    </section>
  );
}
