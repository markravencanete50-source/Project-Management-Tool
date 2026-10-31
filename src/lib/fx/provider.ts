import { buildTable, covers, DISPLAY_CURRENCY, type RateQuote, type RateTable } from "@/lib/fx/convert";
import type { Currency } from "@/lib/money";

// Rates provider. Pure of environment access: the token, fetch and clock are
// passed in so every branch is unit tested without any network.
//
// Order of preference for each currency to PHP:
//   1. Wise (mid-market), only when a token is supplied.
//   2. open.er-api.com, free and keyless.
//   3. api.frankfurter.dev, free and keyless.
// Every request has a 4 second timeout and is cached by Next for an hour.
// Nothing here throws: a currency nobody can quote is simply missing.

export const FX_TIMEOUT_MS = 4000;
export const FX_REVALIDATE_SECONDS = 3600;
/** Last known rates are reused for up to a day when every source fails. */
export const FX_STALE_MAX_MS = 24 * 60 * 60 * 1000;

export type FxDeps = {
  fetch: typeof fetch;
  /** Wise API token. Never logged, never put in a URL. */
  wiseToken?: string;
  now?: () => Date;
};

type FetchInit = RequestInit & { next?: { revalidate?: number } };

async function getJson(deps: FxDeps, url: string, headers?: Record<string, string>): Promise<unknown | null> {
  try {
    const init: FetchInit = {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(FX_TIMEOUT_MS),
      next: { revalidate: FX_REVALIDATE_SECONDS },
    };
    const res = await deps.fetch(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Timeout, DNS, bad JSON: treated as "this source failed".
    return null;
  }
}

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function isoOr(value: unknown, fallback: Date): string {
  const d = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : fallback.toISOString();
}

async function fromWise(currency: Currency, deps: FxDeps, now: Date): Promise<RateQuote | null> {
  if (!deps.wiseToken) return null;
  const url = `https://api.wise.com/v1/rates?source=${currency}&target=${DISPLAY_CURRENCY}`;
  const json = await getJson(deps, url, { Authorization: `Bearer ${deps.wiseToken}` });
  // Wise answers with an array of rate objects: [{ rate, source, target, time }].
  const first = (Array.isArray(json) ? json[0] : json) as { rate?: unknown; time?: unknown } | null | undefined;
  if (!first || !positive(first.rate)) return null;
  return { currency, rate: first.rate, source: "wise", updatedAt: isoOr(first.time, now) };
}

async function fromErApi(currency: Currency, deps: FxDeps, now: Date): Promise<RateQuote | null> {
  const json = (await getJson(deps, `https://open.er-api.com/v6/latest/${currency}`)) as {
    result?: string;
    rates?: Record<string, unknown>;
    time_last_update_unix?: number;
  } | null;
  const rate = json?.rates?.[DISPLAY_CURRENCY];
  if (!json || json.result !== "success" || !positive(rate)) return null;
  const updated = typeof json.time_last_update_unix === "number" ? json.time_last_update_unix * 1000 : undefined;
  return { currency, rate, source: "open.er-api.com", updatedAt: isoOr(updated, now) };
}

async function fromFrankfurter(currency: Currency, deps: FxDeps, now: Date): Promise<RateQuote | null> {
  const json = (await getJson(
    deps,
    `https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=${DISPLAY_CURRENCY}`,
  )) as { rates?: Record<string, unknown>; date?: string } | null;
  const rate = json?.rates?.[DISPLAY_CURRENCY];
  if (!json || !positive(rate)) return null;
  return { currency, rate, source: "frankfurter", updatedAt: isoOr(json.date ? `${json.date}T00:00:00Z` : undefined, now) };
}

/** One currency to PHP through the fallback chain, or null when every source fails. PHP is not quoted. */
export async function fetchQuote(currency: Currency, deps: FxDeps): Promise<RateQuote | null> {
  if (currency === DISPLAY_CURRENCY) return null;
  const now = (deps.now ?? (() => new Date()))();
  return (
    (await fromWise(currency, deps, now)) ??
    (await fromErApi(currency, deps, now)) ??
    (await fromFrankfurter(currency, deps, now))
  );
}

// Last good table, kept in memory on this server instance so a total outage
// right after a good fetch still converts (and says the rates are stale).
let lastGood: { table: RateTable; at: number } | null = null;

/** Test hook: forget the remembered rates. */
export function resetFxMemory(): void {
  lastGood = null;
}

/**
 * Rates for every needed currency, or null when they cannot all be had.
 * - All quotes found: a fresh table (remembered as the last good one).
 * - Some missing but a remembered table covers them and is under a day old: that table, flagged stale.
 * - Otherwise null, and the dashboard falls back to original currencies.
 * Never throws.
 */
export async function getRateTable(currencies: Currency[], deps: FxDeps): Promise<RateTable | null> {
  const needed = [...new Set(currencies)].filter((c) => c !== DISPLAY_CURRENCY);
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  try {
    const quotes = await Promise.all(needed.map((c) => fetchQuote(c, deps)));
    if (quotes.every((q): q is RateQuote => q !== null)) {
      const table = buildTable(quotes);
      lastGood = { table, at: nowMs };
      return table;
    }
  } catch {
    // fall through to the remembered table
  }
  if (lastGood && nowMs - lastGood.at < FX_STALE_MAX_MS && covers(lastGood.table, needed)) {
    return { ...lastGood.table, stale: true };
  }
  return null;
}
