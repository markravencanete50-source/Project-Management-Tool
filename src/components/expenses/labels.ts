import type { ExpenseCategory, ExpenseMethod, RecurringInterval } from "@/lib/types";

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: "Software",
  equipment: "Equipment",
  subscriptions: "Subscriptions",
  transport: "Transport",
  food: "Food",
  taxes_fees: "Taxes and fees",
  marketing: "Marketing",
  office: "Office",
  other: "Other",
};

export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  bank: "Bank transfer",
  paypal: "PayPal",
  wise: "Wise",
  gcash: "GCash",
  cash: "Cash",
  card: "Card",
  other: "Other",
};

export const RECURRING_LABELS: Record<RecurringInterval, string> = {
  none: "Does not repeat",
  weekly: "Repeats weekly",
  monthly: "Repeats monthly",
  yearly: "Repeats yearly",
};

/** The word used in sentences: "every week". */
export const RECURRING_UNIT: Record<Exclude<RecurringInterval, "none">, string> = {
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

/** One colour per category, from the chart palette plus the semantic tokens, so a category keeps its colour everywhere. */
export const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  software: "var(--chart-1)",
  equipment: "var(--chart-2)",
  subscriptions: "var(--violet)",
  transport: "var(--chart-5)",
  food: "var(--chart-3)",
  taxes_fees: "var(--chart-4)",
  marketing: "var(--teal)",
  office: "var(--info)",
  other: "var(--muted-foreground)",
};
