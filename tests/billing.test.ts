import { describe, expect, it } from "vitest";
import {
  billedInMonth,
  derivedBillLines,
  entryAmount,
  financeFor,
  formatQuantity,
  fromHundredths,
  lastDayOfMonth,
  retainerBillLines,
  retainerMonths,
  taskBillLines,
  taskTotals,
  toHundredths,
} from "@/lib/billing";
import { allocateBills, billsFinance, projectFinance } from "@/lib/finance";
import { taskProgress } from "@/lib/projects";
import { addTaskSchema, addTimeEntrySchema, setTaskDoneSchema } from "@/lib/validation/billing";
import { projectCreateSchema, retainerUpdateSchema } from "@/lib/validation/projects";
import type { ScheduleLine } from "@/lib/types";

const entry = (date: string, quantityHundredths: number) => ({ date, quantityHundredths });
const task = (id: string, price: number, status: "todo" | "done", doneAt: Date | null = null, order = 0) => ({
  id,
  title: `Task ${id}`,
  price,
  status,
  order,
  doneAt,
});

describe("quantity parsing and formatting", () => {
  it("parses decimals into hundredths without float error", () => {
    expect(toHundredths("7.5")).toBe(750);
    expect(toHundredths("0.25")).toBe(25);
    expect(toHundredths("1")).toBe(100);
    expect(toHundredths("0.29")).toBe(29);
    expect(toHundredths("1000")).toBe(100000);
  });
  it("rejects zero, negatives, too many decimals, commas and huge values", () => {
    for (const bad of ["", "0", "0.00", "-1", "1.234", "1,5", "abc", "1000.01", "1e3"]) expect(toHundredths(bad)).toBeNull();
  });
  it("formats back to a plain string and a unit phrase", () => {
    expect(fromHundredths(750)).toBe("7.5");
    expect(fromHundredths(100)).toBe("1");
    expect(fromHundredths(25)).toBe("0.25");
    expect(formatQuantity(100, "day")).toBe("1 day");
    expect(formatQuantity(750, "hour")).toBe("7.5 hours");
    expect(formatQuantity(25, "day")).toBe("0.25 days");
  });
});

describe("entry amount rounding", () => {
  it("is quantity times rate, rounded to a whole minor unit", () => {
    expect(entryAmount(750, 5000)).toBe(37500); // 7.5 h at 50.00
    expect(entryAmount(100, 12345)).toBe(12345);
  });
  it("rounds half up", () => {
    // 0.01 h at 0.50 per hour is 0.005 minor units... use 25 hundredths at 1001 = 250.25
    expect(entryAmount(25, 1001)).toBe(250);
    expect(entryAmount(50, 1001)).toBe(501); // 500.5 rounds up
    expect(entryAmount(1, 1)).toBe(0); // 0.01 of one minor unit rounds to 0
    expect(entryAmount(1, 50)).toBe(1); // 0.5 rounds up to 1
  });
});

describe("month ends", () => {
  it("handles February in common and leap years and 30 / 31 day months", () => {
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
    expect(lastDayOfMonth("2100-02")).toBe("2100-02-28");
    expect(lastDayOfMonth("2026-04")).toBe("2026-04-30");
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31");
  });
});

describe("retainer months", () => {
  it("groups by calendar month across the month boundary and sums amounts per entry", () => {
    const months = retainerMonths(
      [entry("2026-11-01", 800), entry("2026-10-31", 750), entry("2026-10-01", 100), entry("2026-11-30", 25)],
      5000,
    );
    expect(months.map((m) => m.month)).toEqual(["2026-10", "2026-11"]);
    expect(months[0]).toMatchObject({ label: "Oct 2026", quantityHundredths: 850, entryCount: 2, amount: 37500 + 5000, dueDate: "2026-10-31" });
    expect(months[1]).toMatchObject({ label: "Nov 2026", quantityHundredths: 825, entryCount: 2, amount: 40000 + 1250, dueDate: "2026-11-30" });
  });
  it("sums per entry (each rounded) rather than rounding the total", () => {
    // Two entries of 0.5 minor unit each: 1 + 1, not round(1.0) = 1.
    const [m] = retainerMonths([entry("2026-11-02", 1), entry("2026-11-03", 1)], 50);
    expect(m.amount).toBe(2);
  });
  it("has no months for no entries", () => {
    expect(retainerMonths([], 5000)).toEqual([]);
  });
  it("makes one bill line per month, due on the last day, with the current month in progress", () => {
    const lines = retainerBillLines([entry("2026-02-10", 100), entry("2026-03-05", 200)], 1000, "day", "2026-03-15");
    expect(lines).toEqual([
      { id: "2026-02", label: "Feb 2026", amountDue: 1000, dueDate: "2026-02-28", detail: "1 day", inProgress: false },
      { id: "2026-03", label: "Mar 2026", amountDue: 2000, dueDate: "2026-03-31", detail: "2 days", inProgress: true },
    ]);
  });
});

