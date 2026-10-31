import type { Currency } from "@/lib/money";

/** One theme chart token per currency, so a currency keeps its colour across every chart. */
export const CURRENCY_COLOR: Record<Currency, string> = {
  GBP: "var(--chart-1)",
  USD: "var(--chart-2)",
  PHP: "var(--chart-5)",
};
