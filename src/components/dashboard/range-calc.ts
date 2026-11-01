// Pure range aggregation for the dashboard: earnings and income-vs-expenses series over any
// date range, at daily, weekly or monthly granularity, in the original currencies or as one
// PHP series. No server imports, so it can be unit tested.
//
// PHP rule: money is converted per DAY and per currency (round(minor * rate), half up) and the
// rounded days are summed into whatever buckets are shown. So bars add up to the total, and
// the total is the same whichever granularity is chosen.
import { periodDelta, type PeriodSummary } from "@/components/dashboard/calc";
import type { MoneyEvent } from "@/lib/available-money";
import {
  allowedGranularities,
  buildBuckets,
  daysBetweenIso,
  defaultGranularity,
  eachDay,
  GRANULARITIES,
  previousLabel,
  previousRange,
  type Bucket,
  type DateRange,
  type Granularity,
  type GranularityChoice,
} from "@/lib/date-range";
import type { IsoDate } from "@/lib/dates";
import { convertMoney, DISPLAY_CURRENCY, type RateTable } from "@/lib/fx/convert";
import { addMoney, CURRENCIES, type Currency, type MoneyByCurrency } from "@/lib/money";

export type RangePoint = {
  key: string;
  axisLabel: string;
  longLabel: string;
  /** The range cuts this bucket short (a partial first or last week or month). */
  partial: boolean;
  amount: number;
  cumulative: number;
};
export type RangeEarningsSeries = { currency: Currency; points: RangePoint[]; summary: PeriodSummary };

export type FlowPoint = {
  key: string;
  axisLabel: string;
  longLabel: string;
  partial: boolean;
  income: number;
  expense: number;
  /** income - expense, can be negative. */
  net: number;
};
export type FlowSeries = {
  currency: Currency;
  points: FlowPoint[];
  /** Over the whole range. Always the sum of the points. */
  totals: { income: number; expense: number; net: number };
  /** The same totals for the previous period of the same length. */
  previous: { income: number; expense: number; net: number };
  /** Net per bucket on average, and the bucket with the best net (null when nothing was received or spent). */
  average: number;
  best: { label: string; amount: number } | null;
};

export type ByGranularity<T> = Record<Granularity, T[]>;

export type RangeData = {
  range: DateRange;
  previous: { from: IsoDate; to: IsoDate; days: number };
  previousLabel: string;
  defaultGranularity: Granularity;
  choices: Record<Granularity, GranularityChoice>;
  /** Money received in the range, per currency. Standalone payments included. */
  earned: MoneyByCurrency;
  earnings: ByGranularity<RangeEarningsSeries>;
  flow: ByGranularity<FlowSeries>;
  /** The PHP view, or null when no rates were given. Series are zero or one PHP series. */
  converted: { earned: number; earnings: ByGranularity<RangeEarningsSeries>; flow: ByGranularity<FlowSeries> } | null;
};

const emptyBy = <T>(): ByGranularity<T> => ({ daily: [], weekly: [], monthly: [] });

/** Money per day, per currency. */
export function byDay(events: MoneyEvent[]): Map<IsoDate, MoneyByCurrency> {
  const out = new Map<IsoDate, MoneyByCurrency>();
  for (const e of events) addMoney(out.get(e.date) ?? out.set(e.date, {}).get(e.date)!, e.currency, e.amount);
  return out;
}

/** One number per day of the range. `pick` reads a day's money: one currency, or the converted PHP total. */
export function dayValues(days: Map<IsoDate, MoneyByCurrency>, range: Pick<DateRange, "from" | "to">, pick: (m: MoneyByCurrency) => number): number[] {
  return eachDay(range).map((d) => {
    const money = days.get(d);
    return money ? pick(money) : 0;
  });
}

/** Add the days of each bucket. The buckets are trimmed to the range, so every day is counted once. */
export function sumBuckets(buckets: Pick<Bucket, "start" | "end">[], rangeFrom: IsoDate, values: number[]): number[] {
  const prefix = [0];
  for (const v of values) prefix.push(prefix[prefix.length - 1] + v);
  return buckets.map((b) => prefix[daysBetweenIso(rangeFrom, b.end) + 1] - prefix[daysBetweenIso(rangeFrom, b.start)]);
}

const sum = (values: number[]) => values.reduce((s, n) => s + n, 0);

function summarize(labels: string[], amounts: number[], previousTotal: number): PeriodSummary {
  const total = sum(amounts);
  let best: PeriodSummary["best"] = null;
  amounts.forEach((amount, i) => {
    if (amount > 0 && (best === null || amount >= best.amount)) best = { label: labels[i], amount };
  });
  return { current: total, previous: previousTotal, ...periodDelta(total, previousTotal), total, average: amounts.length ? total / amounts.length : 0, best };
}

type Picker = { currency: Currency; pick: (m: MoneyByCurrency) => number };

function pickers(rates: RateTable | null): Picker[] {
  if (rates) return [{ currency: DISPLAY_CURRENCY, pick: (m) => convertMoney(m, rates) }];
  return CURRENCIES.map((currency) => ({ currency, pick: (m: MoneyByCurrency) => m[currency] ?? 0 }));
}