describe("retainer allocation, pending and overdue", () => {
  const entries = [entry("2026-09-10", 1000), entry("2026-10-12", 1000), entry("2026-11-03", 500)]; // 10h, 10h, 5h at 50.00
  const base = { project: { kind: "retainer" as const, contractValue: 0, rate: 5000, rateUnit: "hour" as const }, schedule: [], tasks: [] };

  it("allocates payments to the oldest month first and reports partly paid", () => {
    const f = financeFor({ ...base, entries, payments: [{ amount: 60000 }], today: "2026-11-10" });
    expect(f.scheduleTotal).toBe(50000 + 50000 + 25000);
    expect(f.pending).toBe(125000 - 60000);
    expect(f.lines.map((l) => [l.id, l.covered, l.outstanding, l.state])).toEqual([
      ["2026-09", 50000, 0, "paid"],
      ["2026-10", 10000, 40000, "partly_paid"],
      ["2026-11", 0, 25000, "unpaid"],
    ]);
  });
  it("flags past months as overdue and the current month as not overdue", () => {
    const f = financeFor({ ...base, entries, payments: [{ amount: 60000 }], today: "2026-11-10" });
    expect(f.overdueLines.map((l) => l.id)).toEqual(["2026-10"]);
    expect(f.overdueAmount).toBe(40000);
    expect(f.lines[2]).toMatchObject({ overdue: false, inProgress: true });
  });
  it("makes the current month overdue only after its last day has passed", () => {
    const onLastDay = financeFor({ ...base, entries: [entry("2026-11-03", 500)], payments: [], today: "2026-11-30" });
    expect(onLastDay.overdueLines).toHaveLength(0);
    const nextDay = financeFor({ ...base, entries: [entry("2026-11-03", 500)], payments: [], today: "2026-12-01" });
    expect(nextDay.overdueLines).toHaveLength(1);
  });
  it("reports overpayment as negative pending", () => {
    const f = financeFor({ ...base, entries: [entry("2026-09-10", 1000)], payments: [{ amount: 80000 }], today: "2026-11-10" });
    expect(f.pending).toBe(-30000);
    expect(f.lines[0]).toMatchObject({ state: "paid", covered: 50000, outstanding: 0 });
    expect(f.overdueAmount).toBe(0);
  });
  it("has nothing billed or pending without entries", () => {
    const f = financeFor({ ...base, entries: [], payments: [], today: "2026-11-10" });
    expect(f).toMatchObject({ pending: 0, scheduleTotal: 0, lines: [], overdueAmount: 0 });
  });
});

describe("task bill lines", () => {
  // 2026-10-31 17:00 UTC is 2026-11-01 01:00 in Manila.
  const doneNearMidnight = new Date("2026-10-31T17:00:00Z");

  it("bills only done tasks, due on the Manila date they were marked done", () => {
    const lines = taskBillLines([
      task("a", 10000, "done", doneNearMidnight, 0),
      task("b", 20000, "todo", null, 1),
      task("c", 5000, "done", new Date("2026-11-02T03:00:00Z"), 2),
    ]);
    expect(lines.map((l) => [l.id, l.label, l.amountDue, l.dueDate])).toEqual([
      ["a", "Task a", 10000, "2026-11-01"],
      ["c", "Task c", 5000, "2026-11-02"],
    ]);
  });
  it("drops a task from what is owed when it goes back to todo", () => {
    const done = taskBillLines([task("a", 10000, "done", new Date("2026-11-02T03:00:00Z"))]);
    const reopened = taskBillLines([task("a", 10000, "todo", null)]);
    expect(done).toHaveLength(1);
    expect(reopened).toEqual([]);
  });
  it("allocates payments across done tasks oldest first, with overpayment and overdue", () => {
    const tasks = [
      task("a", 10000, "done", new Date("2026-11-02T03:00:00Z"), 0),
      task("b", 20000, "done", new Date("2026-11-09T03:00:00Z"), 1),
      task("c", 99999, "todo", null, 2),
    ];
    const project = { kind: "tasks" as const, contractValue: 0, rate: 0, rateUnit: null };
    const partial = financeFor({ project, schedule: [], entries: [], tasks, payments: [{ amount: 15000 }], today: "2026-11-10" });
    expect(partial.pending).toBe(15000);
    expect(partial.lines.map((l) => [l.id, l.state, l.outstanding, l.overdue])).toEqual([
      ["a", "paid", 0, false],
      ["b", "partly_paid", 15000, true],
    ]);
    const over = financeFor({ project, schedule: [], entries: [], tasks, payments: [{ amount: 40000 }], today: "2026-11-10" });
    expect(over.pending).toBe(-10000);
  });
  it("totals done and todo values and the done percentage", () => {
    const tasks = [task("a", 100, "done", new Date()), task("b", 300, "todo"), task("c", 50, "done", new Date())];
    expect(taskTotals(tasks)).toEqual({ total: 3, doneCount: 2, todoCount: 1, doneValue: 150, todoValue: 300 });
    expect(taskProgress(tasks)).toBe(67);
    expect(taskProgress([])).toBe(0);
  });
});

