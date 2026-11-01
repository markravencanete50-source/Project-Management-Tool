import { buildTable, DISPLAY_CURRENCY, type RateQuote, type RateTable } from "@/lib/fx/convert";
import type { Currency } from "@/lib/money";

// Manual exchange rates the owner sets in Settings. Pure: no network, no server
// imports. A rate is stored as an integer count of 1/10000 PHP per 1 unit of the
// currency (56.1234 is stored as 561234), so no float ever reaches the database.

/** Currencies that can have a manual rate. PHP is always exactly 1. */
export const OVERRIDABLE = ["USD", "GBP"] as const satisfies readonly Currency[];
export type OverridableCurrency = (typeof OVERRIDABLE)[number];

/** Stored manual rates in 1/10000 PHP. Absent = use the live rate. */
export type FxOverrides = { USD?: number; GBP?: number };

export const FX_SCALE = 10000;
export const FX_MIN_UNITS = 1; // 0.0001 PHP
export const FX_MAX_UNITS = 1_000_000 * FX_SCALE; // 1,000,000 PHP

export const isValidUnits = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= FX_MIN_UNITS && n <= FX_MAX_UNITS;

/** Old or damaged settings docs: anything missing or out of range means "live". */
export function normalizeFxOverrides(raw: unknown): FxOverrides {
  const out: FxOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const c of OVERRIDABLE) if (isValidUnits(obj[c])) out[c] = obj[c] as number;
  return out;
}

/** 561234 becomes 56.1234. */
export const unitsToRate = (units: number): number => units / FX_SCALE;

/**
 * "56.1234" (or "1,234.5") to stored units, or null when it is not a positive
 * decimal with at most 4 decimal places inside the allowed range. Done on the
 * text so 56.1234 never passes through float multiplication.
 */
export function parseRateInput(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, "");
  const m = /^(\d{1,7})(?:\.(\d{1,4}))?$/.exec(cleaned);
  if (!m) return null;
  const units = Number(m[1]) * FX_SCALE + Number((m[2] ?? "").padEnd(4, "0"));
  return isValidUnits(units) ? units : null;
}

/** Stored units to the text shown in the input: 561234 becomes "56.1234", 560000 becomes "56". */
export function unitsToInput(units: number): string {
  const whole = Math.floor(units / FX_SCALE);
  const frac = String(units % FX_SCALE).padStart(4, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

/** A quote for a manual rate. It has no publish time of its own. */
export function manualQuote(currency: Currency, units: number, now: Date): RateQuote {
  return { currency, rate: unitsToRate(units), source: "manual", updatedAt: now.toISOString() };
}

/**
 * Combine manual rates with live ones. Manual always wins for its currency, and
 * the network (via `loadLive`) is only asked about currencies WITHOUT a manual
 * rate: when every needed currency has one, `loadLive` is never called. If live
 * rates fail, the result is null only when a needed currency has no manual rate.
 * Overrides are applied here, after any cached live fetch, and are never part of
 * what the live loader caches.
 */
export async function resolveRateTable(
  currencies: Currency[],
  overrides: FxOverrides,
  loadLive: (currencies: Currency[]) => Promise<RateTable | null>,
  now: Date = new Date(),
): Promise<RateTable | null> {
  const needed = [...new Set(currencies)].filter((c) => c !== DISPLAY_CURRENCY);
  const manualOf = (c: Currency): number | undefined => (c === "USD" || c === "GBP" ? overrides[c] : undefined);
  const liveNeeded = needed.filter((c) => manualOf(c) === undefined);

  let live: RateTable | null = null;
  if (liveNeeded.length > 0) {
    live = await loadLive(liveNeeded);
    if (!live) return null;
  }

  const quotes: RateQuote[] = [];
  for (const c of needed) {
    const units = manualOf(c);
    if (units !== undefined) quotes.push(manualQuote(c, units, now));
    else {
      const q = live?.quotes.find((x) => x.currency === c);
      if (!q) return null;
      quotes.push(q);
    }
  }
  return buildTable(quotes, live?.stale ?? false);
}

/** Which kinds of source made a table. */
export function sourceMix(table: Pick<RateTable, "quotes">): "none" | "manual" | "mixed" | "live" {
  const manual = table.quotes.filter((q) => q.source === "manual").length;
  if (table.quotes.length === 0) return "none";
  if (manual === 0) return "live";
  return manual === table.quotes.length ? "manual" : "mixed";
}
