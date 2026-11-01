import { describe, expect, it } from "vitest";
import { buildDashboard, type DashboardInput, type DashProject } from "@/components/dashboard/calc";
import { buildDashboardWithMoney, buildMoneyFlow, spentEvents } from "@/components/dashboard/flow-calc";
import { buildRangeData } from "@/components/dashboard/range-calc";
import { resolveRange } from "@/lib/date-range";
import {
  availableMoney,
  formatMargin,
  netOf,
  normalizeOpeningBalances,
  normalizeOpeningDate,
  profitMargin,
  type MoneyEvent,
} from "@/lib/available-money";
import { addMonthsClamped, todayIso } from "@/lib/dates";
import {
  categoryBreakdowns,
  expenseLines,
  expenseMonths,
  expenseTotals,
  filterExpenseLines,
  latestSpentOn,
  MAX_OCCURRENCES,
  NO_EXPENSE_FILTERS,
  normalizeExpense,
  occurrenceDates,
  parseExpenseFilters,
  recurringUntilProblem,
  templateOf,
} from "@/lib/expenses";
import { buildTable, convertMinor, convertMoney } from "@/lib/fx/convert";
import { resolveRateTable } from "@/lib/fx/overrides";
import { toMinorSigned } from "@/lib/money";
import { settingsSchema } from "@/lib/validation/settings";
import { addExpenseSchema, updateExpenseSchema } from "@/lib/validation/expenses";
import { EXPENSE_METHODS, PAYMENT_METHODS, type Expense } from "@/lib/types";

// 2026-10-27 12:00 in Manila (a Tuesday)
const NOW = new Date("2026-10-27T04:00:00Z");
const TODAY = "2026-10-27";

const expense = (id: string, over: Partial<Expense> = {}): Expense => ({
  id,
  description: `Expense ${id}`,
  amount: 10000,
  currency: "PHP",
  spentOn: TODAY,
  category: "software",
  method: "card",
  vendor: "",
  note: "",
  clientId: null,
  projectId: null,
  recurring: "none",
  recurringUntil: null,
  receiptPublicId: null,
  createdAt: new Date("2026-10-27T01:00:00Z"),
  updatedAt: new Date("2026-10-27T01:00:00Z"),
  ...over,
});

describe("expense validation", () => {
  const ok = {
    description: "Figma subscription",
    amount: "1500.50",
    currency: "PHP" as const,
    spentOn: TODAY,
    category: "software" as const,
  };

  it("accepts the fast path and fills defaults", () => {
    const r = addExpenseSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.amount).toBe(150050);
      expect(r.data).toMatchObject({ method: "other", vendor: "", note: "", clientId: null, projectId: null, recurring: "none", recurringUntil: null, receiptPublicId: null });
    }
  });
  it("requires a description", () => {
    expect(addExpenseSchema.safeParse({ ...ok, description: "   " }).success).toBe(false);
    expect(addExpenseSchema.safeParse({ ...ok, description: "x".repeat(161) }).success).toBe(false);
  });
  it("rejects a zero, negative or unreadable amount", () => {
    for (const amount of ["0", "0.00", "-5", "abc", ""]) expect(addExpenseSchema.safeParse({ ...ok, amount }).success, amount).toBe(false);
  });
  it("only allows GBP, USD and PHP and the nine categories", () => {
    expect(addExpenseSchema.safeParse({ ...ok, currency: "EUR" }).success).toBe(false);
    expect(addExpenseSchema.safeParse({ ...ok, category: "yachts" }).success).toBe(false);
    for (const category of ["software", "equipment", "subscriptions", "transport", "food", "taxes_fees", "marketing", "office", "other"]) {
      expect(addExpenseSchema.safeParse({ ...ok, category }).success, category).toBe(true);
    }
  });
  it("keeps every existing payment method valid and adds cash and card", () => {
    for (const method of PAYMENT_METHODS) expect(EXPENSE_METHODS).toContain(method);
    expect(EXPENSE_METHODS).toContain("cash");
    expect(EXPENSE_METHODS).toContain("card");
    for (const method of ["bank", "paypal", "wise", "gcash", "other", "cash", "card"]) {
      expect(addExpenseSchema.safeParse({ ...ok, method }).success, method).toBe(true);
    }
    expect(addExpenseSchema.safeParse({ ...ok, method: "cheque" }).success).toBe(false);
    // Payments keep their own list: cash is not a payment method.
    expect(PAYMENT_METHODS).not.toContain("cash");
  });
  it("accepts a date up to tomorrow in Manila and rejects later", () => {
    expect(addExpenseSchema.safeParse({ ...ok, spentOn: latestSpentOn(todayIso()) }).success).toBe(true);
    const far = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    expect(addExpenseSchema.safeParse({ ...ok, spentOn: far }).success).toBe(false);
    expect(addExpenseSchema.safeParse({ ...ok, spentOn: "2026-02-31" }).success).toBe(false);
    expect(addExpenseSchema.safeParse({ ...ok, spentOn: "27/10/2026" }).success).toBe(false);
  });
  it("checks the stop date and the text lengths", () => {
    expect(addExpenseSchema.safeParse({ ...ok, recurring: "monthly", recurringUntil: "2026-12-01" }).success).toBe(true);
    expect(addExpenseSchema.safeParse({ ...ok, recurring: "monthly", recurringUntil: "2026-10-01" }).success).toBe(false);
    expect(addExpenseSchema.safeParse({ ...ok, recurring: "fortnightly" }).success).toBe(false);
    expect(addExpenseSchema.safeParse({ ...ok, vendor: "x".repeat(121) }).success).toBe(false);
    expect(addExpenseSchema.safeParse({ ...ok, note: "x".repeat(501) }).success).toBe(false);
  });
  it("update needs an id", () => {
    expect(updateExpenseSchema.safeParse(ok).success).toBe(false);
    expect(updateExpenseSchema.safeParse({ ...ok, id: "e1" }).success).toBe(true);
  });
  it("recurringUntilProblem ignores a stop date when nothing repeats", () => {
    expect(recurringUntilProblem({ spentOn: "2026-10-10", recurring: "none", recurringUntil: "2020-01-01" })).toBeNull();
    expect(recurringUntilProblem({ spentOn: "2026-10-10", recurring: "weekly", recurringUntil: "2026-10-10" })).toBeNull();
    expect(recurringUntilProblem({ spentOn: "2026-10-10", recurring: "weekly", recurringUntil: "2026-10-09" })).not.toBeNull();
  });
});

