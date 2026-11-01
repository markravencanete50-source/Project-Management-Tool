import Link from "next/link";
import { Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { KPI_FRACTION, KPI_NUMBER } from "@/components/dashboard/kpi-card";
import { ShareBar } from "@/components/dashboard/share-bar";
import { StaggerItem } from "@/components/dashboard/motion";
import type { PipelineBreakdown, TopProspect } from "@/components/dashboard/calc";
import { KindBadge } from "@/components/common/kind-badge";
import { STAGE_LABELS, STAGE_VARIANT } from "@/components/prospects/labels";
import { currenciesIn, formatMoney, type MoneyByCurrency } from "@/lib/money";
import { cn } from "cn";

type Php = { oneOff: number; monthly: number; firstYear: number };

/** One figure: PHP when the view is converted, otherwise one line per currency. */
function Piece({
  label,
  hint,
  php,
  money,
  suffix,
  testId,
}: {
  label: string;
  hint: string;
  php: number | null;
  money: MoneyByCurrency;
  suffix?: string;
  testId: string;
}) {
  const currencies = currenciesIn(money);
  return (
    <div className="grid min-w-0 content-start gap-1.5" data-testid={testId}>
      <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
      {php !== null ? (
        <div className="flex items-baseline gap-1.5">
          <AnimatedNumber kind="money" currency="PHP" value={php} className={KPI_NUMBER} fractionClassName={KPI_FRACTION} />
          {suffix ? <span className="text-sm font-medium text-muted-foreground">{suffix}</span> : null}
        </div>
      ) : currencies.length === 0 ? (
        <p className={cn(KPI_NUMBER, "text-muted-foreground")}>
          {formatMoney(0, "PHP")}
          {suffix ? <span className="ml-1.5 text-sm font-medium">{suffix}</span> : null}
        </p>
      ) : (
        currencies.map((c) => (
          <div key={c} className="flex items-baseline gap-1.5">
            <AnimatedNumber kind="money" currency={c} value={money[c] ?? 0} className={KPI_NUMBER} fractionClassName={KPI_FRACTION} />
            {suffix ? <span className="text-sm font-medium text-muted-foreground">{suffix}</span> : null}
            <span className="text-xs font-medium text-muted-foreground">{c}</span>
          </div>
        ))
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Open prospects only (not won or lost), never weighted by win chance:
 * one-off potential, monthly recurring potential (/mo), and the first year as a
 * projection (one-off + monthly x 12), with counts by kind, a share bar and the
 * five biggest open prospects.
 */
export function PipelineCard({
  pipeline,
  php,
  top,
  className,
}: {
  pipeline: PipelineBreakdown;
  /** PHP pieces in the converted view, null in the original currencies view. */
  php: Php | null;
  top: TopProspect[];
  className?: string;
}) {
  const { counts } = pipeline;
  const share = php
    ? { oneOff: php.oneOff, recurring: php.monthly * 12 }
    : (() => {
        // Currencies cannot be added, so the share bar only appears when one currency is in play.
        const cs = currenciesIn(pipeline.firstYear);
        if (cs.length !== 1) return null;
        const c = cs[0];
        return { oneOff: pipeline.oneOff[c] ?? 0, recurring: (pipeline.monthly[c] ?? 0) * 12 };
      })();
  const kinds = [
    counts.fixed ? `${counts.fixed} fixed` : null,
    counts.retainer ? plural(counts.retainer, "retainer", "retainers") : null,
    counts.tasks ? `${counts.tasks} tasks` : null,
  ].filter(Boolean);

  return (
    <StaggerItem className={cn("min-w-0", className)}>
      <Card className="h-full">
        <CardContent className="flex h-full flex-col gap-5" data-testid="pipeline-card">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[0.8125rem] font-medium text-muted-foreground">Pipeline potential</h3>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-info/12 text-info dark:bg-info/16">
              <Target className="size-4" aria-hidden />
            </span>
          </div>

          {counts.total === 0 ? (
            <p className="text-sm text-muted-foreground">Your pipeline is empty. Open prospects will show here.</p>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-3 sm:gap-6">
                <Piece label="One-off potential" hint="Fixed and task prospects" php={php?.oneOff ?? null} money={pipeline.oneOff} testId="pipeline-oneoff" />
                <Piece
                  label="Monthly recurring potential"
                  hint="Retainer prospects, per month"
                  php={php?.monthly ?? null}
                  money={pipeline.monthly}
                  suffix="/mo"
                  testId="pipeline-monthly"
                />
                <Piece
                  label="First year potential"
                  hint="Projection: one-off + monthly x 12"
                  php={php?.firstYear ?? null}
                  money={pipeline.firstYear}
                  testId="pipeline-firstyear"
                />
              </div>
              {share ? <ShareBar oneOff={share.oneOff} recurring={share.recurring} /> : null}
              <p className="text-xs text-muted-foreground">
                {plural(counts.total, "open prospect", "open prospects")}
                {kinds.length > 0 ? `: ${kinds.join(", ")}` : ""}. Not weighted by win chance.
              </p>
            </>
          )}

          <div className="border-t pt-4">
            <h4 className="pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Top open prospects</h4>
            {top.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No open prospects with a value yet.</p>
            ) : (
              <ul className="-mx-2 grid" data-testid="top-prospects">
                {top.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/prospects/${p.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 transition-colors duration-150 outline-none hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      <span className="flex items-center gap-1.5">
                        <KindBadge kind={p.kind} />
                        <Badge variant={STAGE_VARIANT[p.stage]} dot>
                          {STAGE_LABELS[p.stage]}
                        </Badge>
                      </span>
                      <span className="w-full text-sm font-semibold tabular-nums sm:w-auto sm:min-w-28 sm:text-right">
                        {formatMoney(p.amount, p.currency)}
                        {p.monthly ? "/mo" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </StaggerItem>
  );
}
