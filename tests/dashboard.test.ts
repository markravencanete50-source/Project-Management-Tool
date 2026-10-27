import { describe, expect, it } from "vitest";
import {
  acceptedSeries,
  buildDashboard,
  earningsSeries,
  winRate,
  type DashboardInput,
  type DashProject,
  type DashProspect,
} from "@/components/dashboard/calc";
import { lastNMonths } from "@/lib/dates";
import { saveScheduleSchema } from "@/lib/validation/payments";

// 2026-10-27 12:00 in Manila
const NOW = new Date("2026-10-27T04:00:00Z");

const project = (id: string, over: Partial<DashProject> = {}): DashProject => ({
  id,
  clientId: "c1",
  title: `Project ${id}`,
  status: "active",
  currency: "GBP",
  contractValue: 100000,
  acceptedAt: null,
  archivedAt: null,
  ...over,
});

const prospect = (id: string, over: Partial<DashProspect> = {}): DashProspect => ({
  id,
  name: `Prospect ${id}`,
  company: "",
  stage: "new",
  estimatedValue: 50000,
  currency: "GBP",
  nextFollowUp: null,
  closedAt: null,
  archivedAt: null,
  ...over,
});

const base = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  projects: [],
  clients: [{ id: "c1", name: "Acme" }],
  prospects: [],
  payments: [],
  schedule: [],
  revisions: [],
  now: NOW,
  ...over,
});

describe("earningsSeries", () => {
  const months = lastNMonths(12, NOW);

  it("returns one series per currency that has data, with zero-filled months", () => {
    const series = earningsSeries(
      [
        { amount: 1000, paidOn: "2026-10-03", currency: "GBP" },
        { amount: 500, paidOn: "2026-08-20", currency: "GBP" },
        { amount: 7000, paidOn: "2026-10-05", currency: "PHP" },
      ],
      months,
    );
    expect(series.map((s) => s.currency)).toEqual(["GBP", "PHP"]);
    const gbp = series[0].points;
    expect(gbp).toHaveLength(12);
    expect(gbp.at(-1)).toMatchObject({ month: "2026-10", amount: 1000 });
    expect(gbp.find((p) => p.month === "2026-09")?.amount).toBe(0);
  });

  it("omits currencies whose only payments fall outside the window", () => {
    const series = earningsSeries([{ amount: 900, paidOn: "2024-01-10", currency: "USD" }], months);
    expect(series).toEqual([]);
  });
});

describe("acceptedSeries", () => {
  it("buckets by Manila month, so a late UTC instant lands in the next month", () => {
    const months = lastNMonths(3, NOW);
    const points = acceptedSeries(
      [new Date("2026-09-30T17:00:00Z"), new Date("2026-10-10T00:00:00Z"), new Date("2026-10-11T00:00:00Z")],
      months,
    );
    expect(points.map((p) => p.count)).toEqual([0, 0, 3]);
  });
});

describe("winRate", () => {
  it("is won / (won + lost) within 90 days, null when nothing closed", () => {
    expect(winRate([], NOW).rate).toBeNull();
    const result = winRate(
      [
        { stage: "won", closedAt: new Date("2026-10-01T00:00:00Z") },
        { stage: "won", closedAt: new Date("2026-09-01T00:00:00Z") },
        { stage: "lost", closedAt: new Date("2026-08-15T00:00:00Z") },
        { stage: "lost", closedAt: new Date("2026-03-01T00:00:00Z") },
        { stage: "new", closedAt: null },
      ],
      NOW,
    );
    expect(result).toEqual({ won: 2, lost: 1, rate: 2 / 3 });
  });
});