describe("normalizeExpense", () => {
  it("turns missing or odd fields into safe values", () => {
    const e = normalizeExpense("x", { amount: 1500.4, currency: "EUR", category: "yachts", method: "cheque", recurring: "daily", recurringUntil: "bad" }, new Date(0), new Date(0));
    expect(e).toMatchObject({ amount: 1500, currency: "PHP", category: "other", method: "other", recurring: "none", recurringUntil: null, clientId: null, projectId: null, vendor: "" });
  });
  it("keeps good values and drops the stop date of a non-repeating expense", () => {
    const keep = normalizeExpense("x", { currency: "USD", category: "food", method: "cash", recurring: "weekly", recurringUntil: "2026-12-01", clientId: "c1" }, new Date(0), new Date(0));
    expect(keep).toMatchObject({ currency: "USD", category: "food", method: "cash", recurring: "weekly", recurringUntil: "2026-12-01", clientId: "c1" });
    expect(normalizeExpense("x", { recurring: "none", recurringUntil: "2026-12-01" }, new Date(0), new Date(0)).recurringUntil).toBeNull();
  });
});

describe("month arithmetic", () => {
  it("clamps to the end of a short month but always counts from the original day", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsClamped("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonthsClamped("2026-03-15", -3)).toBe("2025-12-15");
  });
});