describe("derived finance and fixed finance share one allocation", () => {
  it("feeds stored schedule lines through the same function as derived ones", () => {
    const schedule: ScheduleLine[] = [
      { id: "s1", label: "Deposit", kind: "deposit", amountDue: 40000, dueDate: "2026-10-01", order: 0 },
      { id: "s2", label: "Final", kind: "final", amountDue: 60000, dueDate: "2026-12-01", order: 1 },
    ];
    const viaAllocate = allocateBills(schedule, 50000, "2026-11-01");
    const viaProject = projectFinance({ contractValue: 100000, schedule, payments: [{ amount: 50000 }], today: "2026-11-01" });
    expect(viaProject.lines).toEqual(viaAllocate);
    expect(viaProject.pending).toBe(50000);
  });
  it("financeFor on a fixed project equals projectFinance exactly", () => {
    const schedule: ScheduleLine[] = [{ id: "s1", label: "All", kind: "final", amountDue: 100000, dueDate: "2026-10-01", order: 0 }];
    const input = { contractValue: 100000, schedule, payments: [{ amount: 25000 }], today: "2026-11-01" };
    const viaFor = financeFor({ project: { kind: "fixed", contractValue: 100000, rate: 0, rateUnit: null }, schedule, entries: [entry("2026-10-01", 100)], tasks: [], payments: input.payments, today: input.today });
    expect(viaFor).toEqual(projectFinance(input));
  });
  it("billsFinance sums lines and subtracts payments", () => {
    const f = billsFinance({ lines: [{ id: "a", label: "A", amountDue: 700, dueDate: "2026-11-01" }], payments: [{ amount: 200 }], today: "2026-11-02" });
    expect(f).toMatchObject({ pending: 500, scheduleTotal: 700, paid: 200, overdueAmount: 500 });
  });
  it("derivedBillLines is empty for fixed projects", () => {
    expect(derivedBillLines({ kind: "fixed", rate: 0, rateUnit: null }, { entries: [entry("2026-10-01", 100)], tasks: [] }, "2026-11-01")).toEqual([]);
  });
  it("sums retainer lines due in a month per currency", () => {
    const lines = retainerBillLines([entry("2026-10-10", 100), entry("2026-11-10", 200)], 1000, "hour", "2026-11-15");
    expect(billedInMonth(lines, "2026-11", "USD")).toEqual({ USD: 2000 });
    expect(billedInMonth(lines, "2026-09", "USD")).toEqual({});
  });
});

describe("validation", () => {
  it("accepts quantities and rejects bad ones with a message", () => {
    const ok = addTimeEntrySchema.parse({ projectId: "p", date: "2026-11-03", quantity: "7.5", note: " worked " });
    expect(ok).toMatchObject({ quantity: 750, note: "worked" });
    expect(addTimeEntrySchema.safeParse({ projectId: "p", date: "2026-11-03", quantity: "0" }).success).toBe(false);
    expect(addTimeEntrySchema.safeParse({ projectId: "p", date: "2026-02-30", quantity: "1" }).success).toBe(false);
  });
  it("parses task price to minor units and requires a positive price", () => {
    expect(addTaskSchema.parse({ projectId: "p", title: "Logo", price: "250.50" }).price).toBe(25050);
    expect(addTaskSchema.safeParse({ projectId: "p", title: "Logo", price: "0" }).success).toBe(false);
    expect(addTaskSchema.safeParse({ projectId: "p", title: "  ", price: "5" }).success).toBe(false);
    expect(setTaskDoneSchema.safeParse({ projectId: "p", taskId: "t", done: "yes" }).success).toBe(false);
  });
  it("creates each kind and treats input with no kind as fixed", () => {
    const common = { clientId: "c", title: "T", description: "", currency: "USD", startDate: "", deadline: "" };
    expect(projectCreateSchema.parse({ ...common, contractValue: "100", revisionAllowance: "2" })).toMatchObject({ kind: "fixed", contractValue: 10000 });
    expect(projectCreateSchema.parse({ ...common, kind: "retainer", rateUnit: "day", rate: "180" })).toMatchObject({ kind: "retainer", rateUnit: "day", rate: 18000 });
    expect(projectCreateSchema.parse({ ...common, kind: "tasks" })).toMatchObject({ kind: "tasks" });
    expect(projectCreateSchema.safeParse({ ...common, kind: "retainer", rateUnit: "day", rate: "0" }).success).toBe(false);
    expect(projectCreateSchema.safeParse({ ...common, kind: "retainer", rateUnit: "week", rate: "5" }).success).toBe(false);
    expect(projectCreateSchema.safeParse({ ...common, kind: "fixed" }).success).toBe(false);
  });
  it("lets a retainer change its rate on edit", () => {
    expect(retainerUpdateSchema.parse({ title: "T", description: "", rateUnit: "hour", rate: "30", startDate: "", deadline: "" }).rate).toBe(3000);
  });
});