describe("buildDashboard", () => {
  it("computes earnings per currency from each payment's project currency", () => {
    const data = buildDashboard(
      base({
        projects: [project("a"), project("b", { currency: "PHP" })],
        payments: [
          { projectId: "a", amount: 10000, paidOn: "2026-10-02" },
          { projectId: "a", amount: 2000, paidOn: "2026-02-02" },
          { projectId: "b", amount: 500000, paidOn: "2026-10-09" },
          { projectId: "a", amount: 7777, paidOn: "2025-12-31" },
          { projectId: "gone", amount: 999, paidOn: "2026-10-09" },
        ],
      }),
    );
    expect(data.earnedThisMonth).toEqual({ GBP: 10000, PHP: 500000 });
    expect(data.earnedThisYear).toEqual({ GBP: 12000, PHP: 500000 });
  });

  it("keeps archived projects in earnings and accepted counts but not in active counts", () => {
    const data = buildDashboard(
      base({
        projects: [
          project("a", { acceptedAt: new Date("2026-10-05T00:00:00Z") }),
          project("b", { archivedAt: new Date("2026-10-06T00:00:00Z"), acceptedAt: new Date("2026-05-05T00:00:00Z") }),
          project("c", { status: "on_hold" }),
        ],
        payments: [{ projectId: "b", amount: 4000, paidOn: "2026-10-01" }],
      }),
    );
    expect(data.activeProjects).toBe(1);
    expect(data.acceptedThisMonth).toBe(1);
    expect(data.acceptedAllTime).toBe(2);
    expect(data.earnedThisMonth).toEqual({ GBP: 4000 });
  });

  it("sums only positive pending balances of active and on-hold projects, per currency", () => {
    const data = buildDashboard(
      base({
        projects: [
          project("a", { contractValue: 100000 }),
          project("b", { contractValue: 20000, status: "on_hold", currency: "USD" }),
          project("c", { contractValue: 10000 }), // overpaid, ignored
          project("d", { contractValue: 99999, status: "completed" }),
          project("e", { contractValue: 99999, archivedAt: new Date() }),
        ],
        payments: [
          { projectId: "a", amount: 30000, paidOn: "2026-10-01" },
          { projectId: "c", amount: 15000, paidOn: "2026-10-01" },
        ],
      }),
    );
    expect(data.pendingBalance).toEqual({ GBP: 70000, USD: 20000 });
  });

  it("totals the pipeline from open, unarchived prospects only", () => {
    const data = buildDashboard(
      base({
        prospects: [
          prospect("1", { estimatedValue: 100 }),
          prospect("2", { estimatedValue: 200, stage: "negotiating" }),
          prospect("3", { estimatedValue: 400, stage: "won" }),
          prospect("4", { estimatedValue: 800, stage: "lost" }),
          prospect("5", { estimatedValue: 1600, archivedAt: new Date() }),
          prospect("6", { estimatedValue: 5000, currency: "PHP" }),
        ],
      }),
    );
    expect(data.pipelineValue).toEqual({ GBP: 300, PHP: 5000 });
  });

  it("lists overdue lines, follow-ups due and revisions waiting on the admin", () => {
    const data = buildDashboard(
      base({
        projects: [
          project("a", { contractValue: 100000 }),
          project("d", { status: "draft", contractValue: 100000 }),
          project("x", { archivedAt: new Date(), contractValue: 100000 }),
        ],
        schedule: [
          { id: "s1", projectId: "a", label: "Deposit", kind: "deposit", amountDue: 40000, dueDate: "2026-10-01", order: 0 },
          { id: "s2", projectId: "a", label: "Final", kind: "final", amountDue: 60000, dueDate: "2026-12-01", order: 1 },
          { id: "s3", projectId: "d", label: "Deposit", kind: "deposit", amountDue: 40000, dueDate: "2026-10-01", order: 0 },
          { id: "s4", projectId: "x", label: "Deposit", kind: "deposit", amountDue: 40000, dueDate: "2026-10-01", order: 0 },
        ],
        payments: [{ projectId: "a", amount: 15000, paidOn: "2026-10-02" }],
        prospects: [
          prospect("due", { nextFollowUp: "2026-10-27" }),
          prospect("late", { nextFollowUp: "2026-10-20" }),
          prospect("future", { nextFollowUp: "2026-10-28" }),
          prospect("won", { nextFollowUp: "2026-10-01", stage: "won" }),
        ],
        revisions: [
          { id: "r1", projectId: "a", round: 1, status: "requested" },
          { id: "r2", projectId: "a", round: 2, status: "awaiting_quote" },
          { id: "r3", projectId: "a", round: 3, status: "awaiting_approval" },
          { id: "r4", projectId: "x", round: 1, status: "requested" },
        ],
      }),
    );
    expect(data.attention.overdue).toHaveLength(1);
    expect(data.attention.overdue[0]).toMatchObject({ lineId: "s1", outstanding: 25000, clientName: "Acme", currency: "GBP" });
    expect(data.attention.followUps.map((f) => f.prospectId)).toEqual(["late", "due"]);
    expect(data.attention.revisions.map((r) => r.revisionId)).toEqual(["r1", "r2"]);
  });
});

describe("saveScheduleSchema", () => {
  const line = (amount: string) => ({ id: null, label: "Payment", kind: "milestone" as const, amount, dueDate: "2026-11-01" });

  it("accepts a schedule that sums exactly to the contract value", () => {
    const parsed = saveScheduleSchema.parse({ projectId: "p", contractValue: "1000.00", lines: [line("400"), line("600.00")] });
    expect(parsed.contractValue).toBe(100000);
    expect(parsed.lines.map((l) => l.amount)).toEqual([40000, 60000]);
  });

  it("rejects a schedule that does not add up", () => {
    const result = saveScheduleSchema.safeParse({ projectId: "p", contractValue: "1000", lines: [line("400"), line("599.99")] });
    expect(result.success).toBe(false);
  });

  it("allows an empty schedule and rejects zero-amount lines", () => {
    expect(saveScheduleSchema.safeParse({ projectId: "p", contractValue: "1000", lines: [] }).success).toBe(true);
    expect(saveScheduleSchema.safeParse({ projectId: "p", contractValue: "0", lines: [line("0")] }).success).toBe(false);
  });
});
