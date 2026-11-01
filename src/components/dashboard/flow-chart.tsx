"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "motion/react";
import { CartesianGrid, Bar, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { CURRENCY_COLOR } from "@/components/dashboard/colors";
import { GhostChart } from "@/components/dashboard/ghost-chart";
import { EASE_OUT } from "@/components/dashboard/motion";
import { SegmentedControl } from "@/components/dashboard/segmented-control";
import { periodDelta } from "@/components/dashboard/calc";
import { GRAIN, granularityOptions, rangeName } from "@/components/dashboard/earnings-chart";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import type { FlowPoint, FlowSeries, RangeData } from "@/components/dashboard/range-calc";
import { rangeText, type Granularity } from "@/lib/date-range";
import { formatMargin, profitMargin } from "@/lib/available-money";
import { formatMoney, formatMoneyCompact, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

export const INCOME_COLOR = "var(--success)";
export const EXPENSE_COLOR = "var(--chart-4)";
const NET_COLOR = "var(--foreground)";

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const;
/** Pixels a label needs on the x axis before the next one would touch it. */
const LABEL_SLOT = 46;

function FlowTooltip({
  active,
  payload,
  format,
  lastKey,
  currentLabel,
}: {
  active?: boolean;
  payload?: { payload: FlowPoint }[];
  format: (n: number) => string;
  lastKey: string;
  currentLabel: string;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  const rows: { label: string; value: number; color: string }[] = [
    { label: "Received", value: point.income, color: INCOME_COLOR },
    { label: "Spent", value: point.expense, color: EXPENSE_COLOR },
    { label: "Net", value: point.net, color: NET_COLOR },
  ];
  return (
    <div className="min-w-44 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <div className="text-xs text-muted-foreground">
        {point.longLabel}
        {currentLabel && point.key === lastKey ? ` (${currentLabel})` : ""}
      </div>
      <dl className="mt-1.5 grid gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 text-sm">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
              {r.label}
            </dt>
            <dd className={cn("font-semibold tabular-nums", r.label === "Net" && r.value < 0 && "text-warning")}>{format(r.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Grouped bars (received, spent) with the net as a line. Draws in once when scrolled into view; text alternative sits beside it. */
function FlowBars({ points, format, formatAxis, currentLabel, fadeKey }: { points: FlowPoint[]; format: (n: number) => string; formatAxis: (n: number) => string; currentLabel: string; fadeKey: string }) {
  const reduce = useReducedMotion();
  const holder = useRef<HTMLDivElement>(null);
  const seen = useInView(holder, { once: true, margin: "0px 0px -10% 0px" });
  const [drawn, setDrawn] = useState(false);
  const [width, setWidth] = useState(0);
  const gid = useId().replace(/:/g, "");

  const show = reduce || seen;
  const animateDraw = !reduce && !drawn;
  const lastIndex = points.length - 1;
  const lastKey = points[lastIndex]?.key ?? "";
  const plotWidth = Math.max(0, width - 56);
  const step = Math.max(1, Math.ceil(LABEL_SLOT / Math.max(1, plotWidth / Math.max(1, points.length))));

  return (
    <div ref={holder} className="h-60 w-full sm:h-72" aria-hidden>
      {show ? (
        <motion.div key={fadeKey} className="size-full" initial={drawn ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
          <ResponsiveContainer width="100%" height="100%" onResize={(w) => setWidth(w)}>
            <ComposedChart data={points} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="22%" barGap={2} accessibilityLayer={false}>
              <defs>
                <linearGradient id={`${gid}-in`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id={`${gid}-out`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis
                dataKey="axisLabel"
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tickMargin={8}
                interval={0}
                tick={(props: { x?: number | string; y?: number | string; payload?: { value?: unknown }; index?: number }) => {
                  const { payload, index = 0 } = props;
                  if ((lastIndex - index) % step !== 0) return <g />;
                  const isLast = index === lastIndex;
                  return (
                    <text
                      x={Number(props.x ?? 0)}
                      y={Number(props.y ?? 0) + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={isLast ? 600 : 400}
                      fill={isLast ? "var(--foreground)" : "var(--muted-foreground)"}
                    >
                      {String(payload?.value ?? "")}
                    </text>
                  );
                }}
              />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tickCount={5}
                domain={[(dataMin: number) => Math.min(0, dataMin), "auto"]}
                tick={AXIS_TICK}
                tickFormatter={(v: number) => formatAxis(v)}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Tooltip
                content={<FlowTooltip format={format} lastKey={lastKey} currentLabel={currentLabel} />}
                cursor={{ fill: "var(--muted)", opacity: 0.55, radius: 6 }}
                animationDuration={150}
              />
              <Bar dataKey="income" name="Received" fill={`url(#${gid}-in)`} radius={[5, 5, 2, 2]} maxBarSize={26} isAnimationActive={animateDraw} animationDuration={700} animationEasing="ease-out" />
              <Bar
                dataKey="expense"
                name="Spent"
                fill={`url(#${gid}-out)`}
                radius={[5, 5, 2, 2]}
                maxBarSize={26}
                isAnimationActive={animateDraw}
                animationDuration={700}
                animationEasing="ease-out"
                onAnimationEnd={() => setDrawn(true)}
              />
              <Line
                type="linear"
                dataKey="net"
                name="Net"
                stroke={NET_COLOR}
                strokeWidth={2}
                strokeOpacity={0.75}
                dot={{ r: 2.5, fill: NET_COLOR, stroke: "var(--card)", strokeWidth: 1.5 }}
                activeDot={{ r: 4.5, fill: NET_COLOR, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={animateDraw}
                animationDuration={700}
                animationEasing="ease-out"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </motion.div>
      ) : null}
    </div>
  );
}

function Legend() {
  const items = [
    { label: "Received", color: INCOME_COLOR, shape: "rounded-sm" },
    { label: "Spent", color: EXPENSE_COLOR, shape: "rounded-sm" },
    { label: "Net", color: NET_COLOR, shape: "rounded-full" },
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Chart key">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={cn("inline-block", i.label === "Net" ? "h-0.5 w-3.5" : "size-2.5", i.shape)} style={{ backgroundColor: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, tone, testId, hint }: { label: string; value: string; tone?: "warning"; testId?: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd data-testid={testId} className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums", tone === "warning" && "text-warning")}>
        {value}
      </dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

function FlowCard({ series, grain, range, previousLabel }: { series: FlowSeries; grain: Granularity; range: RangeData["range"]; previousLabel: string }) {
  const { currency, points, totals, previous } = series;
  const copy = GRAIN[grain];
  const money = (n: number) => formatMoney(n, currency);
  // Whole units on the axis, so 824.69 reads as 825 rather than 824.7.
  const compact = (n: number) => formatMoneyCompact(Math.round(n / 100) * 100, currency);
  const margin = formatMargin(profitMargin(totals.income, totals.expense));
  const incomeTrend = periodDelta(totals.income, previous.income);

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: CURRENCY_COLOR[currency as Currency] }} aria-hidden />
              <span className="font-medium text-foreground">{currency}</span>
              <span aria-hidden>·</span>
              <span>{rangeName(range.preset)}</span>
            </div>
            <p className={cn("mt-1.5 text-3xl font-semibold tracking-tight tabular-nums", totals.net < 0 && "text-warning")} data-testid={`flow-net-${currency}`}>
              {money(totals.net)}
              <span className="ml-2 text-sm font-medium text-muted-foreground">net</span>
            </p>
          </div>
          <Legend />
        </div>

        <FlowBars points={points} format={money} formatAxis={compact} currentLabel="" fadeKey={`${grain}-${currency}`} />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
          <Stat label="Received in range" value={money(totals.income)} testId="flow-income" />
          <Stat label="Spent in range" value={money(totals.expense)} testId="flow-spent" />
          <Stat label="Net" value={money(totals.net)} tone={totals.net < 0 ? "warning" : undefined} />
          <Stat label="Profit margin" value={margin ?? "No income"} />
          <Stat label={`Average net per ${copy.noun}`} value={money(Math.round(series.average))} tone={series.average < 0 ? "warning" : undefined} />
          <Stat label={`Best ${copy.noun}, by net`} value={series.best ? money(series.best.amount) : "None in range"} hint={series.best?.label} />
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Received, {previousLabel}</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold tabular-nums">
              {money(previous.income)}
              <TrendBadge trend={incomeTrend.trend} pct={incomeTrend.pct} versus={previousLabel} />
            </dd>
          </div>
          <Stat label={`Spent, ${previousLabel}`} value={money(previous.expense)} />
        </dl>

        <div className="sr-only">
          <table>
            <caption>
              {currency} received, spent and net per {copy.noun}, {rangeText(range)}
            </caption>
            <thead>
              <tr>
                <th scope="col">{copy.noun === "day" ? "Day" : copy.noun === "week" ? "Week" : "Month"}</th>
                <th scope="col">Received</th>
                <th scope="col">Spent</th>
                <th scope="col">Net</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key}>
                  <th scope="row">{p.longLabel}</th>
                  <td>{money(p.income)}</td>
                  <td>{money(p.expense)}</td>
                  <td>{money(p.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Income against expenses for the date range chosen in the Earnings header (same range, same
 * URL), one card per currency (currencies never share an axis) or a single PHP card. Daily /
 * Weekly / Monthly drives every card; the range changing remounts this (key), so it starts at
 * the range default again.
 */
export function FlowSection({ data, converted = false }: { data: RangeData; converted?: boolean }) {
  const [grain, setGrain] = useState<Granularity>(data.defaultGranularity);
  const series = converted && data.converted ? data.converted.flow[grain] : data.flow[grain];
  const copy = GRAIN[grain];

  return (
    <section aria-labelledby="flow-heading" className="grid gap-4" data-testid="flow-section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="flow-heading" className="text-base font-semibold tracking-tight">
            Income vs expenses
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Money received against money spent per {copy.noun}, by Manila date, for the same range as Earnings ({rangeText(data.range)}). Net is received minus spent.
            {converted ? " Shown in PHP at today's exchange rates." : ""}
          </p>
        </div>
        <SegmentedControl label="Group income and expenses by" value={grain} onChange={setGrain} options={granularityOptions(data.choices)} />
      </div>
      <p className="sr-only" role="status">
        Showing {grain} income against expenses for {rangeText(data.range)}.
      </p>

      {series.length === 0 ? (
        <Card>
          <CardContent>
            <GhostChart
              title="No income or expenses in this range"
              description="Pick a longer range, or add an expense."
              action={
                <Link href="/admin/expenses" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  Go to expenses
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className={cn("grid gap-4", series.length > 1 && "xl:grid-cols-2", series.length % 2 === 1 && "xl:[&>*:last-child]:col-span-2")}>
          {series.map((s) => (
            <FlowCard key={s.currency} series={s} grain={grain} range={data.range} previousLabel={data.previousLabel} />
          ))}
        </div>
      )}
    </section>
  );
}
