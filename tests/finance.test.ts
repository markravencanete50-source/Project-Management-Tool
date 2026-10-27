import { describe, expect, it } from "vitest";
import { allocate, depositCovered, earningsByMonth, projectFinance } from "@/lib/finance";
import { formatMoney, fromMinor, toMinor } from "@/lib/money";
import { addDaysIso, isoDateSchema, lastNMonths, monthKeyOfInstant, todayIso } from "@/lib/dates";
import { countedRevisions, isBillableRound, nextRevisionRound, progress, weightsValid } from "@/lib/projects";
import type { ScheduleLine } from "@/lib/types";

const line = (id: string, kind: ScheduleLine["kind"], amountDue: number, dueDate: string, order = 0): ScheduleLine => ({
  id,
  label: id,
  kind,
  amountDue,
  dueDate,
  order,
});

describe("money", () => {
  it("parses decimals without float error", () => {
    expect(toMinor("1500")).toBe(150000);
    expect(toMinor("1,500.5")).toBe(150050);
    expect(toMinor("0.29")).toBe(29);
    expect(toMinor("19.99")).toBe(1999);
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });
  it("rejects invalid input", () => {
    for (const bad of ["", "-1", "1.234", "abc", "1.2.3"]) expect(toMinor(bad)).toBeNull();
  });
  it("round-trips and formats", () => {
    expect(fromMinor(150050)).toBe("1500.50");
    expect(fromMinor(-5)).toBe("-0.05");
    expect(formatMoney(150050, "GBP")).toBe("£1,500.50");
    expect(formatMoney(150050, "PHP")).toContain("1,500.50");
  });
});

describe("dates", () => {
  it("uses Manila for today and month buckets", () => {
    // 2026-03-31 17:00 UTC is 2026-04-01 01:00 in Manila.
    const instant = new Date("2026-03-31T17:00:00Z");
    expect(todayIso(instant)).toBe("2026-04-01");
    expect(monthKeyOfInstant(instant)).toBe("2026-04");
  });
  it("lists the last n months across a year boundary", () => {
    expect(lastNMonths(3, new Date("2026-02-10T00:00:00Z"))).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
  it("validates and adds days", () => {
    expect(isoDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(isoDateSchema.safeParse("2026-02-28").success).toBe(true);
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("finance", () => {
  const schedule = [line("final", "final", 1000, "2026-12-01"), line("deposit", "deposit", 500, "2026-10-01")];

  it("allocates oldest due date first", () => {
    const [deposit, final] = allocate(schedule, 700, "2026-10-27");
    expect(deposit).toMatchObject({ id: "deposit", covered: 500, state: "paid", overdue: false });
    expect(final).toMatchObject({ id: "final", covered: 200, outstanding: 800, state: "partly_paid", overdue: false });
  });

  it("flags overdue only when past due and not covered", () => {
    const lines = allocate(schedule, 200, "2026-10-27");
    expect(lines[0]).toMatchObject({ id: "deposit", state: "partly_paid", overdue: true, outstanding: 300 });
    expect(allocate(schedule, 200, "2026-10-01")[0].overdue).toBe(false);
  });

  it("handles partial payments across months and overpayment", () => {
    const f = projectFinance({
      contractValue: 1500,
      schedule,
      payments: [{ amount: 250 }, { amount: 250 }, { amount: 1100 }],
      today: "2026-12-05",
    });
    expect(f.paid).toBe(1600);
    expect(f.pending).toBe(-100);
    expect(f.overdueLines).toHaveLength(0);
    expect(f.scheduleMatches).toBe(true);
  });

  it("reports a schedule that does not match the contract value", () => {
    const f = projectFinance({ contractValue: 2000, schedule, payments: [], today: "2026-10-27" });
    expect(f.scheduleMatches).toBe(false);
    expect(f.overdueAmount).toBe(500);
  });

  it("treats no schedule as matching with nothing overdue", () => {
    const f = projectFinance({ contractValue: 2000, schedule: [], payments: [{ amount: 100 }], today: "2026-10-27" });
    expect(f).toMatchObject({ scheduleMatches: true, pending: 1900, overdueAmount: 0 });
  });

  it("detects a covered deposit", () => {
    expect(depositCovered(schedule, [{ amount: 499 }])).toBe(false);
    expect(depositCovered(schedule, [{ amount: 300 }, { amount: 200 }])).toBe(true);
    expect(depositCovered([], [])).toBe(false);
    expect(depositCovered([], [{ amount: 1 }])).toBe(true);
  });

  it("groups earnings by paidOn month per currency", () => {
    const m = earningsByMonth([
      { amount: 100, paidOn: "2026-03-31", currency: "GBP" },
      { amount: 50, paidOn: "2026-04-01", currency: "GBP" },
      { amount: 70, paidOn: "2026-04-15", currency: "PHP" },
    ]);
    expect(m.get("2026-03")).toEqual({ GBP: 100 });
    expect(m.get("2026-04")).toEqual({ GBP: 50, PHP: 70 });
  });
});

describe("projects", () => {
  it("computes progress from done weights", () => {
    expect(progress([])).toBe(0);
    expect(progress([{ weight: 30, done: true }, { weight: 70, done: false }])).toBe(30);
  });
  it("validates weights", () => {
    expect(weightsValid([])).toBe(true);
    expect(weightsValid([50, 50])).toBe(true);
    expect(weightsValid([50, 49])).toBe(false);
    expect(weightsValid([100, 0])).toBe(false);
  });
  it("counts revisions excluding cancelled", () => {
    const revs = [{ status: "approved" as const }, { status: "cancelled" as const }, { status: "requested" as const }];
    expect(countedRevisions(revs)).toBe(2);
    expect(nextRevisionRound(revs)).toBe(3);
    expect(isBillableRound(3, 2)).toBe(true);
    expect(isBillableRound(2, 2)).toBe(false);
  });
});
