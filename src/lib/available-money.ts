import type { IsoDate } from "@/lib/dates";
import { addMoney, CURRENCIES, type Currency, type MoneyByCurrency } from "@/lib/money";

// Available money = opening balance + money received - money spent, per currency.
// It is a NET figure worked out from the records in this app, not a bank balance.
// Received is every project payment plus every payment-only entry; spent is every
// expense including derived recurring repeats. Nothing here is stored.

/** One dated movement of money in one currency: a payment received or an expense. */
export type MoneyEvent = { date: IsoDate; currency: Currency; amount: number };

export type OpeningBalance = {
  /** Per currency, minor units, may be negative. A missing currency means no opening balance. */
  balances: MoneyByCurrency;
  /** When set, only events ON OR AFTER this date count. Null counts everything. */
  date: IsoDate | null;
};

export const NO_OPENING: OpeningBalance = { balances: {}, date: null };

export type AvailableMoney = {
  /** Currencies that have an opening balance or any counted movement, in GBP, USD, PHP order. */
  currencies: Currency[];
  opening: MoneyByCurrency;
  received: MoneyByCurrency;
  spent: MoneyByCurrency;
  /** opening + received - spent. Negative when more went out than came in. */
  available: MoneyByCurrency;
};

/** Is this event counted, given the opening date? */
export function countsTowardsOpening(date: IsoDate, openingDate: IsoDate | null): boolean {
  return openingDate === null || date >= openingDate;
}

/** Sum events per currency, optionally only those passing `keep`. */
export function sumEvents(events: MoneyEvent[], keep: (e: MoneyEvent) => boolean = () => true): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  for (const e of events) if (keep(e)) addMoney(out, e.currency, e.amount);
  return out;
}

/** Available money per currency, honouring the optional opening balance and opening date. */
export function availableMoney(received: MoneyEvent[], spent: MoneyEvent[], opening: OpeningBalance = NO_OPENING): AvailableMoney {
  const keep = (e: MoneyEvent) => countsTowardsOpening(e.date, opening.date);
  const receivedSum = sumEvents(received, keep);
  const spentSum = sumEvents(spent, keep);
  const out: AvailableMoney = { currencies: [], opening: {}, received: {}, spent: {}, available: {} };
  for (const c of CURRENCIES) {
    const open = opening.balances[c];
    const inn = receivedSum[c];
    const outt = spentSum[c];
    if (open === undefined && inn === undefined && outt === undefined) continue;
    out.currencies.push(c);
    out.opening[c] = open ?? 0;
    out.received[c] = inn ?? 0;
    out.spent[c] = outt ?? 0;
    out.available[c] = (open ?? 0) + (inn ?? 0) - (outt ?? 0);
  }
  return out;
}

/** received - spent per currency, over the currencies either side has. */
export function netOf(received: MoneyByCurrency, spent: MoneyByCurrency): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  for (const c of CURRENCIES) {
    if (received[c] === undefined && spent[c] === undefined) continue;
    out[c] = (received[c] ?? 0) - (spent[c] ?? 0);
  }
  return out;
}

/**
 * Profit margin as a fraction of income: net / received. Null when nothing was
 * received (no divide by zero), so the UI says "no income" instead of a number.
 */
export function profitMargin(received: number, spent: number): number | null {
  return received > 0 ? (received - spent) / received : null;
}

/** "-12%", "38%", rounded to a whole percent; "n/a" has no value to show. */
export function formatMargin(margin: number | null): string | null {
  if (margin === null || !Number.isFinite(margin)) return null;
  const pct = Math.round(margin * 100);
  return `${pct < 0 ? "-" : ""}${Math.abs(pct)}%`;
}

// ----------------------------------------------------------- settings shape

/** Largest opening balance accepted, in minor units (1,000,000,000.00). */
export const OPENING_LIMIT = 100_000_000_000;

export const isValidOpening = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && Math.abs(n) <= OPENING_LIMIT;

/** Old or damaged settings docs: anything missing or invalid means "no opening balance" for that currency. */
export function normalizeOpeningBalances(raw: unknown): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const c of CURRENCIES) if (isValidOpening(obj[c])) out[c] = obj[c] as number;
  return out;
}

export function normalizeOpeningDate(raw: unknown): IsoDate | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw ? raw : null;
}
