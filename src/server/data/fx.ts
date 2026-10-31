import "server-only";
import { env } from "@/lib/env";
import { buildTable, DISPLAY_CURRENCY, type RateQuote, type RateTable } from "@/lib/fx/convert";
import { getRateTable } from "@/lib/fx/provider";
import { CURRENCIES, type Currency } from "@/lib/money";

/**
 * Test hook for the end to end run, which must never touch the network.
 * FX_STUB_RATES="GBP=72.5,USD=56.2" supplies fixed rates; "fail" simulates every
 * source being down. Unset in production, where it does nothing.
 */
function stubbed(currencies: Currency[]): RateTable | null | undefined {
  const raw = process.env.FX_STUB_RATES;
  if (!raw) return undefined;
  if (raw.trim() === "fail") return null;
  const map = new Map(raw.split(",").map((pair) => pair.split("=").map((s) => s.trim()) as [string, string]));
  const now = new Date().toISOString();
  const quotes: RateQuote[] = [];
  for (const currency of currencies) {
    if (currency === DISPLAY_CURRENCY) continue;
    const rate = Number(map.get(currency));
    if (!Number.isFinite(rate) || rate <= 0) return null;
    quotes.push({ currency, rate, source: "stub", updatedAt: now });
  }
  return buildTable(quotes);
}

/**
 * Rates to PHP for the currencies the dashboard needs, or null when they cannot
 * be had. Never throws. Uses Wise when WISE_API_TOKEN is set, then free public
 * sources (see src/lib/fx/provider.ts). The token is read here and handed to
 * the provider; it is never logged.
 */
export async function loadRateTable(currencies: Currency[]): Promise<RateTable | null> {
  const wanted = CURRENCIES.filter((c) => currencies.includes(c));
  const stub = stubbed(wanted);
  if (stub !== undefined) return stub;
  try {
    return await getRateTable(wanted, { fetch, wiseToken: env().WISE_API_TOKEN });
  } catch {
    return null;
  }
}
