import { currenciesIn, formatMoney, type MoneyByCurrency } from "@/lib/money";

/** Totals per currency, one per line. Never converts between currencies. */
export function MoneyByCurrencyView({ value, empty = "None" }: { value: MoneyByCurrency; empty?: string }) {
  const currencies = currenciesIn(value);
  if (currencies.length === 0) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className="flex flex-col tabular-nums">
      {currencies.map((c) => (
        <span key={c}>{formatMoney(value[c] ?? 0, c)}</span>
      ))}
    </span>
  );
}
