import { addDaysIso, addMonthsClamped, monthKeyOf, type IsoDate, type MonthKey } from "@/lib/dates";
import { convertMinor, rateOf, type RateTable } from "@/lib/fx/convert";
import { addMoney, CURRENCIES, type Currency, type MoneyByCurrency } from "@/lib/money";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  RECURRING_INTERVALS,
  type Expense,
  type ExpenseCategory,
  type ExpenseMethod,
  type RecurringInterval,
} from "@/lib/types";

// Pure rules for expenses: money spent. An expense with a repeat interval is a
// TEMPLATE. Its repeats are derived on read, from the first date forward to today
// (Manila), and are never stored or created by a job. Derived repeats count in
// totals and charts like any other expense, flagged as recurring.

/** An expense may be dated up to one day ahead of today (Manila), to allow for time zones. */
export function latestSpentOn(today: IsoDate): IsoDate {
  return addDaysIso(today, 1);
}

/** Why a "stop repeating after" date is not acceptable, or null when it is fine (or not used). */
export function recurringUntilProblem(input: { spentOn: IsoDate; recurring: RecurringInterval; recurringUntil: IsoDate | null }): string | null {
  if (input.recurring === "none" || !input.recurringUntil) return null;
  return input.recurringUntil < input.spentOn ? "Stop date must be on or after the first date" : null;
}

/** Normalise a stored document: missing or odd fields become safe values. */
export function normalizeExpense(id: string, raw: Record<string, unknown>, createdAt: Date, updatedAt: Date): Expense {
  const currency: Currency = raw.currency === "GBP" || raw.currency === "USD" || raw.currency === "PHP" ? raw.currency : "PHP";
  const recurring: RecurringInterval = RECURRING_INTERVALS.includes(raw.recurring as RecurringInterval) ? (raw.recurring as RecurringInterval) : "none";
  const until = typeof raw.recurringUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.recurringUntil) ? raw.recurringUntil : null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const link = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id,
    description: str(raw.description),
    amount: typeof raw.amount === "number" && Number.isFinite(raw.amount) ? Math.round(raw.amount) : 0,
    currency,
    spentOn: typeof raw.spentOn === "string" ? raw.spentOn : "1970-01-01",
    category: EXPENSE_CATEGORIES.includes(raw.category as ExpenseCategory) ? (raw.category as ExpenseCategory) : "other",
    method: EXPENSE_METHODS.includes(raw.method as ExpenseMethod) ? (raw.method as ExpenseMethod) : "other",
    vendor: str(raw.vendor),
    note: str(raw.note),
    clientId: link(raw.clientId),
    projectId: link(raw.projectId),
    recurring,
    recurringUntil: recurring === "none" ? null : until,
    receiptPublicId: link(raw.receiptPublicId),
    createdAt,
    updatedAt,
  };
}

// ------------------------------------------------------------ recurrence

/** A safety cap so a typo (weekly from the year 1990) can never build an endless list. */
export const MAX_OCCURRENCES = 1500;

/**
 * Every date a template lands on, oldest first. The first date is always the
 * template's own spentOn (the stored document). After that, occurrence k is the
 * original date plus k intervals, counted from the ORIGINAL date (31 Jan monthly
 * gives 28 or 29 Feb, then 31 Mar), while it is on or before `today` and on or
 * before `recurringUntil`. A template that starts in the future has only its own
 * date, with no derived repeats.
 */
export function occurrenceDates(
  spentOn: IsoDate,
  recurring: RecurringInterval,
  recurringUntil: IsoDate | null,
  today: IsoDate,
): IsoDate[] {
  const dates: IsoDate[] = [spentOn];
  if (recurring === "none") return dates;
  for (let k = 1; dates.length < MAX_OCCURRENCES; k++) {
    const date = recurring === "weekly" ? addDaysIso(spentOn, 7 * k) : addMonthsClamped(spentOn, recurring === "monthly" ? k : 12 * k);
    if (date > today) break;
    if (recurringUntil && date > recurringUntil) break;
    dates.push(date);
  }
  return dates;
}

/** One dated line of spending: a stored expense, or a derived repeat of a recurring one. */
export type ExpenseLine = {
  /** Stable id for the line: the expense id, plus the date for a derived repeat. */
  key: string;
  expenseId: string;
  date: IsoDate;
  /** True for a repeat derived from a template (not stored anywhere). */
  derived: boolean;
  /** The stored expense's own date: the first date of a recurring one. Same as date for a stored line. */
  startsOn: IsoDate;
  recurring: RecurringInterval;
  recurringUntil: IsoDate | null;
  description: string;
  amount: number;
  currency: Currency;
  category: ExpenseCategory;
  method: ExpenseMethod;
  vendor: string;
  note: string;
  clientId: string | null;
  projectId: string | null;
  receiptPublicId: string | null;
  createdAt: Date;
};

/** Expand expenses into dated lines, repeats included, newest first. */
export function expenseLines(expenses: Expense[], today: IsoDate): ExpenseLine[] {
  const lines: ExpenseLine[] = [];
  for (const e of expenses) {
    const dates = occurrenceDates(e.spentOn, e.recurring, e.recurringUntil, today);
    dates.forEach((date, i) => {
      lines.push({
        key: i === 0 ? e.id : `${e.id}@${date}`,
        expenseId: e.id,
        date,
        derived: i > 0,
        startsOn: e.spentOn,
        recurring: e.recurring,
        recurringUntil: e.recurringUntil,
        description: e.description,
        amount: e.amount,
        currency: e.currency,
        category: e.category,
        method: e.method,
        vendor: e.vendor,
        note: e.note,
        clientId: e.clientId,
        projectId: e.projectId,
        receiptPublicId: e.receiptPublicId,
        createdAt: e.createdAt,
      });
    });
  }
  return sortLines(lines);
}

