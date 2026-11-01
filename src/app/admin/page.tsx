import { cookies } from "next/headers";
import { CalendarCheck, FolderKanban, Hourglass, Repeat, TrendingUp, Trophy, Wallet } from "lucide-react";
import { RecordPaymentButton } from "@/components/payments/record-payment";
import { AddExpenseButton } from "@/components/expenses/expense-dialog";
import { AvailableMoneyCard } from "@/components/dashboard/available-money-card";
import { FlowSection } from "@/components/dashboard/flow-chart";
import { SpendingByCategory } from "@/components/dashboard/spending-by-category";
import { formatMonthKey } from "@/lib/dates";
import { PageHeader } from "@/components/common/page-header";
import { AcceptedChart } from "@/components/dashboard/accepted-chart";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { WIN_RATE_DAYS } from "@/components/dashboard/calc";
import { CurrencyViewToggle, FxInfo, FxUnavailableNotice } from "@/components/dashboard/currency-view";
import { EarningsSection } from "@/components/dashboard/earnings-chart";
import { KPI_NUMBER, KpiCard, KpiEmpty, KpiHint, MoneyKpi, PhpKpi } from "@/components/dashboard/kpi-card";
import { MotionRoot, Reveal, Stagger } from "@/components/dashboard/motion";
import { NeedsAttention } from "@/components/dashboard/needs-attention";
import { PipelineCard } from "@/components/dashboard/pipeline-card";
import { ProgressRing } from "@/components/dashboard/progress-ring";
import { Sparkline } from "@/components/dashboard/sparkline";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import { DASH_VIEW_COOKIE, type DashView } from "@/lib/dash-view";
import { rateOf, sourceLabel, timeAgo } from "@/lib/fx/convert";
import { sourceMix } from "@/lib/fx/overrides";
import { CURRENCIES, currenciesIn, formatMoney, type Currency } from "@/lib/money";
import { parseRangeSpec } from "@/lib/date-range";
import { getDashboardData } from "@/server/data/dashboard";

