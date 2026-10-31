import { CalendarCheck, FolderKanban, Hourglass, Target, TrendingUp, Trophy, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { AcceptedChart } from "@/components/dashboard/accepted-chart";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { WIN_RATE_DAYS } from "@/components/dashboard/calc";
import { EarningsSection } from "@/components/dashboard/earnings-chart";
import { KPI_NUMBER, KpiCard, KpiEmpty, KpiHint, MoneyKpi } from "@/components/dashboard/kpi-card";
import { MotionRoot, Reveal, Stagger } from "@/components/dashboard/motion";
import { NeedsAttention } from "@/components/dashboard/needs-attention";
import { ProgressRing } from "@/components/dashboard/progress-ring";
import { Sparkline } from "@/components/dashboard/sparkline";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import { CURRENCIES, type Currency } from "@/lib/money";
import { getDashboardData } from "@/server/data/dashboard";

export default async function DashboardPage() {
  const data = await getDashboardData();
  const { winRate, acceptedSummary } = data;
  const year = data.today.slice(0, 4);

  // Per currency trends and sparklines come straight from the monthly series.
  const monthTrends: Partial<Record<Currency, (typeof data.earningsSeries)[number]["summary"]>> = {};
  const monthSparks: Partial<Record<Currency, number[]>> = {};
  const yearSparks: Partial<Record<Currency, number[]>> = {};
  for (const currency of CURRENCIES) {
    const series = data.earningsSeries.find((s) => s.currency === currency);
    if (!series) continue;
    monthTrends[currency] = series.summary;
    monthSparks[currency] = series.points.map((p) => p.amount);
    let running = 0;
    yearSparks[currency] = series.points.filter((p) => p.month.startsWith(year)).map((p) => (running += p.amount));
  }

  return (
    <MotionRoot>
      <div className="min-w-0">
        <PageHeader title="Dashboard" description="Money received, projects accepted and what needs your attention." />

        <Stagger className="grid grid-cols-2 gap-3 xl:grid-cols-12 xl:gap-4">
          <KpiCard label="Earned this month" icon={Wallet} tone="primary" className="col-span-2 sm:col-span-1 xl:col-span-3">
            <MoneyKpi value={data.earnedThisMonth} empty="Nothing received yet this month" trends={monthTrends} sparklines={monthSparks} />
          </KpiCard>

          <KpiCard label="Earned this year" icon={TrendingUp} tone="success" className="col-span-2 sm:col-span-1 xl:col-span-3">
            <MoneyKpi
              value={data.earnedThisYear}
              empty="Nothing received yet this year"
              sparklines={yearSparks}
              hint={`Year to date, since 1 Jan ${year}`}
            />
          </KpiCard>

          <KpiCard label="Accepted this month" icon={CalendarCheck} tone="violet" className="col-span-1 xl:col-span-3">
            <div className="grid gap-2">
              <AnimatedNumber value={data.acceptedThisMonth} className={KPI_NUMBER} />
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <TrendBadge trend={acceptedSummary.trend} pct={acceptedSummary.pct} versus="last month" />
                <span className="text-xs text-muted-foreground">vs last month</span>
              </div>
              <Sparkline values={data.acceptedSeries.map((p) => p.count)} color="var(--chart-4)" />
            </div>
            <KpiHint>{data.acceptedAllTime} accepted all time</KpiHint>
          </KpiCard>

          <KpiCard label="Active projects" icon={FolderKanban} tone="info" className="col-span-1 xl:col-span-3">
            <AnimatedNumber value={data.activeProjects} className={KPI_NUMBER} />
            <KpiHint>Projects in progress right now</KpiHint>
          </KpiCard>

          <KpiCard label="Pending balance" icon={Hourglass} tone="warning" className="col-span-2 sm:col-span-1 xl:col-span-4">
            <MoneyKpi value={data.pendingBalance} empty="Nothing pending" hint="Still to collect on active and on hold projects" />
          </KpiCard>

          <KpiCard label="Pipeline value" icon={Target} tone="info" className="col-span-2 sm:col-span-1 xl:col-span-4">
            <MoneyKpi value={data.pipelineValue} empty="Your pipeline is empty" hint="Open prospects, unweighted" />
          </KpiCard>

          <KpiCard label={`Win rate, last ${WIN_RATE_DAYS} days`} icon={Trophy} tone="success" className="col-span-2 xl:col-span-4">
            {winRate.rate === null ? (
              <>
                <KpiEmpty>No prospects closed in this period yet</KpiEmpty>
                <KpiHint>Won and lost prospects will show up here</KpiHint>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4">
                  <AnimatedNumber kind="percent" value={Math.round(winRate.rate * 100)} className={KPI_NUMBER} />
                  <ProgressRing fraction={winRate.rate} color="var(--success)" />
                </div>
                <KpiHint>
                  {winRate.won} won, {winRate.lost} lost
                </KpiHint>
              </>
            )}
          </KpiCard>
        </Stagger>

        <div className="mt-8">
          <EarningsSection monthly={data.earningsSeries} weekly={data.weeklyEarningsSeries} />
        </div>

        <div className="mt-8 grid items-start gap-4 xl:grid-cols-5">
          <Reveal className="min-w-0 xl:col-span-3">
            <AcceptedChart points={data.acceptedSeries} summary={acceptedSummary} />
          </Reveal>
          <div className="min-w-0 xl:col-span-2">
            <NeedsAttention attention={data.attention} today={data.today} />
          </div>
        </div>
      </div>
    </MotionRoot>
  );
}
