"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { GhostChart } from "@/components/dashboard/ghost-chart";
import { PeriodChart, type ChartMode, type ChartPoint } from "@/components/dashboard/period-chart";
import { RangeControl } from "@/components/dashboard/range-control";
import { SegmentedControl } from "@/components/dashboard/segmented-control";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import { CURRENCY_COLOR } from "@/components/dashboard/colors";
import type { PeriodSummary } from "@/components/dashboard/calc";
import type { RangeData, RangeEarningsSeries } from "@/components/dashboard/range-calc";
import { earliestAllowed, RANGE_LABELS, rangeText, type Granularity } from "@/lib/date-range";
import { CURRENCIES, formatMoney, formatMoneyCompact, type Currency } from "@/lib/money";
import { cn } from "cn";

/** Wording for each bar size. */
export const GRAIN: Record<Granularity, { noun: string; plural: string; label: string; perLabel: string }> = {
  daily: { noun: "day", plural: "days", label: "Daily", perLabel: "Per day" },
  weekly: { noun: "week", plural: "weeks", label: "Weekly", perLabel: "Per week" },
  monthly: { noun: "month", plural: "months", label: "Monthly", perLabel: "Per month" },
};

/** The Daily / Weekly / Monthly options, with the ones that would need too many bars disabled and explained. */
export function granularityOptions(choices: RangeData["choices"]) {
  return (["daily", "weekly", "monthly"] as Granularity[]).map((g) => ({
    value: g,
    label: GRAIN[g].label,
    disabled: !choices[g].ok,
    hint: choices[g].reason ?? undefined,
  }));
}

/** "Last 12 weeks" for a preset, "Custom range" otherwise. */
export const rangeName = (preset: RangeData["range"]["preset"]) => (preset === "custom" ? "Custom range" : RANGE_LABELS[preset]);

type CardData = { currency: Currency; points: ChartPoint[]; summary: PeriodSummary };

