import { describe, expect, it } from "vitest";
import {
  buildDashboard,
  convertPipeline,
  expectedMonthlyTotal,
  mergeEarnings,
  pipelineBreakdown,
  topProspects,
  type DashboardInput,
  type DashProject,
  type DashProspect,
} from "@/components/dashboard/calc";
import { buildTable } from "@/lib/fx/convert";
import { expectedMonthly, rateWithMonthly } from "@/lib/engagement";
import { CLOSED_PROSPECT_STAGES, isOpenStage, normalizeStage, PROSPECT_STAGES } from "@/lib/types";
import { STAGE_DOT, STAGE_LABELS, STAGE_VARIANT, isFollowUpDue, retainerRateLine } from "@/components/prospects/labels";
import {
  filterLedger,
  latestPaidOn,
  ledgerMonths,
  ledgerTotals,
  normalizeStandalone,
  parseFilters,
  payerProblem,
  sortLedger,
  NO_FILTERS,
  type LedgerRow,
} from "@/lib/standalone-payments";
import { addStandaloneSchema } from "@/lib/validation/standalone-payments";
import { todayIso } from "@/lib/dates";

const NOW = new Date("2026-10-27T04:00:00Z"); // 12:00 Manila

const retainer = (id: string, over: Partial<DashProject> = {}): DashProject => ({
  id,
  clientId: "c1",
  title: `Retainer ${id}`,
  status: "active",
  currency: "USD",
  contractValue: 0,
  acceptedAt: new Date("2026-10-01T00:00:00Z"),
  archivedAt: null,
  kind: "retainer",
  rate: 2500, // $25.00
  rateUnit: "hour",
  hoursPerDay: 800,
  daysPerMonth: 2200,
  ...over,
});

const prospect = (id: string, over: Partial<DashProspect> = {}): DashProspect => ({
  id,
  name: `Prospect ${id}`,
  company: "",
  stage: "new",
  estimatedValue: 100000,
  currency: "USD",
  nextFollowUp: null,
  closedAt: null,
  archivedAt: null,
  engagementKind: "fixed",
  ...over,
});

const rates = buildTable([
  { currency: "USD", rate: 56, source: "stub", updatedAt: NOW.toISOString() },
  { currency: "GBP", rate: 70, source: "stub", updatedAt: NOW.toISOString() },
]);

const input = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  projects: [],
  clients: [{ id: "c1", name: "Acme" }],
  prospects: [],
  payments: [],
  schedule: [],
  revisions: [],
  now: NOW,
  ...over,
});

describe("retainer rate with monthly figure", () => {
  it("works the monthly amount out from the schedule", () => {
    expect(rateWithMonthly("hour", 25000, 800, 2200)).toEqual({ perUnit: 25000, unit: "hour", monthly: 4_400_000 });
    expect(rateWithMonthly("day", 20000, 800, 2200).monthly).toBe(expectedMonthly("day", 20000, 800, 2200));
    expect(rateWithMonthly("week", 120000, 800, 2200).monthly).toBe(Math.round((120000 * 52) / 12));
  });
  it("shows a per-month rate once and ignores a zero rate", () => {
    expect(rateWithMonthly("month", 500000).monthly).toBeNull();
    expect(rateWithMonthly("hour", 0).monthly).toBeNull();
  });
  it("uses the default schedule when none is given", () => {
    expect(rateWithMonthly("hour", 1000).monthly).toBe(1000 * 8 * 22);
  });
  it("words a retainer prospect line", () => {
    const base = { engagementKind: "retainer" as const, rateUnit: "hour" as const, rate: 4000, currency: "USD" as const, hoursPerDay: 800, daysPerMonth: 2200 };
    expect(retainerRateLine(base)).toBe("$40.00 / hour, about $7,040.00 / month");
    expect(retainerRateLine({ ...base, rateUnit: "month" })).toBe("$40.00 / month");
    expect(retainerRateLine({ ...base, engagementKind: "fixed" })).toBeNull();
    expect(retainerRateLine({ ...base, rate: 0 })).toBeNull();
  });
});

