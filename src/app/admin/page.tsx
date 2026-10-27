import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { MoneyByCurrencyView } from "@/components/common/money-by-currency";
import { PageHeader } from "@/components/common/page-header";
import { AcceptedChart } from "@/components/dashboard/accepted-chart";
import { EarningsChart } from "@/components/dashboard/earnings-chart";
import { NeedsAttention } from "@/components/dashboard/needs-attention";
import { StatCard } from "@/components/dashboard/stat-card";
import { WIN_RATE_DAYS } from "@/components/dashboard/calc";
import { getDashboardData } from "@/server/data/dashboard";

export default async function DashboardPage() {
  const data = await getDashboardData();
  const { winRate } = data;

  return (
    <div className="min-w-0">
      <PageHeader title="Dashboard" description="Money received, projects accepted and what needs your attention." />

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Earned this month">
          <MoneyByCurrencyView value={data.earnedThisMonth} empty="Nothing yet" />
        </StatCard>
        <StatCard label="Earned this year">
          <MoneyByCurrencyView value={data.earnedThisYear} empty="Nothing yet" />
        </StatCard>
        <StatCard label="Accepted this month" hint={`${data.acceptedAllTime} accepted all time`}>
          {data.acceptedThisMonth}
        </StatCard>
        <StatCard label="Active projects">{data.activeProjects}</StatCard>
        <StatCard label="Pending balance" hint="Active and on hold projects">
          <MoneyByCurrencyView value={data.pendingBalance} empty="Nothing pending" />
        </StatCard>
        <StatCard label="Pipeline value" hint="Open prospects, unweighted">
          <MoneyByCurrencyView value={data.pipelineValue} empty="Empty pipeline" />
        </StatCard>
        <StatCard
          label={`Win rate, last ${WIN_RATE_DAYS} days`}
          hint={winRate.rate === null ? undefined : `${winRate.won} won, ${winRate.lost} lost`}
        >
          {winRate.rate === null ? <span className="text-base font-medium">No closed prospects</span> : `${Math.round(winRate.rate * 100)}%`}
        </StatCard>
      </div>

      <section className="mt-8 grid gap-4" aria-labelledby="charts-heading">
        <h2 id="charts-heading" className="text-base font-semibold">
          Last 12 months
        </h2>
        {data.earningsSeries.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BarChart3 />
              </EmptyMedia>
              <EmptyTitle>No earnings in the last 12 months</EmptyTitle>
              <EmptyDescription>Record a payment on a project and it will show up here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.earningsSeries.map((series) => (
              <Card key={series.currency} size="sm">
                <CardHeader>
                  <CardTitle>Earnings in {series.currency}</CardTitle>
                  <CardDescription>Money received per month</CardDescription>
                </CardHeader>
                <CardContent>
                  <EarningsChart currency={series.currency} points={series.points} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Card size="sm">
          <CardHeader>
            <CardTitle>Projects accepted</CardTitle>
            <CardDescription>Number of projects accepted per month</CardDescription>
          </CardHeader>
          <CardContent>
            {data.acceptedSeries.every((p) => p.count === 0) ? (
              <p className="text-sm text-muted-foreground">No projects accepted in the last 12 months.</p>
            ) : (
              <AcceptedChart points={data.acceptedSeries} />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-8 grid gap-4" aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="text-base font-semibold">
          Needs attention
        </h2>
        <NeedsAttention attention={data.attention} today={data.today} />
      </section>
    </div>
  );
}
