import type { ComponentType, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { CURRENCY_COLOR } from "@/components/dashboard/colors";
import { StaggerItem } from "@/components/dashboard/motion";
import { Sparkline } from "@/components/dashboard/sparkline";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import type { PeriodSummary } from "@/components/dashboard/calc";
import { currenciesIn, formatMoney, type Currency, type MoneyByCurrency } from "@/lib/money";
import { cn } from "cn";

export type KpiTone = "primary" | "success" | "info" | "warning" | "violet";

const TONE: Record<KpiTone, string> = {
  primary: "bg-primary/10 text-primary dark:bg-primary/16",
  success: "bg-success/12 text-success dark:bg-success/16",
  info: "bg-info/12 text-info dark:bg-info/16",
  warning: "bg-warning/14 text-warning dark:bg-warning/16",
  violet: "bg-violet/12 text-violet dark:bg-violet/16",
};

/** Number styling shared by every KPI figure. */
export const KPI_NUMBER = "text-2xl leading-none font-semibold tracking-tight";
export const KPI_FRACTION = "text-sm font-medium text-muted-foreground";

/**
 * One headline metric: a label with an icon tile, then whatever figures you pass.
 * Enters with the parent Stagger and lifts a couple of pixels on hover (a CSS
 * transform, switched off for reduced motion).
 */
export function KpiCard({
  label,
  icon: Icon,
  tone = "primary",
  className,
  children,
}: {
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone?: KpiTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <StaggerItem className={cn("min-w-0", className)}>
      <Card className="h-full transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
        <CardContent className="flex h-full flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[0.8125rem] font-medium text-muted-foreground">{label}</h3>
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONE[tone])}>
              <Icon className="size-4" aria-hidden />
            </span>
          </div>
          {children}
        </CardContent>
      </Card>
    </StaggerItem>
  );
}

export function KpiHint({ children }: { children: ReactNode }) {
  return <p className="mt-auto text-xs text-muted-foreground">{children}</p>;
}

export function KpiEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/**
 * Money per currency, one block each (currencies are never added together):
 * the amount with quiet cents, optionally a change badge and a sparkline.
 */
export function MoneyKpi({
  value,
  empty,
  trends,
  versus = "last month",
  sparklines,
  hint,
}: {
  value: MoneyByCurrency;
  empty: string;
  trends?: Partial<Record<Currency, PeriodSummary>>;
  versus?: string;
  sparklines?: Partial<Record<Currency, number[]>>;
  hint?: string;
}) {
  const currencies = currenciesIn(value);
  if (currencies.length === 0) {
    return (
      <>
        <KpiEmpty>{empty}</KpiEmpty>
        {hint ? <KpiHint>{hint}</KpiHint> : null}
      </>
    );
  }
  return (
    <>
      <div className="grid gap-4">
        {currencies.map((currency, i) => {
          const trend = trends?.[currency];
          const spark = sparklines?.[currency];
          return (
            <div key={currency} className={cn("grid gap-2", i > 0 && "border-t border-border pt-4")}>
              <div className="flex items-baseline justify-between gap-2">
                <AnimatedNumber
                  kind="money"
                  currency={currency}
                  value={value[currency] ?? 0}
                  className={KPI_NUMBER}
                  fractionClassName={KPI_FRACTION}
                />
                <span className="text-xs font-medium text-muted-foreground">{currency}</span>
              </div>
              {trend ? (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <TrendBadge trend={trend.trend} pct={trend.pct} versus={versus} />
                  <span className="text-xs text-muted-foreground">vs {versus}</span>
                </div>
              ) : null}
              {spark ? <Sparkline values={spark} color={CURRENCY_COLOR[currency]} /> : null}
            </div>
          );
        })}
      </div>
      {hint ? <KpiHint>{hint}</KpiHint> : null}
    </>
  );
}

/** "From £120.00 + $1,250.00": what a converted figure is made of, in the original currencies. */
function BreakdownHint({ original, extra }: { original: MoneyByCurrency; extra?: string }) {
  const parts = currenciesIn(original)
    .filter((c) => c !== "PHP")
    .map((c) => formatMoney(original[c] ?? 0, c));
  if (parts.length === 0 && !extra) return null;
  return (
    <KpiHint>
      {parts.length > 0 ? `From ${parts.join(" + ")}` : null}
      {parts.length > 0 && extra ? ". " : null}
      {extra}
    </KpiHint>
  );
}

/**
 * The PHP view of a money figure: one number, optionally a change badge and a
 * sparkline, and a line naming the original amounts it was converted from.
 */
export function PhpKpi({
  value,
  original,
  empty,
  trend,
  versus = "last month",
  sparkline,
  hint,
}: {
  /** PHP centavos. */
  value: number;
  /** The same figure in its original currencies, for the breakdown line. */
  original: MoneyByCurrency;
  empty: string;
  trend?: PeriodSummary;
  versus?: string;
  sparkline?: number[];
  hint?: string;
}) {
  if (value === 0) {
    return (
      <>
        <KpiEmpty>{empty}</KpiEmpty>
        {hint ? <KpiHint>{hint}</KpiHint> : null}
      </>
    );
  }
  return (
    <>
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <AnimatedNumber kind="money" currency="PHP" value={value} className={KPI_NUMBER} fractionClassName={KPI_FRACTION} />
          <span className="text-xs font-medium text-muted-foreground">PHP</span>
        </div>
        {trend ? (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <TrendBadge trend={trend.trend} pct={trend.pct} versus={versus} />
            <span className="text-xs text-muted-foreground">vs {versus}</span>
          </div>
        ) : null}
        {sparkline ? <Sparkline values={sparkline} color={CURRENCY_COLOR.PHP} /> : null}
      </div>
      <BreakdownHint original={original} extra={hint} />
    </>
  );
}