describe("expected this month", () => {
  it("sums active retainers per currency and excludes on hold, completed, archived and other kinds", () => {
    const total = expectedMonthlyTotal([
      retainer("a"), // 25 * 8 * 22 = 4400.00
      retainer("b", { rateUnit: "month", rate: 100000 }), // 1000.00
      retainer("c", { status: "on_hold" }),
      retainer("d", { status: "completed" }),
      retainer("e", { archivedAt: new Date() }),
      retainer("f", { currency: "GBP", rateUnit: "day", rate: 20000, daysPerMonth: 2000 }), // 200 * 20
      { ...retainer("g"), kind: "fixed" },
    ]);
    expect(total).toEqual({ USD: 440000 + 100000, GBP: 400000 });
  });
  it("is carried into the dashboard and converted to PHP", () => {
    const data = buildDashboard(input({ rates, projects: [retainer("a")] }));
    expect(data.expectedThisMonth).toEqual({ USD: 440000 });
    expect(data.converted?.expectedThisMonth).toBe(440000 * 56);
  });
  it("is empty with no active retainers", () => {
    expect(expectedMonthlyTotal([])).toEqual({});
  });
});

describe("pipeline breakdown", () => {
  it("splits one-off, monthly and first year for open prospects only, per currency", () => {
    const b = pipelineBreakdown([
      prospect("1", { estimatedValue: 100000 }),
      prospect("2", { engagementKind: "tasks", estimatedValue: 20000 }),
      prospect("3", { engagementKind: "retainer", estimatedValue: 300000 }),
      prospect("4", { engagementKind: "retainer", currency: "GBP", estimatedValue: 50000 }),
      prospect("5", { stage: "won", estimatedValue: 999999 }),
      prospect("6", { stage: "lost", estimatedValue: 999999 }),
      prospect("7", { archivedAt: new Date(), estimatedValue: 999999 }),
      prospect("8", { stage: "waiting_for_client", estimatedValue: 10000 }),
    ]);
    expect(b.oneOff).toEqual({ USD: 130000 });
    expect(b.monthly).toEqual({ USD: 300000, GBP: 50000 });
    expect(b.firstYear).toEqual({ USD: 130000 + 3_600_000, GBP: 600000 });
    expect(b.counts).toEqual({ fixed: 2, retainer: 2, tasks: 1, total: 5 });
  });
  it("handles only retainers and nothing open", () => {
    const only = pipelineBreakdown([prospect("1", { engagementKind: "retainer", estimatedValue: 1000 })]);
    expect(only.oneOff).toEqual({});
    expect(only.firstYear).toEqual({ USD: 12000 });
    const none = pipelineBreakdown([prospect("1", { stage: "won" })]);
    expect(none).toEqual({ oneOff: {}, monthly: {}, firstYear: {}, counts: { fixed: 0, retainer: 0, tasks: 0, total: 0 } });
  });
  it("treats a missing kind as fixed and counts a valueless prospect", () => {
    const p = prospect("1", { estimatedValue: 0 });
    delete (p as { engagementKind?: string }).engagementKind;
    const b = pipelineBreakdown([p]);
    expect(b.counts.fixed).toBe(1);
    expect(b.oneOff).toEqual({});
  });
  it("converts the pieces so the parts add up to the total exactly", () => {
    const b = pipelineBreakdown([
      prospect("1", { estimatedValue: 33333 }),
      prospect("2", { currency: "GBP", estimatedValue: 12345 }),
      prospect("3", { engagementKind: "retainer", estimatedValue: 77777 }),
      prospect("4", { engagementKind: "retainer", currency: "GBP", estimatedValue: 5555 }),
    ]);
    const php = convertPipeline(b, rates);
    expect(php.oneOff).toBe(Math.round(33333 * 56) + Math.round(12345 * 70));
    expect(php.monthly).toBe(Math.round(77777 * 56) + Math.round(5555 * 70));
    expect(php.firstYear).toBe(php.oneOff + php.monthly * 12);
  });
  it("is part of the dashboard in both views, with win rate untouched by the open stage", () => {
    const data = buildDashboard(
      input({
        rates,
        prospects: [
          prospect("1", { stage: "waiting_for_client", estimatedValue: 100000 }),
          prospect("2", { engagementKind: "retainer", estimatedValue: 10000 }),
          prospect("3", { stage: "won", closedAt: new Date("2026-10-20T00:00:00Z") }),
        ],
      }),
    );
    expect(data.pipeline.oneOff).toEqual({ USD: 100000 });
    expect(data.converted?.pipeline).toEqual({ oneOff: 100000 * 56, monthly: 10000 * 56, firstYear: 100000 * 56 + 10000 * 56 * 12 });
    expect(data.winRate).toEqual({ won: 1, lost: 0, rate: 1 });
  });
});