function toCardData(series: RangeEarningsSeries[]): CardData[] {
  return series.map((s) => ({
    currency: s.currency,
    summary: s.summary,
    points: s.points.map((p) => ({ key: p.key, axisLabel: p.axisLabel, longLabel: p.longLabel, value: p.amount, cumulative: p.cumulative })),
  }));
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

function EarningsCard({ data, grain, mode, range, previousLabel }: { data: CardData; grain: Granularity; mode: ChartMode; range: RangeData["range"]; previousLabel: string }) {
  const { currency, points, summary } = data;
  const copy = GRAIN[grain];
  const color = CURRENCY_COLOR[currency];
  const money = (n: number) => formatMoney(n, currency);
  // Whole units on the axis and bar labels, so 824.69 reads as 825 rather than 824.7.
  const compact = (n: number) => formatMoneyCompact(Math.round(n / 100) * 100, currency);

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
              <span className="font-medium text-foreground">{currency}</span>
              <span aria-hidden>·</span>
              <span>{rangeName(range.preset)}</span>
            </div>
            <div className="mt-1.5 text-3xl font-semibold tracking-tight" data-testid={`range-total-${currency}`}>
              <AnimatedNumber kind="money" currency={currency} value={summary.total} fractionClassName="text-lg font-medium text-muted-foreground" />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <TrendBadge trend={summary.trend} pct={summary.pct} versus={previousLabel} />
            <span className="text-xs text-muted-foreground">vs {previousLabel}</span>
          </div>
        </div>

        <PeriodChart
          points={points}
          mode={mode}
          color={color}
          format={money}
          formatAxis={compact}
          unit={`per ${copy.noun}`}
          currentLabel=""
          fadeKey={`${grain}-${mode}`}
        />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
          <Stat label="Total in range" value={money(summary.total)} hint={rangeText(range)} />
          <Stat label={`Average per ${copy.noun}`} value={money(Math.round(summary.average))} />
          <Stat label={`Previous ${range.days} ${range.days === 1 ? "day" : "days"}`} value={money(summary.previous)} />
          <Stat label={`Best ${copy.noun}`} value={summary.best ? money(summary.best.amount) : "None in range"} hint={summary.best?.label} />
        </dl>

        <div className="sr-only">
          <table>
            <caption>
              {currency} earnings per {copy.noun}, {rangeText(range)}
            </caption>
            <thead>
              <tr>
                <th scope="col">{copy.noun === "day" ? "Day" : copy.noun === "week" ? "Week" : "Month"}</th>
                <th scope="col">Received</th>
                <th scope="col">Running total</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key}>
                  <th scope="row">{p.longLabel}</th>
                  <td>{money(p.value)}</td>
                  <td>{money(p.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** What was received in the range: one figure in PHP, or one per currency (currencies are never added together). */
function EarnedInRange({ data, converted }: { data: RangeData; converted: boolean }) {
  const none = CURRENCIES.every((c) => data.earned[c] === undefined);
  const parts = none ? [] : converted && data.converted ? [formatMoney(data.converted.earned, "PHP")] : CURRENCIES.filter((c) => data.earned[c] !== undefined).map((c) => formatMoney(data.earned[c] ?? 0, c));
  return (
    <div className="min-w-0" data-testid="earned-in-range">
      <p className="text-xs font-medium text-muted-foreground">Earned in selected range</p>
      <p className="mt-0.5 text-lg leading-tight font-semibold tabular-nums">{parts.length > 0 ? parts.join(" + ") : "Nothing received"}</p>
      <p className="text-xs text-muted-foreground">{rangeText(data.range)}</p>
    </div>
  );
}

/**
 * Earnings charts for the chosen date range, one card per currency (currencies never share
 * an axis) or one PHP card. The range control sits in the header and drives the URL; bar size
 * (Daily, Weekly, Monthly) and per bar or running total are switches on top of it. The range
 * changes remount this component (key), so the bar size always starts at the range default.
 */
export function EarningsSection({
  data,
  converted = false,
  today,
}: {
  data: RangeData;
  /** The series are PHP totals converted at the current rate. */
  converted?: boolean;
  today: string;
}) {
  const [grain, setGrain] = useState<Granularity>(data.defaultGranularity);
  const [mode, setMode] = useState<ChartMode>("period");

  const series = converted && data.converted ? data.converted.earnings[grain] : data.earnings[grain];
  const cards = toCardData(series);
  const copy = GRAIN[grain];

  return (
    <section aria-labelledby="earnings-heading" className="grid gap-4" data-testid="earnings-section">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 lg:max-w-2xl">
          <h2 id="earnings-heading" className="text-base font-semibold tracking-tight">
            Earnings
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Money received per {copy.noun}, by the day it was paid in Manila. Weeks start on Monday, and a range that starts or ends mid-week or mid-month shows that bar as partial.
            {converted ? " Shown in PHP at today's exchange rates." : ""}
          </p>
        </div>
        <RangeControl preset={data.range.preset} from={data.range.from} to={data.range.to} today={today} earliest={earliestAllowed(today)} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <EarnedInRange data={data} converted={converted} />
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl label="Group earnings by" value={grain} onChange={setGrain} options={granularityOptions(data.choices)} />
          <SegmentedControl
            label="Chart type"
            value={mode}
            onChange={setMode}
            options={[
              { value: "period", label: copy.perLabel },
              { value: "cumulative", label: "Running total" },
            ]}
          />
        </div>
      </div>
      <p className="sr-only" role="status">
        Showing {grain} earnings for {rangeText(data.range)} as {mode === "period" ? `a bar chart per ${copy.noun}` : "a running total"}.
      </p>

      {cards.length === 0 ? (
        <Card>
          <CardContent>
            <GhostChart
              title="No earnings in this range"
              description="Pick a longer range, or record a payment on a project and it will chart here."
              action={
                <Link href="/admin/projects" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  <BarChart3 aria-hidden />
                  Go to projects
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className={cn("grid gap-4", cards.length > 1 && "xl:grid-cols-2", cards.length % 2 === 1 && "xl:[&>*:last-child]:col-span-2")}>
          {cards.map((card) => (
            <EarningsCard key={card.currency} data={card} grain={grain} mode={mode} range={data.range} previousLabel={data.previousLabel} />
          ))}
        </div>
      )}
    </section>
  );
}