describe("recurrence", () => {
  it("none: only its own date", () => {
    expect(occurrenceDates("2026-08-01", "none", null, TODAY)).toEqual(["2026-08-01"]);
  });
  it("weekly: every 7 days up to today", () => {
    expect(occurrenceDates("2026-10-06", "weekly", null, TODAY)).toEqual(["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"]);
    // Not yet due: the next one is 3 Nov.
    expect(occurrenceDates("2026-10-07", "weekly", null, TODAY)).toEqual(["2026-10-07", "2026-10-14", "2026-10-21"]);
  });
  it("monthly: started two months ago gives three occurrences", () => {
    expect(occurrenceDates("2026-08-27", "monthly", null, TODAY)).toEqual(["2026-08-27", "2026-09-27", "2026-10-27"]);
  });
  it("monthly: month end clamping from the original day, 31 Jan then 28 or 29 Feb", () => {
    expect(occurrenceDates("2026-01-31", "monthly", null, "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrenceDates("2024-01-31", "monthly", null, "2024-03-31")).toEqual(["2024-01-31", "2024-02-29", "2024-03-31"]);
  });
  it("yearly: 29 February lands on 28 Feb in common years and 29 Feb in leap years", () => {
    expect(occurrenceDates("2024-02-29", "yearly", null, "2028-03-01")).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });
  it("recurringUntil is inclusive and stops the repeat", () => {
    expect(occurrenceDates("2026-06-10", "monthly", "2026-08-10", TODAY)).toEqual(["2026-06-10", "2026-07-10", "2026-08-10"]);
    expect(occurrenceDates("2026-06-10", "monthly", "2026-08-09", TODAY)).toEqual(["2026-06-10", "2026-07-10"]);
    expect(occurrenceDates("2026-06-10", "monthly", "2026-06-10", TODAY)).toEqual(["2026-06-10"]);
  });
  it("a start in the future has only its own date, never derived repeats", () => {
    expect(occurrenceDates("2026-10-28", "monthly", null, TODAY)).toEqual(["2026-10-28"]);
    expect(occurrenceDates("2027-03-01", "weekly", null, TODAY)).toEqual(["2027-03-01"]);
  });
  it("is capped so a typo cannot build an endless list", () => {
    expect(occurrenceDates("1990-01-01", "weekly", null, TODAY)).toHaveLength(MAX_OCCURRENCES);
  });

  it("expenseLines flags derived repeats, keeps one stored line, and sorts newest first", () => {
    const lines = expenseLines(
      [expense("rent", { spentOn: "2026-08-27", recurring: "monthly", amount: 5000 }), expense("lunch", { spentOn: "2026-09-30", amount: 700 })],
      TODAY,
    );
    expect(lines.map((l) => [l.key, l.date, l.derived])).toEqual([
      ["rent@2026-10-27", "2026-10-27", true],
      ["lunch", "2026-09-30", false],
      ["rent@2026-09-27", "2026-09-27", true],
      ["rent", "2026-08-27", false],
    ]);
    expect(lines.filter((l) => l.expenseId === "rent")).toHaveLength(3);
    // A derived line points back at the stored expense and its first date.
    expect(templateOf(lines[0])).toMatchObject({ id: "rent", spentOn: "2026-08-27", recurring: "monthly" });
  });
});

describe("filters, totals and category breakdown", () => {
  const lines = expenseLines(
    [
      expense("a", { amount: 1000, currency: "PHP", category: "food", spentOn: "2026-10-05", description: "Team lunch", clientId: "c1" }),
      expense("b", { amount: 2000, currency: "USD", category: "software", spentOn: "2026-10-12", vendor: "Figma" }),
      expense("c", { amount: 3000, currency: "USD", category: "software", spentOn: "2026-09-12", note: "annual" }),
      expense("d", { amount: 500, currency: "GBP", category: "food", spentOn: "2026-09-02" }),
    ],
    TODAY,
  );
  it("filters by month, currency, category, client and text", () => {
    expect(filterExpenseLines(lines, NO_EXPENSE_FILTERS)).toHaveLength(4);
    expect(filterExpenseLines(lines, { ...NO_EXPENSE_FILTERS, month: "2026-10" })).toHaveLength(2);
    expect(filterExpenseLines(lines, { ...NO_EXPENSE_FILTERS, currency: "USD" })).toHaveLength(2);
    expect(filterExpenseLines(lines, { ...NO_EXPENSE_FILTERS, category: "food" })).toHaveLength(2);
    expect(filterExpenseLines(lines, { ...NO_EXPENSE_FILTERS, clientId: "c1" }).map((l) => l.expenseId)).toEqual(["a"]);
    expect(filterExpenseLines(lines, { ...NO_EXPENSE_FILTERS, q: "FIGMA" }).map((l) => l.expenseId)).toEqual(["b"]);
    expect(filterExpenseLines(lines, { ...NO_EXPENSE_FILTERS, q: "annual" }).map((l) => l.expenseId)).toEqual(["c"]);
    expect(filterExpenseLines(lines, { ...NO_EXPENSE_FILTERS, q: "nothing like this" })).toHaveLength(0);
  });
  it("lists the months that have spending, newest first", () => {
    expect(expenseMonths(lines)).toEqual(["2026-10", "2026-09"]);
  });
  it("reads filters from the URL and ignores anything unexpected", () => {
    expect(parseExpenseFilters({ month: "2026-10", currency: "USD", category: "food", client: "abc", q: "  hello " })).toEqual({
      month: "2026-10",
      currency: "USD",
      category: "food",
      clientId: "abc",
      q: "hello",
    });
    expect(parseExpenseFilters({ month: "October", currency: "EUR", category: "yachts" })).toEqual(NO_EXPENSE_FILTERS);
    expect(parseExpenseFilters({})).toEqual(NO_EXPENSE_FILTERS);
  });
  it("totals per currency without adding currencies together", () => {
    expect(expenseTotals(lines)).toEqual({ PHP: 1000, USD: 5000, GBP: 500 });
  });
  it("category totals: one group per currency, biggest first, shares add up", () => {
    const groups = categoryBreakdowns(lines);
    expect(groups.map((g) => g.currency)).toEqual(["GBP", "USD", "PHP"]);
    const usd = groups.find((g) => g.currency === "USD")!;
    expect(usd.total).toBe(5000);
    expect(usd.rows).toEqual([{ category: "software", amount: 5000, share: 1 }]);
    const php = categoryBreakdowns([...lines, ...expenseLines([expense("e", { amount: 3000, category: "office", spentOn: TODAY })], TODAY)]).find((g) => g.currency === "PHP")!;
    expect(php.rows.map((r) => r.category)).toEqual(["office", "food"]);
    expect(php.rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1);
  });
  it("category totals in PHP convert each bucket and add up exactly", () => {
    const rates = buildTable([{ currency: "USD", rate: 56.125, source: "stub", updatedAt: "2026-10-27T00:00:00Z" }]);
    const [php, ...rest] = categoryBreakdowns(lines, rates);
    expect(rest).toHaveLength(0);
    expect(php.currency).toBe("PHP");
    // GBP has no quote in this table, so it contributes nothing; USD software 5000 * 56.125, PHP food 1000.
    const software = php.rows.find((r) => r.category === "software")!;
    expect(software.amount).toBe(Math.round(Number((5000 * 56.125).toFixed(6))) - 0);
    expect(php.rows.reduce((s, r) => s + r.amount, 0)).toBe(php.total);
  });
  it("no spending means no groups", () => {
    expect(categoryBreakdowns([])).toEqual([]);
    expect(categoryBreakdowns([], buildTable([]))).toEqual([]);
  });
});

describe("available money", () => {
  const received: MoneyEvent[] = [
    { date: "2026-09-01", currency: "GBP", amount: 100000 },
    { date: "2026-10-10", currency: "GBP", amount: 50000 },
    { date: "2026-10-12", currency: "PHP", amount: 2000000 },
  ];
  const spent: MoneyEvent[] = [
    { date: "2026-09-15", currency: "GBP", amount: 20000 },
    { date: "2026-10-20", currency: "GBP", amount: 5000 },
    { date: "2026-10-21", currency: "PHP", amount: 2500000 },
  ];
  it("without an opening balance: received minus spent per currency", () => {
    const a = availableMoney(received, spent);
    expect(a.available).toEqual({ GBP: 125000, PHP: -500000 });
    expect(a.received).toEqual({ GBP: 150000, PHP: 2000000 });
    expect(a.spent).toEqual({ GBP: 25000, PHP: 2500000 });
    expect(a.currencies).toEqual(["GBP", "PHP"]);
  });
  it("shows negative results as negative numbers", () => {
    expect(availableMoney([], [{ date: TODAY, currency: "USD", amount: 4200 }]).available).toEqual({ USD: -4200 });
  });
  it("adds an opening balance, which may itself be negative, and shows currencies that only have one", () => {
    const a = availableMoney(received, spent, { balances: { GBP: 10000, USD: -3000 }, date: null });
    expect(a.available).toEqual({ GBP: 135000, USD: -3000, PHP: -500000 });
    expect(a.currencies).toEqual(["GBP", "USD", "PHP"]);
  });
  it("with an opening date, only events ON OR AFTER it count (the date itself counts)", () => {
    const a = availableMoney(received, spent, { balances: { GBP: 10000 }, date: "2026-10-10" });
    // Sep 1 received and Sep 15 spent are ignored; 10 Oct received (on the date) counts.
    expect(a.received.GBP).toBe(50000);
    expect(a.spent.GBP).toBe(5000);
    expect(a.available.GBP).toBe(10000 + 50000 - 5000);
    const day = availableMoney(received, spent, { balances: {}, date: "2026-10-11" });
    expect(day.received.GBP).toBe(0);
    expect(day.available).toEqual({ GBP: -5000, PHP: -500000 });
  });
  it("net helper and profit margin guard against dividing by zero", () => {
    expect(netOf({ GBP: 100, USD: 50 }, { GBP: 30, PHP: 5 })).toEqual({ GBP: 70, USD: 50, PHP: -5 });
    expect(profitMargin(0, 5000)).toBeNull();
    expect(profitMargin(0, 0)).toBeNull();
    expect(profitMargin(10000, 2500)).toBeCloseTo(0.75);
    expect(profitMargin(10000, 15000)).toBeCloseTo(-0.5);
    expect(formatMargin(null)).toBeNull();
    expect(formatMargin(0.754)).toBe("75%");
    expect(formatMargin(-0.5)).toBe("-50%");
    expect(formatMargin(0)).toBe("0%");
  });
  it("normalises the settings shape; old documents mean no opening balance", () => {
    expect(normalizeOpeningBalances(undefined)).toEqual({});
    expect(normalizeOpeningBalances({ GBP: 1000, USD: -250, PHP: "5", EUR: 1 })).toEqual({ GBP: 1000, USD: -250 });
    expect(normalizeOpeningBalances({ GBP: 1.5, USD: 1e15 })).toEqual({});
    expect(normalizeOpeningDate(undefined)).toBeNull();
    expect(normalizeOpeningDate("2026-02-31")).toBeNull();
    expect(normalizeOpeningDate("2026-10-01")).toBe("2026-10-01");
  });
  it("settings accept signed opening balances and a date, and reject nonsense", () => {
    const base = { acceptedRule: "signed" as const, defaultRevisionAllowance: 2, businessName: "M", businessEmail: "", agreementTemplate: "x".repeat(30), fxOverrides: {} };
    expect(settingsSchema.safeParse({ ...base, openingBalances: { GBP: -20000, PHP: null }, openingBalanceDate: "2026-10-01" }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, openingBalances: { GBP: 1.5 } }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, openingBalances: { GBP: Number.NaN } }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, openingBalanceDate: "yesterday" }).success).toBe(false);
  });
  it("parses signed amounts", () => {
    expect(toMinorSigned("-200")).toBe(-20000);
    expect(toMinorSigned("1,500.5")).toBe(150050);
    expect(toMinorSigned("-0")).toBe(0);
    expect(toMinorSigned("--1")).toBeNull();
    expect(toMinorSigned("abc")).toBeNull();
    expect(toMinorSigned("1.234")).toBeNull();
  });
});