describe("top open prospects", () => {
  const list = [
    prospect("a", { name: "A", estimatedValue: 100000 }),
    prospect("b", { name: "B", engagementKind: "retainer", estimatedValue: 20000 }), // 240000 a year
    prospect("c", { name: "C", currency: "GBP", estimatedValue: 5000 }), // 350000 PHP
    prospect("d", { name: "D", stage: "won", estimatedValue: 9_000_000 }),
    prospect("e", { name: "E", estimatedValue: 0 }),
    prospect("f", { name: "F", estimatedValue: 1 }),
    prospect("g", { name: "G", estimatedValue: 2 }),
    prospect("h", { name: "H", estimatedValue: 3 }),
    prospect("i", { name: "I", estimatedValue: 4 }),
  ];
  it("ranks by potential in PHP, drops closed and valueless, and keeps 5", () => {
    const top = topProspects(list, rates);
    expect(top.map((t) => t.name)).toEqual(["B", "A", "C", "I", "H"]);
    expect(top[0]).toMatchObject({ kind: "retainer", monthly: true, amount: 20000 });
    expect(top[2]).toMatchObject({ monthly: false, currency: "GBP" });
  });
  it("is empty when nothing is open", () => {
    expect(topProspects([prospect("d", { stage: "lost" })], rates)).toEqual([]);
  });
  it("ranks on face value without rates", () => {
    expect(topProspects(list, null, 2).map((t) => t.name)).toEqual(["B", "A"]);
  });
});

describe("prospect stages", () => {
  it("has waiting_for_client between proposal_sent and negotiating", () => {
    expect([...PROSPECT_STAGES]).toEqual(["new", "contacted", "proposal_sent", "waiting_for_client", "negotiating", "won", "lost"]);
    expect(STAGE_LABELS.waiting_for_client).toBe("Waiting for client");
  });
  it("classifies open and closed stages", () => {
    expect(CLOSED_PROSPECT_STAGES).toEqual(["won", "lost"]);
    for (const s of PROSPECT_STAGES) expect(isOpenStage(s)).toBe(s !== "won" && s !== "lost");
    expect(isOpenStage("bogus")).toBe(false);
    expect(isOpenStage(undefined)).toBe(false);
  });
  it("normalises unknown or missing stages to new", () => {
    expect(normalizeStage("waiting_for_client")).toBe("waiting_for_client");
    expect(normalizeStage("archived-old")).toBe("new");
    expect(normalizeStage(undefined)).toBe("new");
    expect(normalizeStage(7)).toBe("new");
  });
  it("has a label, variant and dot for every stage (colour is never the only signal: badges carry a dot and a name)", () => {
    for (const s of PROSPECT_STAGES) {
      expect(STAGE_LABELS[s]).toBeTruthy();
      expect(STAGE_VARIANT[s]).toBeTruthy();
      expect(STAGE_DOT[s]).toBeTruthy();
    }
    expect(new Set(PROSPECT_STAGES.map((s) => STAGE_VARIANT[s])).size).toBeGreaterThanOrEqual(6);
  });
  it("is open for follow ups and the pipeline but not the win rate", () => {
    expect(isFollowUpDue({ nextFollowUp: "2026-10-01", stage: "waiting_for_client" }, "2026-10-27")).toBe(true);
    const data = buildDashboard(input({ prospects: [prospect("1", { stage: "waiting_for_client", nextFollowUp: "2026-10-01" })] }));
    expect(data.winRate).toEqual({ won: 0, lost: 0, rate: null });
    expect(data.attention.followUps).toHaveLength(1);
    expect(data.pipelineValue).toEqual({ USD: 100000 });
  });
});

// -------------------------------------------------- payment-only entries

const row = (id: string, over: Partial<LedgerRow> = {}): LedgerRow => ({
  id,
  source: "standalone",
  projectId: null,
  projectTitle: null,
  clientId: null,
  who: "Someone",
  currency: "PHP",
  amount: 1000,
  paidOn: "2026-10-10",
  method: "bank",
  note: "",
  receiptPublicId: null,
  createdAt: new Date("2026-10-10T00:00:00Z"),
  ...over,
});

