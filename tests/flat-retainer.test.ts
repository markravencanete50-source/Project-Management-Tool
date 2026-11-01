import { describe, expect, it } from "vitest";
import { billsFinance } from "@/lib/finance";
import {
  derivedBillLines,
  endDateForStatus,
  flatBillLines,
  periodsBetween,
  weekStartOf,
} from "@/lib/billing";
import {
  defaultEntryQuantity,
  equivalentRates,
  expectedFromInputs,
  expectedMonthly,
  expectedQuantity,
  meterState,
  newProjectFields,
  normalizeProspectEngagement,
  prospectProjectInput,
} from "@/lib/engagement";
import { buildDashboard, type DashboardInput } from "@/components/dashboard/calc";
import { projectCreateSchema, retainerUpdateSchema } from "@/lib/validation/projects";
import { prospectInputSchema } from "@/lib/validation/prospects";
import { projectFromDoc } from "@/server/data/convert";
import { tabsFor } from "@/components/projects-core/tab-values";
import type { DocumentSnapshot } from "firebase-admin/firestore";

const snap = (data: Record<string, unknown>) => ({ id: "doc1", data: () => data }) as unknown as DocumentSnapshot;

describe("monthly periods", () => {
  it("one period per calendar month from the start month to the current month, last day as due date", () => {
    const p = periodsBetween("month", "2026-09-15", null, "2026-11-01");
    expect(p.map((x) => [x.label, x.start, x.end])).toEqual([
      ["Sep 2026", "2026-09-01", "2026-09-30"],
      ["Oct 2026", "2026-10-01", "2026-10-31"],
      ["Nov 2026", "2026-11-01", "2026-11-30"],
    ]);
  });
  it("handles February and leap years and the year boundary", () => {
    const p = periodsBetween("month", "2027-12-10", null, "2028-03-01");
    expect(p.map((x) => x.end)).toEqual(["2027-12-31", "2028-01-31", "2028-02-29", "2028-03-31"]);
    expect(periodsBetween("month", "2026-02-01", null, "2026-02-10")[0].end).toBe("2026-02-28");
  });
  it("no start date or a start in the future gives nothing", () => {
    expect(periodsBetween("month", null, null, "2026-11-01")).toEqual([]);
    expect(periodsBetween("month", "2026-12-01", null, "2026-11-01")).toEqual([]);
  });
  it("end date before today stops billing, end date after today does not extend it", () => {
    expect(periodsBetween("month", "2026-08-01", "2026-09-20", "2026-11-01").map((x) => x.key)).toEqual(["2026-08", "2026-09"]);
    expect(periodsBetween("month", "2026-08-01", "2027-06-30", "2026-10-02").map((x) => x.key)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
  it("end date before the start gives nothing", () => {
    expect(periodsBetween("month", "2026-08-10", "2026-08-01", "2026-11-01")).toEqual([]);
  });
});

describe("weekly periods", () => {
  it("weeks run Monday to Sunday", () => {
    expect(weekStartOf("2026-11-03")).toBe("2026-11-02"); // Tuesday
    expect(weekStartOf("2026-11-02")).toBe("2026-11-02"); // Monday
    expect(weekStartOf("2026-11-08")).toBe("2026-11-02"); // Sunday belongs to the week before
  });
  it("starts with the week containing the start date, in full", () => {
    const p = periodsBetween("week", "2026-10-21", null, "2026-11-04"); // Wednesday start, Wednesday today
    expect(p.map((x) => [x.label, x.end])).toEqual([
      ["Week of 19 Oct 2026", "2026-10-25"],
      ["Week of 26 Oct 2026", "2026-11-01"],
      ["Week of 2 Nov 2026", "2026-11-08"],
    ]);
  });
  it("a start date on a Sunday is the last day of its week", () => {
    const p = periodsBetween("week", "2026-11-01", null, "2026-11-02");
    expect(p.map((x) => x.start)).toEqual(["2026-10-26", "2026-11-02"]);
  });
  it("a period starting on or before the end date is billed in full, one starting after is not", () => {
    // end on Monday 9 Nov: week of 9 Nov starts on that day, so it is billed
    expect(periodsBetween("week", "2026-11-02", "2026-11-09", "2026-12-31").map((x) => x.start)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(periodsBetween("week", "2026-11-02", "2026-11-08", "2026-12-31").map((x) => x.start)).toEqual(["2026-11-02"]);
  });
});

describe("flat bill lines", () => {
  it("each period is the full rate, the current one is in progress and cannot be overdue", () => {
    const lines = flatBillLines("month", 100000, "2026-09-01", null, "2026-11-10");
    expect(lines.map((l) => [l.label, l.amountDue, l.dueDate, l.inProgress])).toEqual([
      ["Sep 2026", 100000, "2026-09-30", false],
      ["Oct 2026", 100000, "2026-10-31", false],
      ["Nov 2026", 100000, "2026-11-30", true],
    ]);
    const f = billsFinance({ lines, payments: [], today: "2026-11-10" });
    expect(f.overdueLines.map((l) => l.label)).toEqual(["Sep 2026", "Oct 2026"]);
  });
  it("allocates payments oldest first across weekly lines, with a partial payment", () => {
    const lines = flatBillLines("week", 20000, "2026-10-19", null, "2026-11-04");
    expect(lines).toHaveLength(3);
    const f = billsFinance({ lines, payments: [{ amount: 30000 }], today: "2026-11-04" });
    expect(f.scheduleTotal).toBe(60000);
    expect(f.pending).toBe(30000);
    expect(f.lines.map((l) => l.state)).toEqual(["paid", "partly_paid", "unpaid"]);
    // week of 19 Oct ended 25 Oct, week of 26 Oct is partly paid and ended 1 Nov, so overdue
    expect(f.overdueLines.map((l) => l.label)).toEqual(["Week of 26 Oct 2026"]);
  });
  it("derivedBillLines uses the flat lines for week and month and the entries for hour and day", () => {
    const entries = [{ date: "2026-10-05", quantityHundredths: 200 }];
    const flat = derivedBillLines({ kind: "retainer", rate: 5000, rateUnit: "month", startDate: "2026-10-01", endDate: null }, { entries, tasks: [] }, "2026-11-02");
    expect(flat.map((l) => l.amountDue)).toEqual([5000, 5000]);
    const hourly = derivedBillLines({ kind: "retainer", rate: 5000, rateUnit: "hour", startDate: "2026-10-01", endDate: null }, { entries, tasks: [] }, "2026-11-02");
    expect(hourly).toHaveLength(1);
    expect(hourly[0].amountDue).toBe(10000);
  });
});

describe("end date when the status changes", () => {
  it("on hold or completed with no end date sets today, flagged auto", () => {
    expect(endDateForStatus("on_hold", { endDate: null, endDateAuto: false }, "2026-11-01")).toEqual({ endDate: "2026-11-01", endDateAuto: true });
    expect(endDateForStatus("completed", { endDate: null, endDateAuto: false }, "2026-11-01")).toEqual({ endDate: "2026-11-01", endDateAuto: true });
  });
  it("never replaces an end date that is already set", () => {
    const typed = { endDate: "2026-12-31", endDateAuto: false };
    expect(endDateForStatus("completed", typed, "2026-11-01")).toEqual(typed);
  });
  it("back to active clears an auto end date but keeps a typed one", () => {
    expect(endDateForStatus("active", { endDate: "2026-11-01", endDateAuto: true }, "2026-11-05")).toEqual({ endDate: null, endDateAuto: false });
    const typed = { endDate: "2026-12-31", endDateAuto: false };
    expect(endDateForStatus("active", typed, "2026-11-05")).toEqual(typed);
  });
  it("other statuses leave it alone", () => {
    const cur = { endDate: null, endDateAuto: false };
    expect(endDateForStatus("cancelled", cur, "2026-11-01")).toEqual(cur);
  });
});

describe("validation of the new units and schedule", () => {
  const base = { clientId: "c1", title: "R", description: "", currency: "USD", startDate: "", deadline: "" };
  it("accepts week and month, still rejects unknown units and a zero rate", () => {
    expect(projectCreateSchema.parse({ ...base, kind: "retainer", rateUnit: "week", rate: "300" })).toMatchObject({ rateUnit: "week", rate: 30000 });
    expect(projectCreateSchema.parse({ ...base, kind: "retainer", rateUnit: "month", rate: "1200" })).toMatchObject({ rateUnit: "month", rate: 120000 });
    expect(projectCreateSchema.safeParse({ ...base, kind: "retainer", rateUnit: "year", rate: "5" }).success).toBe(false);
    expect(projectCreateSchema.safeParse({ ...base, kind: "retainer", rateUnit: "month", rate: "0" }).success).toBe(false);
  });
  it("working schedule is stored in hundredths, blank means the defaults", () => {
    const set = projectCreateSchema.parse({ ...base, kind: "retainer", rateUnit: "hour", rate: "25", hoursPerDay: "6", daysPerMonth: "20.5" }) as Record<string, unknown>;
    expect([set.hoursPerDay, set.daysPerMonth]).toEqual([600, 2050]);
    const blank = projectCreateSchema.parse({ ...base, kind: "retainer", rateUnit: "hour", rate: "25", hoursPerDay: "", daysPerMonth: "" }) as Record<string, unknown>;
    expect([blank.hoursPerDay, blank.daysPerMonth]).toEqual([800, 2200]);
  });
  it("enforces the schedule ranges", () => {
    const attempt = (hoursPerDay: string, daysPerMonth: string) =>
      projectCreateSchema.safeParse({ ...base, kind: "retainer", rateUnit: "hour", rate: "25", hoursPerDay, daysPerMonth }).success;
    expect(attempt("0.25", "0.5")).toBe(true);
    expect(attempt("24", "31")).toBe(true);
    expect(attempt("0.2", "22")).toBe(false);
    expect(attempt("24.01", "22")).toBe(false);
    expect(attempt("8", "0.4")).toBe(false);
    expect(attempt("8", "31.5")).toBe(false);
    expect(attempt("abc", "22")).toBe(false);
  });
  it("end date cannot be before the start date, and edit accepts and keeps the new fields", () => {
    expect(projectCreateSchema.safeParse({ ...base, kind: "retainer", rateUnit: "month", rate: "5", startDate: "2026-10-10", endDate: "2026-10-01" }).success).toBe(false);
    const edit = retainerUpdateSchema.parse({ title: "R", description: "", rateUnit: "week", rate: "10", startDate: "", deadline: "", endDate: "2026-12-31", hoursPerDay: "7", daysPerMonth: "18" });
    expect(edit).toMatchObject({ rateUnit: "week", endDate: "2026-12-31", hoursPerDay: 700, daysPerMonth: 1800 });
    expect(retainerUpdateSchema.parse({ title: "R", description: "", rateUnit: "week", rate: "10", startDate: "", deadline: "" })).not.toHaveProperty("hoursPerDay");
  });
  it("prospect form: schedule stored for retainers only, defaults when blank", () => {
    const base2 = { name: "N", company: "", email: "", source: "other", service: "", estimatedValue: "", currency: "USD", nextFollowUp: "", notes: "", rate: "50" };
    expect(prospectInputSchema.parse({ ...base2, engagementKind: "retainer", rateUnit: "month", hoursPerDay: "6", daysPerMonth: "20" })).toMatchObject({ rateUnit: "month", hoursPerDay: 600, daysPerMonth: 2000 });
    expect(prospectInputSchema.parse({ ...base2, engagementKind: "retainer", rateUnit: "week" })).toMatchObject({ hoursPerDay: 800, daysPerMonth: 2200 });
    expect(prospectInputSchema.parse({ ...base2, engagementKind: "tasks", rateUnit: "hour", hoursPerDay: "6", daysPerMonth: "20" })).toMatchObject({ hoursPerDay: 800, daysPerMonth: 2200, rateUnit: null });
    expect(prospectInputSchema.safeParse({ ...base2, engagementKind: "retainer", rateUnit: "hour", hoursPerDay: "30" }).success).toBe(false);
  });
});

describe("expected monthly earnings and equivalent rates", () => {
  // 8 h/day (800), 22 days/month (2200)
  it("hour: rate x hours x days", () => {
    expect(expectedMonthly("hour", 2500, 800, 2200)).toBe(440000);
    expect(expectedMonthly("hour", 2501, 650, 2050)).toBe(Math.round((2501 * 6.5 * 20.5)));
  });
  it("day: rate x days", () => {
    expect(expectedMonthly("day", 18000, 800, 2200)).toBe(396000);
    expect(expectedMonthly("day", 18001, 800, 2250)).toBe(Math.round(18001 * 22.5));
  });
  it("week: rate x 52 / 12, rounded", () => {
    expect(expectedMonthly("week", 30000, 800, 2200)).toBe(130000);
    expect(expectedMonthly("week", 10001, 800, 2200)).toBe(43338);
  });
  it("month: the rate itself", () => {
    expect(expectedMonthly("month", 123456, 800, 2200)).toBe(123456);
  });
  it("a zero or missing rate gives zero", () => {
    expect(expectedMonthly("hour", 0, 800, 2200)).toBe(0);
    expect(expectedMonthly("month", -5, 800, 2200)).toBe(0);
  });
  it("equivalents derive from the monthly figure and guard divide by zero", () => {
    expect(equivalentRates(440000, 800, 2200)).toEqual({ hourly: 2500, daily: 20000, weekly: 101538 });
    expect(equivalentRates(100000, 0, 2200)).toMatchObject({ hourly: 0 });
    expect(equivalentRates(100000, 800, 0)).toMatchObject({ hourly: 0, daily: 0 });
  });
  it("expectedFromInputs reads typed text, uses defaults for blanks, and returns null for bad input", () => {
    const r = expectedFromInputs("hour", "25", "6", "20");
    expect(r?.monthly).toBe(300000);
    expect(r?.rates).toMatchObject({ hourly: 2500, daily: 15000 });
    expect(expectedFromInputs("hour", "25", "", "")?.monthly).toBe(440000);
    expect(expectedFromInputs("hour", "", "6", "20")).toBeNull();
    expect(expectedFromInputs("hour", "25", "25", "20")).toBeNull();
    expect(expectedFromInputs("day", "100", "8", "0")).toBeNull();
  });
});

describe("time meter", () => {
  it("expected quantities: hours = hours/day x days/month, days = days/month, flat units none", () => {
    expect(expectedQuantity("hour", 800, 2200)).toBe(17600);
    expect(expectedQuantity("hour", 650, 2050)).toBe(13325);
    expect(expectedQuantity("day", 800, 2250)).toBe(2250);
    expect(expectedQuantity("month", 800, 2200)).toBe(0);
  });
  it("state: under below 90%, on track to 110%, over beyond, none without an expectation", () => {
    expect(meterState(0, 17600)).toBe("under");
    expect(meterState(15840, 17600)).toBe("on_track");
    expect(meterState(19360, 17600)).toBe("on_track");
    expect(meterState(19400, 17600)).toBe("over");
    expect(meterState(100, 0)).toBe("none");
  });
  it("new time entries start at a working day of hours, or one day", () => {
    expect(defaultEntryQuantity("hour", 600)).toBe(600);
    expect(defaultEntryQuantity("day", 600)).toBe(100);
  });
});

describe("schedule on projects and prospects", () => {
  const base = { clientId: "c", title: "R", description: "", currency: "USD" as const, startDate: null, deadline: null };
  it("new retainer stores the schedule and end date, other kinds store the defaults", () => {
    const r = newProjectFields({ ...base, kind: "retainer", rate: 100, rateUnit: "week", hoursPerDay: 600, daysPerMonth: 2000, endDate: "2027-01-31" });
    expect(r).toMatchObject({ rateUnit: "week", hoursPerDay: 600, daysPerMonth: 2000, endDate: "2027-01-31", endDateAuto: false });
    expect(newProjectFields({ ...base, kind: "retainer", rate: 100, rateUnit: "hour" })).toMatchObject({ hoursPerDay: 800, daysPerMonth: 2200, endDate: null });
    expect(newProjectFields({ ...base, kind: "tasks" })).toMatchObject({ hoursPerDay: 800, daysPerMonth: 2200, endDate: null });
  });
  it("converting a retainer prospect copies the unit (week and month too) and the schedule", () => {
    const prospect = { service: "S", currency: "USD" as const, estimatedValue: 1, engagementKind: "retainer" as const, rate: 70000, rateUnit: "month" as const, hoursPerDay: 600, daysPerMonth: 1900 };
    const f = newProjectFields(prospectProjectInput(prospect, "c9", 3));
    expect(f).toMatchObject({ kind: "retainer", rate: 70000, rateUnit: "month", hoursPerDay: 600, daysPerMonth: 1900 });
    const w = newProjectFields(prospectProjectInput({ ...prospect, rateUnit: "week" }, "c9", 3));
    expect(w.rateUnit).toBe("week");
  });
  it("old documents read as 8 hours a day and 22 days a month, billing unchanged", () => {
    const p = projectFromDoc(snap({ kind: "retainer", rate: 4000, rateUnit: "hour", contractValue: 0 }));
    expect(p).toMatchObject({ hoursPerDay: 800, daysPerMonth: 2200, endDate: null, endDateAuto: false, rateUnit: "hour" });
    expect(normalizeProspectEngagement({ engagementKind: "retainer", rate: 1, rateUnit: "day" })).toMatchObject({ hoursPerDay: 800, daysPerMonth: 2200 });
    expect(normalizeProspectEngagement({ engagementKind: "retainer", rate: 1, rateUnit: "day", hoursPerDay: 500, daysPerMonth: 1500 })).toMatchObject({ hoursPerDay: 500, daysPerMonth: 1500 });
    expect(normalizeProspectEngagement({ engagementKind: "tasks", hoursPerDay: 500 })).toMatchObject({ hoursPerDay: 800 });
  });
  it("tabs: week and month retainers show billing periods instead of the time log", () => {
    expect(tabsFor("retainer", "month").map((t) => t.value)).toEqual(["overview", "periods", "payments", "activity"]);
    expect(tabsFor("retainer", "week").map((t) => t.label)).toContain("Billing periods");
    expect(tabsFor("retainer", "day").map((t) => t.value)).toEqual(["overview", "time", "payments", "activity"]);
    expect(tabsFor("retainer").map((t) => t.value)).toEqual(["overview", "time", "payments", "activity"]);
  });
});

describe("dashboard with weekly lines", () => {
  it("recurring billed this month counts each weekly line due in the month and pending includes them", () => {
    const input: DashboardInput = {
      now: new Date("2026-11-11T04:00:00Z"), // 11 Nov 2026, Manila
      clients: [{ id: "c", name: "C" }],
      projects: [
        {
          id: "p", clientId: "c", title: "Weekly", status: "active", currency: "USD", contractValue: 0, acceptedAt: new Date("2026-10-26T00:00:00Z"), archivedAt: null,
          kind: "retainer", rate: 10000, rateUnit: "week", startDate: "2026-10-26", endDate: null,
        },
      ],
      payments: [],
      schedule: [],
      prospects: [],
      revisions: [],
    };
    const d = buildDashboard(input);
    // weeks of 26 Oct (due 1 Nov), 2 Nov (due 8 Nov), 9 Nov (due 15 Nov): all three are due in November
    expect(d.recurringBilledThisMonth.USD).toBe(30000);
    expect(d.pendingBalance.USD).toBe(30000);
    expect(d.attention.overdue.map((o) => o.label)).toEqual(["Week of 26 Oct 2026", "Week of 2 Nov 2026"]);
  });
});
