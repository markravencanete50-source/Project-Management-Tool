"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { GhostChart } from "@/components/dashboard/ghost-chart";
import { PeriodChart } from "@/components/dashboard/period-chart";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import type { AcceptedPoint, PeriodSummary } from "@/components/dashboard/calc";

const plural = (n: number) => `${n} ${n === 1 ? "project" : "projects"}`;

/** Projects accepted per month: the current month in full colour, counts on the bars, a text table for screen readers. */
export function AcceptedChart({ points, summary }: { points: AcceptedPoint[]; summary: PeriodSummary }) {
  const empty = summary.total === 0;
  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">Projects accepted</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Per month, counted from the day each project was accepted.</p>
          </div>
          {empty ? null : (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <TrendBadge trend={summary.trend} pct={summary.pct} versus="last month" />
              <span className="text-xs text-muted-foreground">vs last month</span>
            </div>
          )}
        </div>

        {empty ? (
          <GhostChart
            title="No projects accepted in the last 12 months"
            description="Accepted projects are counted when an agreement is signed or a deposit lands, depending on your setting."
          />
        ) : (
          <>
            <PeriodChart
              points={points.map((p) => ({
                key: p.month,
                axisLabel: p.axisLabel,
                longLabel: p.longLabel,
                value: p.count,
                cumulative: p.count,
              }))}
              mode="period"
              color="var(--chart-4)"
              format={plural}
              formatAxis={String}
              unit="accepted"
              currentLabel="so far"
              fadeKey="accepted"
              integerAxis
            />
            <dl className="grid grid-cols-3 gap-x-4 border-t border-border pt-4">
              <div>
                <dt className="text-xs text-muted-foreground">Last 12 months</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                  <AnimatedNumber value={summary.total} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">This month</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{summary.current}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Best month</dt>
                <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">{summary.best ? summary.best.amount : "None yet"}</dd>
                {summary.best ? <dd className="truncate text-xs text-muted-foreground">{summary.best.label}</dd> : null}
              </div>
            </dl>
            <table className="sr-only">
              <caption>Projects accepted per month, last 12 months</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Accepted</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.month}>
                    <th scope="row">{p.longLabel}</th>
                    <td>{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