describe("payment-only validation", () => {
  const ok = { clientId: null, payerName: "Maria", currency: "PHP", amount: "1500.50", paidOn: todayIso(), method: "gcash" } as const;
  it("accepts a valid entry and converts the amount to minor units", () => {
    const r = addStandaloneSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(150050);
  });
  it("needs a payer name when there is no client, but not when a client is set", () => {
    expect(addStandaloneSchema.safeParse({ ...ok, payerName: "  " }).success).toBe(false);
    expect(addStandaloneSchema.safeParse({ ...ok, clientId: "c1", payerName: "" }).success).toBe(true);
    expect(payerProblem({ clientId: null, payerName: "" })).toMatch(/who paid/i);
    expect(payerProblem({ clientId: "c1", payerName: "" })).toBeNull();
  });
  it("rejects zero, negative and junk amounts and unknown currencies", () => {
    for (const amount of ["0", "-5", "abc", ""]) expect(addStandaloneSchema.safeParse({ ...ok, amount }).success, amount).toBe(false);
    expect(addStandaloneSchema.safeParse({ ...ok, currency: "EUR" }).success).toBe(false);
  });
  it("rejects bad and future dates but allows tomorrow", () => {
    expect(addStandaloneSchema.safeParse({ ...ok, paidOn: "2026-02-31" }).success).toBe(false);
    expect(addStandaloneSchema.safeParse({ ...ok, paidOn: "27/10/2026" }).success).toBe(false);
    expect(addStandaloneSchema.safeParse({ ...ok, paidOn: latestPaidOn(todayIso()) }).success).toBe(true);
    const far = latestPaidOn(latestPaidOn(todayIso()));
    expect(addStandaloneSchema.safeParse({ ...ok, paidOn: far }).success).toBe(false);
  });
  it("limits the name and the note", () => {
    expect(addStandaloneSchema.safeParse({ ...ok, payerName: "x".repeat(121) }).success).toBe(false);
    expect(addStandaloneSchema.safeParse({ ...ok, note: "x".repeat(501) }).success).toBe(false);
  });
});

describe("normalising stored payment-only documents", () => {
  it("repairs missing or odd fields", () => {
    const p = normalizeStandalone("x", { amount: 1500.4, currency: "EUR", method: "cash" }, new Date(0), new Date(0));
    expect(p).toMatchObject({ id: "x", clientId: null, payerName: "", note: "", currency: "PHP", amount: 1500, method: "other", receiptPublicId: null });
  });
});

