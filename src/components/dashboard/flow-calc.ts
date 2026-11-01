// Pure money-flow aggregation for the dashboard: available money, this month and this year net,
// and spending by category. The income-vs-expenses and earnings series over a chosen date range
// live in range-calc.ts. No server imports, so it can be unit tested.
//
// Expenses live only here. buildDashboardWithMoney() runs the existing buildDashboard()
// untouched and ADDS a `money` block, so earnings, pending balance, overdue, accepted,
// recurring-billed and pipeline figures can never be changed by an expense.
import { monthKeyOf, monthKeyOfInstant, todayIso, type IsoDate, type MonthKey } from "@/lib/dates";
import { buildDashboard, mergeEarnings, type DashboardData, type DashboardInput } from "@/components/dashboard/calc";
import { buildRangeData, type RangeData } from "@/components/dashboard/range-calc";
import { availableMoney, netOf, sumEvents, type AvailableMoney, type MoneyEvent, type OpeningBalance } from "@/lib/available-money";
import { resolveRange, type RangeSpec } from "@/lib/date-range";
import { categoryBreakdowns, expenseLines, type CategoryBreakdown } from "@/lib/expenses";
import { convertMoney, type RateTable } from "@/lib/fx/convert";
import { CURRENCIES, type Currency, type MoneyByCurrency } from "@/lib/money";
import type { Expense } from "@/lib/types";

export type { FlowPoint, FlowSeries } from "@/components/dashboard/range-calc";

export type PeriodFlow = { received: MoneyByCurrency; spent: MoneyByCurrency; net: MoneyByCurrency };

/** The same figures as one PHP number each. Parts are converted on their own and net is built from them, so they add up. */
export type ConvertedPeriod = { received: number; spent: number; net: number; margin: number | null };
export type ConvertedFlow = {
  available: { opening: number; received: number; spent: number; available: number };
  month: ConvertedPeriod;
  year: ConvertedPeriod;
  /** Zero or one PHP group. */
  categoriesMonth: CategoryBreakdown[];
  categoriesYear: CategoryBreakdown[];
};

export type MoneyFlow = {
  /** Any expense exists at all (stored, not counting repeats). */
  hasExpenses: boolean;
  opening: OpeningBalance;
  /** Currencies with an opening balance or any movement this month, this year or since the opening date. */
  currencies: Currency[];
  available: AvailableMoney;
  month: PeriodFlow;
  year: PeriodFlow;
  categoriesMonth: CategoryBreakdown[];
  categoriesYear: CategoryBreakdown[];
  converted: ConvertedFlow | null;
};

export type MoneyFlowInput = {
  /** Every payment received, project and payment-only, dated by paidOn. */
  received: MoneyEvent[];
  expenses: Expense[];
  opening?: OpeningBalance;
  rates?: RateTable | null;
  now?: Date;
};

const periodOf = (received: MoneyEvent[], spent: MoneyEvent[], keep: (e: MoneyEvent) => boolean): PeriodFlow => {
  const r = sumEvents(received, keep);
  const s = sumEvents(spent, keep);
  return { received: r, spent: s, net: netOf(r, s) };
};

/** Every expense as a dated amount, derived repeats included. */
export function spentEvents(expenses: Expense[], today: IsoDate): MoneyEvent[] {
  return expenseLines(expenses, today).map((l) => ({ date: l.date, currency: l.currency, amount: l.amount }));
}