describe("PHP conversion", () => {
  it("rounds negative amounts symmetrically with positive ones", () => {
    expect(convertMinor(-1000, 1.00005)).toBe(-convertMinor(1000, 1.00005));
    expect(convertMinor(5, 0.5)).toBe(3);
    expect(convertMinor(-5, 0.5)).toBe(-3);
    expect(convertMinor(-1234, 1)).toBe(-1234);
  });
  it("uses the rates you set in Settings over the live ones", async () => {
    const live = async () => buildTable([{ currency: "USD", rate: 50, source: "stub", updatedAt: "2026-10-27T00:00:00Z" }]);
    const table = (await resolveRateTable(["USD", "GBP"], { USD: 600000, GBP: 720000 }, live))!;
    expect(convertMoney({ USD: -10000, GBP: 5000, PHP: 700 }, table)).toBe(-10000 * 60 + 5000 * 72 + 700);
    const mixed = (await resolveRateTable(["USD", "GBP"], { GBP: 720000 }, async (c) => buildTable(c.map((currency) => ({ currency, rate: 50, source: "stub" as const, updatedAt: "2026-10-27T00:00:00Z" })))))!;
    expect(convertMoney({ USD: 100 }, mixed)).toBe(5000);
  });
});

describe("income vs expenses buckets and the dashboard money block", () => {
  const rates = buildTable([
    { currency: "USD", rate: 56, source: "stub", updatedAt: "2026-10-27T00:00:00Z" },
    { currency: "GBP", rate: 70, source: "stub", updatedAt: "2026-10-27T00:00:00Z" },
  ]);
  const received: MoneyEvent[] = [
    { date: "2026-10-27", currency: "USD", amount: 10000 }, // this week, this month
    { date: "2026-10-25", currency: "PHP", amount: 50000 }, // Sunday: last week (Manila weeks start Monday)
    { date: "2026-09-30", currency: "GBP", amount: 2000 }, // last month
  ];
  const expenses = [
    expense("e1", { amount: 4000, currency: "USD", spentOn: "2026-10-26", category: "software" }), // Monday: this week
    expense("e2", { amount: 1000, currency: "PHP", spentOn: "2026-10-25", category: "food" }), // Sunday: last week
    expense("e3", { amount: 500, currency: "GBP", spentOn: "2026-10-01", category: "office" }), // first of the month
    expense("e4", { amount: 250, currency: "GBP", spentOn: "2026-09-30", category: "office" }), // last of last month
  ];
  const flow = buildMoneyFlow({ received, expenses, rates, now: NOW });
  const rangeOf = (preset: "last-12-weeks" | "last-12-months", input = { received, expenses }) =>
    buildRangeData({ received: input.received, spent: spentEvents(input.expenses, TODAY), range: resolveRange({ preset }, TODAY), today: TODAY, rates });
  const weekly = rangeOf("last-12-weeks");
  const monthly = rangeOf("last-12-months");

  it("buckets weekly on Manila Mondays and monthly on Manila months", () => {
    const usd = weekly.flow.weekly.find((s) => s.currency === "USD")!;
    const thisWeek = usd.points.find((p) => p.key === "2026-10-26")!;
    expect(thisWeek).toMatchObject({ income: 10000, expense: 4000, net: 6000 });
    const php = weekly.flow.weekly.find((s) => s.currency === "PHP")!;
    expect(php.points.find((p) => p.key === "2026-10-19")).toMatchObject({ income: 50000, expense: 1000, net: 49000 });
    expect(php.points.find((p) => p.key === "2026-10-26")).toMatchObject({ income: 0, expense: 0 });
    const gbp = monthly.flow.monthly.find((s) => s.currency === "GBP")!;
    expect(gbp.points.find((p) => p.key === "2026-09")).toMatchObject({ income: 2000, expense: 250, net: 1750 });
    expect(gbp.points.find((p) => p.key === "2026-10")).toMatchObject({ income: 0, expense: 500, net: -500 });
    expect(gbp.points).toHaveLength(12);
    expect(usd.points).toHaveLength(12);
    expect(usd.totals).toEqual({ income: 10000, expense: 4000, net: 6000 });
  });
  it("this month and this year net, per currency", () => {
    expect(flow.month.net).toEqual({ USD: 6000, PHP: 49000, GBP: -500 });
    expect(flow.year.net).toEqual({ USD: 6000, PHP: 49000, GBP: 2000 - 750 });
    expect(flow.available.available).toEqual({ GBP: 2000 - 750, USD: 6000, PHP: 49000 });
  });
  it("a recurring expense adds its derived repeats to the totals", () => {
    const withRent = buildMoneyFlow({ received: [], expenses: [expense("rent", { amount: 20000, spentOn: "2026-08-27", recurring: "monthly" })], now: NOW });
    expect(withRent.available.spent).toEqual({ PHP: 60000 });
    expect(withRent.month.spent).toEqual({ PHP: 20000 });
    expect(withRent.year.spent).toEqual({ PHP: 60000 });
    expect(withRent.categoriesMonth[0].rows).toEqual([{ category: "software", amount: 20000, share: 1 }]);
    expect(withRent.categoriesYear[0].total).toBe(60000);
  });
  it("category totals: this month versus this year", () => {
    const usdMonth = flow.categoriesMonth.find((g) => g.currency === "USD")!;
    expect(usdMonth.rows.map((r) => r.category)).toEqual(["software"]);
    const gbpYear = flow.categoriesYear.find((g) => g.currency === "GBP")!;
    expect(gbpYear.total).toBe(750);
  });
  it("converts to one PHP series whose points add up, with each part rounded on its own", () => {
    const c = flow.converted!;
    const series = monthly.converted!.flow.monthly;
    expect(c.month).toMatchObject({ received: 10000 * 56 + 50000, spent: 4000 * 56 + 1000 + 500 * 70 });
    expect(c.month.net).toBe(c.month.received - c.month.spent);
    expect(series).toHaveLength(1);
    expect(series[0].currency).toBe("PHP");
    const sum = series[0].points.reduce((s, p) => s + p.net, 0);
    expect(sum).toBe(series[0].totals.net);
    expect(c.year.net).toBe(c.year.received - c.year.spent);
    expect(c.available.available).toBe(c.available.opening + c.available.received - c.available.spent);
    expect(c.categoriesMonth).toHaveLength(1);
    expect(c.categoriesMonth[0].total).toBe(c.month.spent);
  });
  it("converted net can be negative and uses the rates you set", async () => {
    const mine = (await resolveRateTable(["USD"], { USD: 600000 }, async () => null))!;
    const f = buildMoneyFlow({ received: [{ date: TODAY, currency: "USD", amount: 1000 }], expenses: [expense("big", { amount: 5000, currency: "USD" })], rates: mine, now: NOW });
    expect(f.converted!.month).toMatchObject({ received: 60000, spent: 300000, net: -240000 });
    expect(f.converted!.available.available).toBe(-240000);
    expect(f.converted!.month.margin).toBeCloseTo(-4);
  });
  it("opening balance and date flow through to available money and the PHP figure", () => {
    const f = buildMoneyFlow({
      received,
      expenses,
      opening: { balances: { PHP: 100000, USD: -1000 }, date: "2026-10-01" },
      rates,
      now: NOW,
    });
    // Before 1 Oct is ignored (the 30 Sep GBP income and expense).
    expect(f.available.available).toEqual({ GBP: -500, USD: -1000 + 10000 - 4000, PHP: 100000 + 50000 - 1000 });
    expect(f.converted!.available.opening).toBe(100000 + -1000 * 56);
    expect(f.converted!.available.available).toBe(f.converted!.available.opening + f.converted!.available.received - f.converted!.available.spent);
  });
  it("zero activity: no series, no groups, no margin, nothing divides by zero", () => {
    const empty = buildMoneyFlow({ received: [], expenses: [], rates, now: NOW });
    expect(empty.hasExpenses).toBe(false);
    const emptyRange = rangeOf("last-12-weeks", { received: [], expenses: [] });
    expect(emptyRange.flow.weekly).toEqual([]);
    expect(emptyRange.earnings.monthly).toEqual([]);
    expect(emptyRange.converted!.flow.weekly).toEqual([]);
    expect(emptyRange.earned).toEqual({});
    expect(empty.categoriesMonth).toEqual([]);
    expect(empty.currencies).toEqual([]);
    expect(empty.converted!.month.margin).toBeNull();
    expect(empty.converted!.available.available).toBe(0);
    const spendOnly = buildMoneyFlow({ received: [], expenses: [expense("x")], rates, now: NOW });
    expect(spendOnly.converted!.month.margin).toBeNull();
    expect(spendOnly.converted!.month.net).toBe(-10000);
  });
});