describe("ledger filters and totals", () => {
  const rows = [
    row("1", { paidOn: "2026-10-12", currency: "USD", amount: 5000, clientId: "c1" }),
    row("2", { paidOn: "2026-09-30", source: "project", projectId: "p1", projectTitle: "Site", clientId: "c1", currency: "GBP", amount: 7000 }),
    row("3", { paidOn: "2026-10-01", amount: 300 }),
    row("4", { paidOn: "2026-10-12", currency: "USD", amount: 100, createdAt: new Date("2026-10-13T00:00:00Z") }),
  ];
  it("sorts newest first, ties by recorded time", () => {
    expect(sortLedger(rows).map((r) => r.id)).toEqual(["4", "1", "3", "2"]);
  });
  it("filters by month, currency, client and source", () => {
    expect(filterLedger(rows, { ...NO_FILTERS, month: "2026-10" }).map((r) => r.id)).toEqual(["1", "3", "4"]);
    expect(filterLedger(rows, { ...NO_FILTERS, currency: "USD" }).map((r) => r.id)).toEqual(["1", "4"]);
    expect(filterLedger(rows, { ...NO_FILTERS, clientId: "c1" }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterLedger(rows, { ...NO_FILTERS, source: "project" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterLedger(rows, { ...NO_FILTERS, source: "standalone" })).toHaveLength(3);
    expect(filterLedger(rows, NO_FILTERS)).toHaveLength(4);
  });
  it("totals per currency and lists months newest first", () => {
    expect(ledgerTotals(rows)).toEqual({ USD: 5100, GBP: 7000, PHP: 300 });
    expect(ledgerMonths(rows)).toEqual(["2026-10", "2026-09"]);
  });
  it("reads filters from the URL and ignores junk", () => {
    expect(parseFilters({ month: "2026-10", currency: "USD", source: "standalone", client: "abc" })).toEqual({
      month: "2026-10",
      currency: "USD",
      clientId: "abc",
      source: "standalone",
    });
    expect(parseFilters({ month: "nope", currency: "EUR", source: "x" })).toEqual(NO_FILTERS);
  });
});

describe("payment-only entries in the dashboard", () => {
  const standalonePayments = [
    { amount: 10000, paidOn: "2026-10-27", currency: "USD" as const }, // this month, this week
    { amount: 5000, paidOn: "2026-10-25", currency: "PHP" as const }, // Sunday: still last week (Manila Monday start)
    { amount: 2000, paidOn: "2026-09-30", currency: "GBP" as const }, // last month
  ];
  it("merges with project payments, tagged by currency", () => {
    const merged = mergeEarnings(
      [{ projectId: "p1", amount: 700, paidOn: "2026-10-02" }, { projectId: "gone", amount: 1, paidOn: "2026-10-02" }],
      new Map([["p1", { currency: "GBP" as const }]]),
      standalonePayments,
    );
    expect(merged).toHaveLength(4);
    expect(merged[0]).toEqual({ amount: 700, paidOn: "2026-10-02", currency: "GBP" });
  });
  it("counts as earnings in month, year, series and weekly buckets", () => {
    const data = buildDashboard(
      input({
        projects: [{ id: "p1", clientId: "c1", title: "Site", status: "active", currency: "GBP", contractValue: 100000, acceptedAt: null, archivedAt: null }],
        payments: [{ projectId: "p1", amount: 700, paidOn: "2026-10-02" }],
        standalonePayments,
      }),
    );
    expect(data.earnedThisMonth).toEqual({ GBP: 700, USD: 10000, PHP: 5000 });
    expect(data.earnedThisYear).toEqual({ GBP: 2700, USD: 10000, PHP: 5000 });
    const usd = data.earningsSeries.find((s) => s.currency === "USD")!;
    expect(usd.points.at(-1)?.amount).toBe(10000);
    const gbp = data.earningsSeries.find((s) => s.currency === "GBP")!;
    expect(gbp.points.find((p) => p.month === "2026-09")?.amount).toBe(2000);
    // Sunday 25 Oct belongs to the week starting Monday 19 Oct, Tuesday 27 Oct to the week of 26 Oct.
    const php = data.weeklyEarningsSeries.find((s) => s.currency === "PHP")!;
    expect(php.points.find((p) => p.week === "2026-10-19")?.amount).toBe(5000);
    const usdWeek = data.weeklyEarningsSeries.find((s) => s.currency === "USD")!;
    expect(usdWeek.points.find((p) => p.week === "2026-10-26")?.amount).toBe(10000);
  });
  it("converts to PHP with the same rates", () => {
    const data = buildDashboard(input({ rates, standalonePayments }));
    expect(data.converted?.earnedThisMonth).toBe(10000 * 56 + 5000);
    expect(data.converted?.earnedThisYear).toBe(10000 * 56 + 5000 + 2000 * 70);
  });
  it("never changes pending balance, overdue, accepted counts, recurring or active projects", () => {
    const projects: DashProject[] = [
      { id: "p1", clientId: "c1", title: "Site", status: "active", currency: "GBP", contractValue: 100000, acceptedAt: new Date("2026-10-01T00:00:00Z"), archivedAt: null },
    ];
    const schedule = [{ id: "s1", projectId: "p1", label: "Deposit", kind: "deposit" as const, amountDue: 50000, dueDate: "2026-10-01", order: 0 }];
    const without = buildDashboard(input({ projects, schedule }));
    const withStandalone = buildDashboard(input({ projects, schedule, standalonePayments: [{ amount: 999999, paidOn: "2026-10-26", currency: "GBP" }] }));
    expect(withStandalone.pendingBalance).toEqual(without.pendingBalance);
    expect(withStandalone.attention.overdue).toEqual(without.attention.overdue);
    expect(withStandalone.acceptedThisMonth).toBe(without.acceptedThisMonth);
    expect(withStandalone.acceptedAllTime).toBe(without.acceptedAllTime);
    expect(withStandalone.activeProjects).toBe(without.activeProjects);
    expect(withStandalone.recurringBilledThisMonth).toEqual(without.recurringBilledThisMonth);
    expect(withStandalone.earnedThisMonth).toEqual({ GBP: 999999 });
    expect(without.earnedThisMonth).toEqual({});
  });
});