/** Newest first: by date, then by when it was recorded, then by key so the order is stable. */
export function sortLines<T extends Pick<ExpenseLine, "date" | "createdAt" | "key">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime() || a.key.localeCompare(b.key));
}

// --------------------------------------------------------------- filters

export type ExpenseFilters = {
  /** "YYYY-MM" or "all". */
  month: string;
  currency: string;
  category: string;
  clientId: string;
  /** Free text matched against description, vendor and note. Empty means no search. */
  q: string;
};

export const NO_EXPENSE_FILTERS: ExpenseFilters = { month: "all", currency: "all", category: "all", clientId: "all", q: "" };

export function filterExpenseLines<T extends ExpenseLine>(rows: T[], f: ExpenseFilters): T[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.month !== "all" && monthKeyOf(r.date) !== f.month) return false;
    if (f.currency !== "all" && r.currency !== f.currency) return false;
    if (f.category !== "all" && r.category !== f.category) return false;
    if (f.clientId !== "all" && r.clientId !== f.clientId) return false;
    if (q && !`${r.description} ${r.vendor} ${r.note}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Read the filters from URL search params, ignoring anything unexpected. */
export function parseExpenseFilters(sp: Record<string, string | string[] | undefined>): ExpenseFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const month = one(sp.month);
  const currency = one(sp.currency);
  const category = one(sp.category);
  return {
    month: /^\d{4}-\d{2}$/.test(month) ? month : "all",
    currency: currency === "GBP" || currency === "USD" || currency === "PHP" ? currency : "all",
    category: EXPENSE_CATEGORIES.includes(category as ExpenseCategory) ? category : "all",
    clientId: one(sp.client).slice(0, 80) || "all",
    q: one(sp.q).trim().slice(0, 80),
  };
}

/** Months that have at least one line, newest first, for the month filter. */
export function expenseMonths(rows: Pick<ExpenseLine, "date">[]): MonthKey[] {
  return [...new Set(rows.map((r) => monthKeyOf(r.date)))].sort().reverse();
}

// ---------------------------------------------------------------- totals

/** Totals per currency (currencies are never added together). */
export function expenseTotals(rows: Pick<ExpenseLine, "currency" | "amount">[]): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  for (const r of rows) addMoney(out, r.currency, r.amount);
  return out;
}

export type CategoryRow = { category: ExpenseCategory; amount: number; /** 0 to 1 of the group total. */ share: number };
/** Spending by category in one currency (a currency of its own, or PHP when converted). Biggest first. */
export type CategoryBreakdown = { currency: Currency; total: number; rows: CategoryRow[] };

/**
 * Spending per category. Without rates there is one group per currency (amounts in
 * different currencies are never added). With rates there is a single PHP group:
 * each (category, currency) bucket is converted and rounded on its own, then the
 * buckets are summed, so the rows add up to the total exactly.
 */
export function categoryBreakdowns(
  rows: Pick<ExpenseLine, "category" | "currency" | "amount">[],
  rates: Pick<RateTable, "quotes"> | null = null,
): CategoryBreakdown[] {
  const buckets = new Map<string, number>(); // `${currency}|${category}` -> minor units
  for (const r of rows) {
    const key = `${r.currency}|${r.category}`;
    buckets.set(key, (buckets.get(key) ?? 0) + r.amount);
  }
  const build = (currency: Currency, amounts: Map<ExpenseCategory, number>): CategoryBreakdown | null => {
    const total = [...amounts.values()].reduce((s, n) => s + n, 0);
    if (total <= 0) return null;
    const ordered = [...amounts.entries()]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1] || EXPENSE_CATEGORIES.indexOf(a[0]) - EXPENSE_CATEGORIES.indexOf(b[0]));
    return { currency, total, rows: ordered.map(([category, amount]) => ({ category, amount, share: amount / total })) };
  };

  if (rates) {
    const php = new Map<ExpenseCategory, number>();
    for (const [key, minor] of buckets) {
      const [currency, category] = key.split("|") as [Currency, ExpenseCategory];
      const rate = rateOf(rates, currency);
      if (rate === null) continue;
      php.set(category, (php.get(category) ?? 0) + convertMinor(minor, rate));
    }
    const group = build("PHP", php);
    return group ? [group] : [];
  }

  const out: CategoryBreakdown[] = [];
  for (const currency of CURRENCIES) {
    const amounts = new Map<ExpenseCategory, number>();
    for (const [key, minor] of buckets) {
      const [c, category] = key.split("|") as [Currency, ExpenseCategory];
      if (c === currency) amounts.set(category, minor);
    }
    const group = build(currency, amounts);
    if (group) out.push(group);
  }
  return out;
}

/** The stored expense behind a line (for a repeat, the repeating template), in the shape the edit dialog takes. */
export function templateOf(line: ExpenseLine) {
  return {
    id: line.expenseId,
    description: line.description,
    amount: line.amount,
    currency: line.currency,
    spentOn: line.startsOn,
    category: line.category,
    method: line.method,
    vendor: line.vendor,
    note: line.note,
    clientId: line.clientId,
    projectId: line.projectId,
    recurring: line.recurring,
    recurringUntil: line.recurringUntil,
    receiptPublicId: line.receiptPublicId,
  };
}