/** Earnings series for one granularity: a series per currency that has any money in the range (or one PHP series). */
function earningsFor(buckets: Bucket[], range: DateRange, prev: { from: IsoDate; to: IsoDate }, incomeDays: Map<IsoDate, MoneyByCurrency>, rates: RateTable | null): RangeEarningsSeries[] {
  const out: RangeEarningsSeries[] = [];
  for (const { currency, pick } of pickers(rates)) {
    const amounts = sumBuckets(buckets, range.from, dayValues(incomeDays, range, pick));
    if (!amounts.some((a) => a !== 0)) continue;
    const previousTotal = sum(dayValues(incomeDays, prev, pick));
    let running = 0;
    const points: RangePoint[] = buckets.map((b, i) => ({
      key: b.key,
      axisLabel: b.axisLabel,
      longLabel: b.longLabel,
      partial: b.partial,
      amount: amounts[i],
      cumulative: (running += amounts[i]),
    }));
    out.push({ currency, points, summary: summarize(buckets.map((b) => b.longLabel), amounts, previousTotal) });
  }
  return out;
}

/** Income against expenses for one granularity. A series exists when there is any income or spending in the range. */
function flowFor(
  buckets: Bucket[],
  range: DateRange,
  prev: { from: IsoDate; to: IsoDate },
  incomeDays: Map<IsoDate, MoneyByCurrency>,
  expenseDays: Map<IsoDate, MoneyByCurrency>,
  rates: RateTable | null,
): FlowSeries[] {
  const out: FlowSeries[] = [];
  for (const { currency, pick } of pickers(rates)) {
    const inc = sumBuckets(buckets, range.from, dayValues(incomeDays, range, pick));
    const exp = sumBuckets(buckets, range.from, dayValues(expenseDays, range, pick));
    if (!inc.some((a) => a !== 0) && !exp.some((a) => a !== 0)) continue;
    const points: FlowPoint[] = buckets.map((b, i) => ({
      key: b.key,
      axisLabel: b.axisLabel,
      longLabel: b.longLabel,
      partial: b.partial,
      income: inc[i],
      expense: exp[i],
      net: inc[i] - exp[i],
    }));
    const income = sum(inc);
    const expense = sum(exp);
    const prevIncome = sum(dayValues(incomeDays, prev, pick));
    const prevExpense = sum(dayValues(expenseDays, prev, pick));
    let best: FlowSeries["best"] = null;
    for (const p of points) if ((p.income !== 0 || p.expense !== 0) && (best === null || p.net >= best.amount)) best = { label: p.longLabel, amount: p.net };
    out.push({
      currency,
      points,
      totals: { income, expense, net: income - expense },
      previous: { income: prevIncome, expense: prevExpense, net: prevIncome - prevExpense },
      average: points.length ? (income - expense) / points.length : 0,
      best,
    });
  }
  return out;
}

/**
 * Everything the Earnings and Income vs expenses sections show for one range, for every
 * granularity that fits under the bar cap (the others stay empty). Buckets are Manila calendar
 * days, Monday-start weeks and calendar months, trimmed to the range and zero filled.
 */
export function buildRangeData(input: { received: MoneyEvent[]; spent: MoneyEvent[]; range: DateRange; today: IsoDate; rates?: RateTable | null }): RangeData {
  const { range, today } = input;
  const prev = previousRange(range);
  const choices = allowedGranularities(range);
  const incomeDays = byDay(input.received);
  const expenseDays = byDay(input.spent);

  const earnings = emptyBy<RangeEarningsSeries>();
  const flow = emptyBy<FlowSeries>();
  const cEarnings = emptyBy<RangeEarningsSeries>();
  const cFlow = emptyBy<FlowSeries>();
  for (const g of GRANULARITIES) {
    if (!choices[g].ok) continue;
    const buckets = buildBuckets(range, g, today);
    earnings[g] = earningsFor(buckets, range, prev, incomeDays, null);
    flow[g] = flowFor(buckets, range, prev, incomeDays, expenseDays, null);
    if (input.rates) {
      cEarnings[g] = earningsFor(buckets, range, prev, incomeDays, input.rates);
      cFlow[g] = flowFor(buckets, range, prev, incomeDays, expenseDays, input.rates);
    }
  }

  const earned: MoneyByCurrency = {};
  for (const day of eachDay(range)) {
    const money = incomeDays.get(day);
    if (money) for (const c of CURRENCIES) if (money[c] !== undefined) addMoney(earned, c, money[c] ?? 0);
  }
  const rates = input.rates ?? null;
  return {
    range,
    previous: prev,
    previousLabel: previousLabel(range),
    defaultGranularity: defaultGranularity(range),
    choices,
    earned,
    earnings,
    flow,
    converted: rates ? { earned: sum(dayValues(incomeDays, range, (m) => convertMoney(m, rates))), earnings: cEarnings, flow: cFlow } : null,
  };
}
