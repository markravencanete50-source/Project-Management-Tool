import Link from "next/link";
import { PiggyBank, TriangleAlert } from "lucide-react";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { StaggerItem } from "@/components/dashboard/motion";
import { FlowMiniBars } from "@/components/dashboard/flow-mini-bars";
import { KPI_FRACTION } from "@/components/dashboard/kpi-card";
import type { MoneyFlow } from "@/components/dashboard/flow-calc";
import { Card, CardContent } from "@/components/ui/card";
import { AddExpenseButton } from "@/components/expenses/expense-dialog";
import { formatMargin, profitMargin } from "@/lib/available-money";
import { formatIsoDate } from "@/lib/dates";
import type { DashView } from "@/lib/dash-view";
import { formatMoney, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Everything one block (a currency, or the PHP total) shows. All amounts are minor units of `currency`. */
type Block = {
  currency: Currency;
  opening: number;
  received: number;
  spent: number;
  available: number;
  month: { received: number; spent: number; net: number; margin: number | null };
  year: { received: number; spent: number; net: number };
  /** For the PHP block: the original currencies the available figure was converted from. */
  from?: string;
};

function blocksOf(money: MoneyFlow, view: DashView): Block[] {
  const { converted } = money;
  if (view === "php" && converted) {
    const original = money.currencies
      .filter((c) => c !== "PHP" && money.available.available[c] !== undefined)
      .map((c) => formatMoney(money.available.available[c] ?? 0, c));
    return [
      {
        currency: "PHP",
        opening: converted.available.opening,
        received: converted.available.received,
        spent: converted.available.spent,
        available: converted.available.available,
        month: converted.month,
        year: converted.year,
        from: original.length > 0 ? `From ${original.join(" + ")}` : undefined,
      },
    ];
  }
  const currencies: Currency[] = money.currencies.length > 0 ? money.currencies : ["PHP"];
  return currencies.map((c) => ({
    currency: c,
    opening: money.available.opening[c] ?? 0,
    received: money.available.received[c] ?? 0,
    spent: money.available.spent[c] ?? 0,
    available: money.available.available[c] ?? 0,
    month: {
      received: money.month.received[c] ?? 0,
      spent: money.month.spent[c] ?? 0,
      net: money.month.net[c] ?? 0,
      margin: profitMargin(money.month.received[c] ?? 0, money.month.spent[c] ?? 0),
    },
    year: { received: money.year.received[c] ?? 0, spent: money.year.spent[c] ?? 0, net: money.year.net[c] ?? 0 },
  }));
}

function Figure({ label, value, currency, big = false, testId }: { label: string; value: number; currency: Currency; big?: boolean; testId?: string }) {
  const negative = value < 0;
  return (
    <div className="grid min-w-0 gap-1.5" data-testid={testId}>
      <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <AnimatedNumber
          kind="money"
          currency={currency}
          value={value}
          className={cn(big ? "text-3xl leading-none font-semibold tracking-tight break-all sm:text-4xl" : "text-xl leading-none font-semibold tracking-tight", negative && "text-warning")}
          fractionClassName={cn(big ? "text-lg font-medium" : KPI_FRACTION, negative ? "text-warning/80" : "text-muted-foreground")}
        />
        <span className="text-xs font-medium text-muted-foreground">{currency}</span>
      </div>
    </div>
  );
}

function BlockView({ block, openingDate }: { block: Block; openingDate: string | null }) {
  const { currency } = block;
  const negative = block.available < 0;
  const margin = formatMargin(block.month.margin);
  const hasOpening = block.opening !== 0;
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-12 lg:gap-8" data-testid={`available-${currency}`}>
      <div className="grid min-w-0 content-start gap-2 lg:col-span-5">
        <Figure label="Available now" value={block.available} currency={currency} big testId="available-now" />
        {negative ? (
          <p className="flex items-start gap-1.5 text-sm text-warning" role="status">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            More has gone out than come in.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {hasOpening ? `Opening ${formatMoney(block.opening, currency)} + ` : ""}Received {formatMoney(block.received, currency)} - Spent {formatMoney(block.spent, currency)}
          {openingDate ? `. Counted from ${formatIsoDate(openingDate)}.` : "."}
        </p>
        {block.from ? <p className="text-xs text-muted-foreground">{block.from}</p> : null}
      </div>

      <div className="grid min-w-0 content-start gap-3 lg:col-span-4">
        <Figure label="Net this month" value={block.month.net} currency={currency} testId="net-month" />
        <FlowMiniBars income={block.month.received} expense={block.month.spent} currency={currency} />
        <p className="text-xs text-muted-foreground">
          Profit margin this month{" "}
          <span className={cn("font-semibold tabular-nums", block.month.margin !== null && block.month.margin < 0 ? "text-warning" : "text-foreground")} data-testid="profit-margin">
            {margin ?? "n/a, no income yet"}
          </span>
        </p>
      </div>

      <div className="grid min-w-0 content-start gap-3 lg:col-span-3">
        <Figure label="Net this year" value={block.year.net} currency={currency} testId="net-year" />
        <p className="text-xs text-muted-foreground">
          Received {formatMoney(block.year.received, currency)}, spent {formatMoney(block.year.spent, currency)} since 1 Jan.
        </p>
      </div>
    </div>
  );
}

/**
 * The Available money hero: net figures, never a bank balance. Available now is opening
 * balance + received - spent (counted from the opening date when one is set); this month and
 * this year are received minus spent in that period. Negative amounts show a minus sign and
 * the warning colour.
 */
export function AvailableMoneyCard({ money, view, className }: { money: MoneyFlow; view: DashView; className?: string }) {
  const blocks = blocksOf(money, view);
  return (
    <StaggerItem className={cn("min-w-0", className)}>
      <Card className="h-full">
        <CardContent className="flex h-full flex-col gap-5" data-testid="available-money-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success/12 text-success dark:bg-success/16">
                <PiggyBank className="size-4" aria-hidden />
              </span>
              <h3 className="text-[0.8125rem] font-medium text-muted-foreground">Available money</h3>
            </div>
            <AddExpenseButton variant="outline" size="sm" />
          </div>

          <div className="grid min-w-0 gap-6">
            {blocks.map((block, i) => (
              <div key={block.currency} className={cn("min-w-0", i > 0 && "border-t border-border pt-6")}>
                <BlockView block={block} openingDate={money.opening.date} />
              </div>
            ))}
          </div>

          <p className="border-t pt-4 text-xs text-muted-foreground">
            A net figure worked out from what you record here (opening balance + money received - money spent), not a bank balance.{" "}
            {!money.hasExpenses && money.currencies.length === 0 ? "Add an expense or an opening balance to get started. " : ""}
            <Link href="/admin/settings" className="font-medium text-primary underline-offset-4 hover:underline">
              Opening balance
            </Link>
            {" "}
            <span aria-hidden>·</span>{" "}
            <Link href="/admin/expenses" className="font-medium text-primary underline-offset-4 hover:underline">
              All expenses
            </Link>
          </p>
        </CardContent>
      </Card>
    </StaggerItem>
  );
}