describe("expenses never change earnings, pending, overdue or any other dashboard figure", () => {
  const projects: DashProject[] = [
    { id: "p1", clientId: "c1", title: "Site", status: "active", currency: "GBP", contractValue: 100000, acceptedAt: new Date("2026-10-01T00:00:00Z"), archivedAt: null },
    { id: "r1", clientId: "c1", title: "Retainer", status: "active", currency: "USD", contractValue: 0, acceptedAt: new Date("2026-09-01T00:00:00Z"), archivedAt: null, kind: "retainer", rate: 5000, rateUnit: "month", startDate: "2026-09-01" },
  ];
  const input: DashboardInput = {
    projects,
    clients: [{ id: "c1", name: "Alice" }],
    prospects: [],
    payments: [{ projectId: "p1", amount: 30000, paidOn: "2026-10-05" }],
    standalonePayments: [{ amount: 7000, paidOn: "2026-10-20", currency: "PHP" }],
    schedule: [{ id: "s1", projectId: "p1", label: "Deposit", kind: "deposit", amountDue: 50000, dueDate: "2026-10-01", order: 0 }],
    revisions: [],
    rates: buildTable([
      { currency: "GBP", rate: 70, source: "stub", updatedAt: "2026-10-27T00:00:00Z" },
      { currency: "USD", rate: 56, source: "stub", updatedAt: "2026-10-27T00:00:00Z" },
    ]),
    now: NOW,
  };
  it("returns the same dashboard with or without expenses", () => {
    const plain = buildDashboard(input);
    const none = buildDashboardWithMoney(input);
    const heavy = buildDashboardWithMoney({
      ...input,
      expenses: [
        expense("a", { amount: 9_999_999, currency: "GBP", spentOn: "2026-10-26" }),
        expense("b", { amount: 123456, currency: "USD", spentOn: "2026-08-01", recurring: "weekly" }),
      ],
      opening: { balances: { GBP: -50000 }, date: "2026-10-01" },
    });
    const { money: noneMoney, range: noneRange, ...noneRest } = none;
    const { money: heavyMoney, range: heavyRange, ...heavyRest } = heavy;
    expect(noneRest).toEqual(plain);
    expect(heavyRest).toEqual(plain);
    // The date range block holds the same earnings with or without expenses (only its spending side differs).
    expect(heavyRange.earned).toEqual(noneRange.earned);
    expect(heavyRange.earnings).toEqual(noneRange.earnings);
    expect(heavyRange.converted?.earned).toBe(noneRange.converted?.earned);
    expect(heavyRange.converted?.earnings).toEqual(noneRange.converted?.earnings);
    expect(noneMoney.available.spent).toEqual({ GBP: 0, PHP: 0 });
    expect(heavyMoney.available.spent.GBP).toBe(9_999_999);
    // The headline earnings and balances the owner already relies on:
    expect(heavy.earnedThisMonth).toEqual({ GBP: 30000, PHP: 7000 });
    expect(heavy.pendingBalance).toEqual(plain.pendingBalance);
    expect(heavy.attention.overdue).toEqual(plain.attention.overdue);
    expect(heavy.acceptedThisMonth).toBe(plain.acceptedThisMonth);
    expect(heavy.recurringBilledThisMonth).toEqual(plain.recurringBilledThisMonth);
    expect(heavy.converted?.earnedThisMonth).toBe(plain.converted?.earnedThisMonth);
    expect(heavy.pipeline).toEqual(plain.pipeline);
  });
  it("received in the money block is exactly the earnings the dashboard shows", () => {
    const d = buildDashboardWithMoney({ ...input, expenses: [expense("a", { amount: 1000, currency: "GBP", spentOn: "2026-10-26" })] });
    expect(d.money.month.received).toEqual(d.earnedThisMonth);
    expect(d.money.year.received).toEqual(d.earnedThisYear);
    expect(d.money.converted!.month.received).toBe(d.converted!.earnedThisMonth);
    expect(d.money.converted!.year.received).toBe(d.converted!.earnedThisYear);
  });
  it("the default range (last 12 weeks) reproduces the weekly earnings the dashboard always showed", () => {
    const d = buildDashboardWithMoney(input);
    for (const old of d.weeklyEarningsSeries) {
      const mine = d.range.earnings.weekly.find((s) => s.currency === old.currency)!;
      expect(mine.points.map((p) => [p.key, p.amount])).toEqual(old.points.map((p) => [p.week, p.amount]));
      expect(mine.summary.total).toBe(old.summary.total);
    }
    // "Earned this month" keeps its fixed meaning whatever range is chosen.
    const other = buildDashboardWithMoney({ ...input, range: { preset: "last-year" } });
    expect(other.earnedThisMonth).toEqual(d.earnedThisMonth);
    expect(other.range.range).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
  });
});