function chosenView(param: string | string[] | undefined, cookie: string | undefined): DashView {
  const value = Array.isArray(param) ? param[0] : param;
  const pick = value ?? cookie;
  return pick === "original" ? "original" : "php";
}

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const [sp, jar] = await Promise.all([searchParams, cookies()]);
  const wanted = chosenView(sp.view, jar.get(DASH_VIEW_COOKIE)?.value);
  const data = await getDashboardData({ convert: wanted === "php", range: parseRangeSpec(sp) });
  const { winRate, acceptedSummary, converted } = data;
  const year = data.today.slice(0, 4);
  // The PHP view needs rates; without them the page shows original currencies and says so.
  const view: DashView = wanted === "php" && converted ? "php" : "original";

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

  const phpSeries = converted?.earningsSeries[0];
  const phpMonthSpark = phpSeries?.points.map((p) => p.amount);
  let phpRunning = 0;
  const phpYearSpark = phpSeries?.points.filter((p) => p.month.startsWith(year)).map((p) => (phpRunning += p.amount));

  const retainerHint =
    data.activeRetainers > 0
      ? `${data.activeRetainers} active ${data.activeRetainers === 1 ? "retainer" : "retainers"}. Includes months still in progress.`
      : "Retainer months with logged time, in progress included";

  const rateRows = converted
    ? converted.rates.quotes.map((q) => ({
        currency: q.currency,
        rate: (rateOf(converted.rates, q.currency) ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
        source: q.source,
        sourceLabel: sourceLabel(q.source),
        updated: q.source === "manual" ? "" : timeAgo(q.updatedAt),
      }))
    : [];

  return (
    <MotionRoot>
      <div className="min-w-0">
        <PageHeader
          title="Dashboard"
          description="Money received and spent, projects accepted and what needs your attention."
          actions={
            <>
              <RecordPaymentButton variant="outline" />
              <AddExpenseButton variant="outline" />
              <CurrencyViewToggle value={wanted} />
            </>
          }
        />

        {wanted === "php" && !converted ? <FxUnavailableNotice /> : null}
        {view === "php" && converted ? (
          <FxInfo
            provider={converted.rates.provider}
            mix={sourceMix(converted.rates)}
            updatedAgo={converted.rates.quotes.some((q) => q.source !== "manual") ? timeAgo(converted.rates.updatedAt) : null}
            stale={converted.rates.stale}
            rows={rateRows}
          />
        ) : null}

        <Stagger className="grid grid-cols-2 gap-3 xl:grid-cols-12 xl:gap-4">
          <AvailableMoneyCard money={data.money} view={view} className="col-span-2 xl:col-span-12" />

          <KpiCard label="Earned this month" icon={Wallet} tone="primary" className="col-span-2 sm:col-span-1 xl:col-span-3">
            {view === "php" && converted ? (
              <PhpKpi
                value={converted.earnedThisMonth}
                original={data.earnedThisMonth}
                empty="Nothing received yet this month"
                trend={phpSeries?.summary}
                sparkline={phpMonthSpark}
              />
            ) : (
              <MoneyKpi value={data.earnedThisMonth} empty="Nothing received yet this month" trends={monthTrends} sparklines={monthSparks} />
            )}
          </KpiCard>

          <KpiCard label="Earned this year" icon={TrendingUp} tone="success" className="col-span-2 sm:col-span-1 xl:col-span-3">
            {view === "php" && converted ? (
              <PhpKpi
                value={converted.earnedThisYear}
                original={data.earnedThisYear}
                empty="Nothing received yet this year"
                sparkline={phpYearSpark}
                hint={`Year to date, since 1 Jan ${year}`}
              />
            ) : (
              <MoneyKpi
                value={data.earnedThisYear}
                empty="Nothing received yet this year"
                sparklines={yearSparks}
                hint={`Year to date, since 1 Jan ${year}`}
              />
            )}
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
            {view === "php" && converted ? (
              <PhpKpi
                value={converted.pendingBalance}
                original={data.pendingBalance}
                empty="Nothing pending"
                hint="Still to collect on active and on hold projects"
              />
            ) : (
              <MoneyKpi value={data.pendingBalance} empty="Nothing pending" hint="Still to collect on active and on hold projects" />
            )}
          </KpiCard>

          <KpiCard label="Recurring billed this month" icon={Repeat} tone="violet" className="col-span-2 sm:col-span-1 xl:col-span-4">
            <p className="-mb-2 text-xs font-medium text-muted-foreground">Billed so far</p>
            {view === "php" && converted ? (
              <PhpKpi value={converted.recurringBilledThisMonth} original={data.recurringBilledThisMonth} empty="No retainer time logged this month" />
            ) : (
              <MoneyKpi value={data.recurringBilledThisMonth} empty="No retainer time logged this month" />
            )}
            <div className="grid gap-1 border-t pt-3" data-testid="expected-this-month">
              <p className="text-xs font-medium text-muted-foreground">Expected this month</p>
              {view === "php" && converted ? (
                <p className="text-base font-semibold tabular-nums">{formatMoney(converted.expectedThisMonth, "PHP")}</p>
              ) : currenciesIn(data.expectedThisMonth).length === 0 ? (
                <p className="text-sm text-muted-foreground">No active retainers</p>
              ) : (
                currenciesIn(data.expectedThisMonth).map((c) => (
                  <p key={c} className="text-base font-semibold tabular-nums">
                    {formatMoney(data.expectedThisMonth[c] ?? 0, c)}
                  </p>
                ))
              )}
            </div>
            <KpiHint>{retainerHint.replace(/[.]$/, "")}. Expected counts active retainers at their rate and working schedule.</KpiHint>
          </KpiCard>

          <KpiCard label={`Win rate, last ${WIN_RATE_DAYS} days`} icon={Trophy} tone="success" className="col-span-2 sm:col-span-1 xl:col-span-4">
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
          <PipelineCard
            className="col-span-2 xl:col-span-12"
            pipeline={data.pipeline}
            php={view === "php" && converted ? converted.pipeline : null}
            top={data.topProspects}
          />
        </Stagger>

        <div className="mt-8">
          <EarningsSection
            key={`earn-${data.range.range.from}-${data.range.range.to}`}
            data={data.range}
            converted={view === "php" && Boolean(data.range.converted)}
            today={data.today}
          />
        </div>

        <div className="mt-8">
          <FlowSection key={`flow-${data.range.range.from}-${data.range.range.to}`} data={data.range} converted={view === "php" && Boolean(data.range.converted)} />
        </div>

        <div className="mt-8">
          <SpendingByCategory
            month={view === "php" && data.money.converted ? data.money.converted.categoriesMonth : data.money.categoriesMonth}
            year={view === "php" && data.money.converted ? data.money.converted.categoriesYear : data.money.categoriesYear}
            monthLabel={formatMonthKey(data.today.slice(0, 7), "MMMM yyyy")}
            yearLabel={year}
            converted={view === "php" && Boolean(data.money.converted)}
          />
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
