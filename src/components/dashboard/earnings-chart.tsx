"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { GhostChart } from "@/components/dashboard/ghost-chart";
import { PeriodChart, type ChartMode, type ChartPoint } from "@/components/dashboard/period-chart";
import { SegmentedControl } from "@/components/dashboard/segmented-control";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import { CURRENCY_COLOR } from "@/components/dashboard/colors";
import type { EarningsSeries, PeriodSummary, WeeklyEarningsSeries } from "@/components/dashboard/calc";
import { formatMoney, formatMoneyCompact, type Currency } from "@/lib/money";
import { cn } from "cn";

type Period = "weekly" | "monthly";

const COPY: Record<Period, { noun: string; plural: string; current: string; previous: string; window: string; average: string; best: string }> = {
  weekly: {
    noun: "week",
    plural: "weeks",
    current: "This week so far",
    previous: "Last week",
    window: "Last 12 weeks",
    average: "Weekly average",
    best: "Best week",
  },
  monthly: {
    noun: "month",
    plural: "months",
    current: "This month so far",
    previous: "Last month",
    window: "Last 12 months",
    average: "Monthly average",
    best: "Best month",
  },
};

type CardData = {
  currency: Currency;
  points: ChartPoint[];
  summary: PeriodSummary;
};

function toCardData(series: (EarningsSeries | WeeklyEarningsSeries)[]): CardData[] {
  return series.map((s) => ({
    currency: s.currency,
    summary: s.summary,
    points: s.points.map((p) => ({
      key: "week" in p ? p.week : p.month,
      axisLabel: p.axisLabel,
      longLabel: p.longLabel,
      value: p.amount,
      cumulative: p.cumulative,
    })),
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

function EarningsCard({ data, period, mode }: { data: CardData; period: Period; mode: ChartMode }) {
  const { currency, points, summary } = data;
  const copy = COPY[period];
  const color = CURRENCY_COLOR[currency];
  const empty = summary.total === 0;
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
              <span>{copy.current}</span>
            </div>
            <div className="mt-1.5 text-3xl font-semibold tracking-tight">
              <AnimatedNumber
                kind="money"
                currency={currency}
                value={summary.current}
                fractionClassName="text-lg font-medium text-muted-foreground"
              />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <TrendBadge trend={summary.trend} pct={summary.pct} versus={copy.previous.toLowerCase()} />
            <span className="text-xs text-muted-foreground">vs {copy.previous.toLowerCase()}</span>
          </div>
        </div>

        {empty ? (
          <GhostChart
            title={`No ${currency} payments in the last 12 ${copy.plural}`}
            description="Switch to monthly to see older payments."
          />
        ) : (
          <PeriodChart
            points={points}
            mode={mode}
            color={color}
            format={money}
            formatAxis={compact}
            unit={`this ${copy.noun}`}
            currentLabel="so far"
            fadeKey={`${period}-${mode}`}
          />
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
          <Stat label={copy.window} value={money(summary.total)} />
          <Stat label={copy.average} value={money(Math.round(summary.average))} />
          <Stat label={copy.previous} value={money(summary.previous)} />
          <Stat label={copy.best} value={summary.best ? money(summary.best.amount) : "None yet"} hint={summary.best?.label} />
        </dl>

        <table className="sr-only">
          <caption>
            {currency} earnings per {copy.noun}, {copy.window.toLowerCase()}
          </caption>
          <thead>
            <tr>
              <th scope="col">{copy.noun === "week" ? "Week" : "Month"}</th>
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
      </CardContent>
    </Card>
  );
}

/**
 * Earnings charts, one card per currency (currencies never share an axis).
 * One pair of toggles drives every card: weekly or monthly, and per period or
 * running total.
 */
export function EarningsSection({ monthly, weekly }: { monthly: EarningsSeries[]; weekly: WeeklyEarningsSeries[] }) {
  const [period, setPeriod] = useState<Period>("weekly");
  const [mode, setMode] = useState<ChartMode>("period");

  const cards = toCardData(period === "weekly" ? weekly : monthly);
  const copy = COPY[period];

  return (
    <section aria-labelledby="earnings-heading" className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="earnings-heading" className="text-base font-semibold tracking-tight">
            Earnings
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Money received per {copy.noun}, by the day it was paid in Manila. Weeks start on Monday.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Group earnings by"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
          <SegmentedControl
            label="Chart type"
            value={mode}
            onChange={setMode}
            options={[
              { value: "period", label: `Per ${copy.noun}` },
              { value: "cumulative", label: "Running total" },
            ]}
          />
        </div>
      </div>
      <p className="sr-only" role="status">
        Showing {period} earnings as {mode === "period" ? `a bar chart per ${copy.noun}` : "a running total"}.
      </p>

      {cards.length === 0 ? (
        <Card>
          <CardContent>
            <GhostChart
              title="No earnings yet"
              description="Record a payment on a project and your weekly and monthly earnings will chart here."
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
            <EarningsCard key={card.currency} data={card} period={period} mode={mode} />
          ))}
        </div>
      )}
    </section>
  );
}