describe("expenses CSV", () => {
  it("lists the stored expense and every derived repeat, flagged", async () => {
    const { expensesCsv } = await import("@/server/export");
    const data = {
      exportedAt: "2026-10-27T00:00:00.000Z",
      clients: [{ id: "c1", name: "Alice, Ltd" }],
      prospects: [],
      projects: [{ id: "p1", title: "Site", milestones: [], schedule: [], payments: [], agreements: [], revisions: [], timeEntries: [], tasks: [] }],
      standalonePayments: [],
      expenses: [
        { id: "rent", description: "=Coworking", amount: 500050, currency: "PHP", spentOn: "2026-08-27", category: "office", method: "cash", recurring: "monthly", clientId: "c1", projectId: "p1", receiptPublicId: "image:pmt/expenses/receipts/x.png", createdAt: "2026-08-27T01:00:00.000Z" },
        { id: "lunch", description: "Lunch", amount: 700, currency: "USD", spentOn: "2026-10-01", category: "food", method: "card", createdAt: "2026-10-01T01:00:00.000Z" },
      ],
      activity: [],
      settings: null,
    };
    const csv = expensesCsv(data as never, TODAY);
    const rows = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(rows[0]).toContain("expense_id,date,description,category");
    expect(rows).toHaveLength(1 + 4); // header, 3 coworking rows, 1 lunch
    const derived = rows.filter((r) => r.includes(",recurring_repeat,yes,"));
    expect(derived).toHaveLength(2);
    expect(rows.filter((r) => r.includes(",recurring_template,no,"))).toHaveLength(1);
    expect(rows.filter((r) => r.includes(",expense,no,"))).toHaveLength(1);
    // Spreadsheet formulas are defused, money is shown as decimals plus minor units, links are named.
    expect(csv).toContain("'=Coworking");
    expect(csv).toContain("5000.50,500050,PHP,cash");
    expect(csv).toContain('"Alice, Ltd"');
    expect(csv).toContain(",Site,");
  });
});
