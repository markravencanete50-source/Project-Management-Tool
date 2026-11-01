import { CURRENCIES, type Currency, type MoneyByCurrency } from "@/lib/money";

// Pure currency conversion for the dashboard. No network and no server imports,
// so everything here is unit tested.
//
// What this is and is not: a DISPLAY conversion into Philippine peso at the
// CURRENT rate, applied to every payment however old. It is not the rate on the
// day each payment arrived, so historical PHP totals move as the rate moves.
// Nothing converted is ever stored.

export const DISPLAY_CURRENCY: Currency = "PHP";

/** Where a quote came from. "stub" is only used by the end to end tests. */
export type RateSource = "wise" | "open.er-api.com" | "frankfurter" | "stub" | "manual";

/** 1 unit of `currency` is `rate` PHP. */
export type RateQuote = {
  currency: Currency;
  rate: number;
  source: RateSource;
  /** When the source says the rate was published (ISO instant). */
  updatedAt: string;
};

export type RateTable = {
  quotes: RateQuote[];
  /** "wise" when every quote came from Wise, otherwise "market" (a free mid-market source). */
  provider: "wise" | "market";
  /** The oldest quote time, so "updated X ago" is never optimistic. */
  updatedAt: string;
  /** True when these are the last known rates, reused because every source failed. */
  stale: boolean;
};

/** PHP per 1 unit of `currency`, or null when the table has no quote for it. PHP to PHP is exactly 1. */
export function rateOf(table: Pick<RateTable, "quotes">, currency: Currency): number | null {
  if (currency === DISPLAY_CURRENCY) return 1;
  return table.quotes.find((q) => q.currency === currency)?.rate ?? null;
}

/**
 * Minor units of one currency to PHP centavos: round(minor * rate).
 *
 * Every supported currency has 2 decimals, so the minor-unit scale is the same
 * on both sides and the rate applies directly. The product is first rounded to
 * 6 decimals so binary float noise (12345.499999999998) cannot flip a half
 * centavo the wrong way; the final Math.round then rounds half up. A rate of
 * exactly 1 (PHP to PHP) returns the input untouched.
 */
export function convertMinor(minor: number, rate: number): number {
  if (rate === 1) return minor;
  return Math.round(Number((minor * rate).toFixed(6)));
}

/**
 * Convert one bucket of money (a map of currency to minor units) to PHP.
 * Each currency is converted and rounded on its own, then the results are
 * summed. A bucket is, for example, one month's payments in one currency, so
 * rounding happens once per bucket and never accumulates across a long series.
 * A currency with no rate contributes 0; callers only convert when the table
 * covers every currency present.
 */
export function convertMoney(money: MoneyByCurrency, table: Pick<RateTable, "quotes">): number {
  let total = 0;
  for (const currency of CURRENCIES) {
    const minor = money[currency];
    if (minor === undefined || minor === 0) continue;
    const rate = rateOf(table, currency);
    if (rate === null) continue;
    total += convertMinor(minor, rate);
  }
  return total;
}

/** True when the table can convert every one of these currencies. */
export function covers(table: Pick<RateTable, "quotes">, currencies: Currency[]): boolean {
  return currencies.every((c) => rateOf(table, c) !== null);
}

/** Build a table from quotes. The caller passes only the quotes it needs (PHP needs none). */
export function buildTable(quotes: RateQuote[], stale = false): RateTable {
  // Manual rates have no publish time and are not live, so they do not count here.
  const live = quotes.filter((q) => q.source !== "manual");
  const oldest = live.reduce<string | null>((min, q) => (min === null || q.updatedAt < min ? q.updatedAt : min), null);
  return {
    quotes,
    provider: live.length > 0 && live.every((q) => q.source === "wise") ? "wise" : "market",
    updatedAt: oldest ?? new Date(0).toISOString(),
    stale,
  };
}

/** "5 minutes ago", "2 hours ago", "just now". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

/** Short label for the rate popover: "your rate", "Wise" or "market". */
export function sourceLabel(source: RateSource): string {
  return source === "manual" ? "your rate" : source === "wise" ? "Wise" : "market";
}

export const SOURCE_NAMES: Record<RateSource, string> = {
  wise: "Wise",
  "open.er-api.com": "open.er-api.com",
  frankfurter: "Frankfurter (ECB)",
  stub: "Test rates",
  manual: "your rate",
};
