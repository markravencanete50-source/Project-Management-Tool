export const CURRENCIES = ["GBP", "USD", "PHP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type MoneyByCurrency = Partial<Record<Currency, number>>;

const LOCALES: Record<Currency, string> = { GBP: "en-GB", USD: "en-US", PHP: "en-PH" };

/**
 * Parse a user-entered decimal ("1500", "1,500.5", "1500.50") into minor units.
 * Uses string arithmetic so 0.1 + 0.2 style float errors can never reach storage.
 * Returns null for anything that is not a non-negative amount with at most 2 decimals.
 */
export function toMinor(input: string | number): number | null {
  const raw = typeof input === "number" ? input.toFixed(2) : input.replace(/,/g, "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const minor = whole * 100 + fraction;
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Minor units to a plain decimal string for form inputs ("1500.50"). */
export function fromMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatMoney(minor: number, currency: Currency): string {
  return new Intl.NumberFormat(LOCALES[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** Compact form for chart labels ("£1.2k"). */
export function formatMoneyCompact(minor: number, currency: Currency): string {
  return new Intl.NumberFormat(LOCALES[currency], {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(minor / 100);
}

export function addMoney(target: MoneyByCurrency, currency: Currency, minor: number): MoneyByCurrency {
  target[currency] = (target[currency] ?? 0) + minor;
  return target;
}

/** Currencies present in a map, in the fixed GBP, USD, PHP order. */
export function currenciesIn(map: MoneyByCurrency): Currency[] {
  return CURRENCIES.filter((c) => map[c] !== undefined);
}