/** Available money, this month and this year, and spending by category, original currencies and (given rates) PHP. */
export function buildMoneyFlow(input: MoneyFlowInput): MoneyFlow {
  const now = input.now ?? new Date();
  const thisMonth: MonthKey = monthKeyOfInstant(now);
  const thisYear = thisMonth.slice(0, 4);
  const opening: OpeningBalance = input.opening ?? { balances: {}, date: null };

  // Derived repeats are included: they are spending like any other.
  const lines = expenseLines(input.expenses, todayIso(now));
  const spent: MoneyEvent[] = lines.map((l) => ({ date: l.date, currency: l.currency, amount: l.amount }));
  const received = input.received;

  const available = availableMoney(received, spent, opening);
  const month = periodOf(received, spent, (e) => monthKeyOf(e.date) === thisMonth);
  const year = periodOf(received, spent, (e) => e.date.startsWith(thisYear));
  const monthLines = lines.filter((l) => monthKeyOf(l.date) === thisMonth);
  const yearLines = lines.filter((l) => l.date.startsWith(thisYear));

  const currencies = CURRENCIES.filter(
    (c) => available.currencies.includes(c) || month.received[c] !== undefined || month.spent[c] !== undefined || year.received[c] !== undefined || year.spent[c] !== undefined,
  );

  let converted: ConvertedFlow | null = null;
  if (input.rates) {
    const rates = input.rates;
    const php = (money: MoneyByCurrency) => convertMoney(money, rates);
    // The year is the sum of its converted monthly buckets, like the "Earned this year" card.
    const yearSum = (events: MoneyEvent[]) => {
      const byMonth = new Map<string, MoneyByCurrency>();
      for (const e of events) {
        if (!e.date.startsWith(thisYear)) continue;
        const key = monthKeyOf(e.date);
        const bucket = byMonth.get(key) ?? byMonth.set(key, {}).get(key)!;
        bucket[e.currency] = (bucket[e.currency] ?? 0) + e.amount;
      }
      let total = 0;
      for (const money of byMonth.values()) total += php(money);
      return total;
    };
    const period = (receivedPhp: number, spentPhp: number): ConvertedPeriod => ({
      received: receivedPhp,
      spent: spentPhp,
      net: receivedPhp - spentPhp,
      margin: receivedPhp > 0 ? (receivedPhp - spentPhp) / receivedPhp : null,
    });
    const openingPhp = php(available.opening);
    const receivedPhp = php(available.received);
    const spentPhp = php(available.spent);
    converted = {
      available: { opening: openingPhp, received: receivedPhp, spent: spentPhp, available: openingPhp + receivedPhp - spentPhp },
      month: period(php(month.received), php(month.spent)),
      year: period(yearSum(received), yearSum(spent)),
      categoriesMonth: categoryBreakdowns(monthLines, rates),
      categoriesYear: categoryBreakdowns(yearLines, rates),
    };
  }

  return {
    hasExpenses: input.expenses.length > 0,
    opening,
    currencies,
    available,
    month,
    year,
    categoriesMonth: categoryBreakdowns(monthLines),
    categoriesYear: categoryBreakdowns(yearLines),
    converted,
  };
}

export type DashboardWithMoney = DashboardData & {
  money: MoneyFlow;
  /** Earnings and income vs expenses over the chosen date range. */
  range: RangeData;
};

/**
 * The dashboard plus the money-flow block and the range block. The first part is exactly what
 * buildDashboard returns; expenses are only ever read by buildMoneyFlow and buildRangeData.
 */
export function buildDashboardWithMoney(
  input: DashboardInput & { expenses?: Expense[]; opening?: OpeningBalance; range?: RangeSpec },
): DashboardWithMoney {
  const base = buildDashboard(input);
  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const received: MoneyEvent[] = mergeEarnings(input.payments, projectById, input.standalonePayments ?? []).map((p) => ({
    date: p.paidOn,
    currency: p.currency,
    amount: p.amount,
  }));
  const expenses = input.expenses ?? [];
  const money = buildMoneyFlow({ received, expenses, opening: input.opening, rates: input.rates ?? null, now: input.now });

  // "All time" starts at the first payment or expense on record.
  const spent = spentEvents(expenses, base.today);
  let earliest: IsoDate | null = null;
  for (const e of [...received, ...spent]) if (earliest === null || e.date < earliest) earliest = e.date;
  const range = buildRangeData({
    received,
    spent,
    range: resolveRange(input.range ?? { preset: "last-12-weeks" }, base.today, earliest),
    today: base.today,
    rates: input.rates ?? null,
  });
  return { ...base, money, range };
}
