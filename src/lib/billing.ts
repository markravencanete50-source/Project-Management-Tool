import { formatMonthKey, isoDateOfInstant, monthKeyOf, type IsoDate, type MonthKey } from "@/lib/dates";
import { addMoney, type Currency, type MoneyByCurrency } from "@/lib/money";
import {
  billsFinance,
  projectFinance,
  type BillLine,
  type ProjectFinance,
} from "@/lib/finance";
import type { Payment, Project, ProjectKind, RateUnit, ScheduleLine, Task, TimeEntry } from "@/lib/types";

// Pure maths for the two derived engagement kinds. Nothing here is stored.
//
// Retainer: the owner logs time. Every entry is worth round(quantity * rate).
// Billing is in arrears by Manila calendar month: each month that has entries
// becomes one bill line, due on the last day of that month.
//
// Tasks: a task is billed (owed) at the moment it is marked done. Each done
// task becomes one bill line due on the Manila date it was marked done.
//
// Both feed the same allocation as a fixed project's schedule (src/lib/finance.ts).

// ------------------------------------------------------------------ units

export const UNIT_LABELS: Record<RateUnit, { singular: string; plural: string; short: string }> = {
  hour: { singular: "hour", plural: "hours", short: "hrs" },
  day: { singular: "day", plural: "days", short: "days" },
};

/** "hour" or "hours" for a quantity in hundredths (exactly 1.00 is singular). */
export function unitWord(unit: RateUnit, quantityHundredths: number): string {
  return quantityHundredths === 100 ? UNIT_LABELS[unit].singular : UNIT_LABELS[unit].plural;
}

export const MAX_QUANTITY_HUNDREDTHS = 100_000;

/**
 * Parse a typed quantity ("7.5", "0.25") into hundredths. Positive, at most 2
 * decimals, at most 1000. Commas are rejected rather than guessed at ("1,5"
 * could be one and a half or fifteen). Returns null when invalid.
 */
export function toHundredths(input: string | number): number | null {
  const raw = typeof input === "number" ? input.toFixed(2) : input.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const value = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_QUANTITY_HUNDREDTHS) return null;
  return value;
}

/** Hundredths back to a plain string for form inputs: 750 is "7.5", 100 is "1". */
export function fromHundredths(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const frac = String(hundredths % 100).padStart(2, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

/** "7.5 hours", "1 day", "0.25 days". */
export function formatQuantity(hundredths: number, unit: RateUnit): string {
  return `${fromHundredths(hundredths)} ${unitWord(unit, hundredths)}`;
}

/** One time entry's value in minor units: round(quantity * rate). */
export function entryAmount(quantityHundredths: number, rate: number): number {
  return Math.round((quantityHundredths * rate) / 100);
}

// --------------------------------------------------------------- retainer

/** Last calendar day of a "YYYY-MM" month, handling February and leap years. */
export function lastDayOfMonth(month: MonthKey): IsoDate {
  const [y, m] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

export type RetainerMonth = {
  month: MonthKey;
  /** "Nov 2026" */
  label: string;
  quantityHundredths: number;
  entryCount: number;
  /** Sum of the month's entry amounts, in minor units. */
  amount: number;
  /** Last day of the month: when this month's bill falls due. */
  dueDate: IsoDate;
};

type TimeInput = Pick<TimeEntry, "date" | "quantityHundredths">;

/** Entries grouped by the Manila month of their date, oldest month first. */
export function retainerMonths(entries: TimeInput[], rate: number): RetainerMonth[] {
  const byMonth = new Map<MonthKey, RetainerMonth>();
  for (const e of entries) {
    const month = monthKeyOf(e.date);
    let row = byMonth.get(month);
    if (!row) {
      row = {
        month,
        label: formatMonthKey(month),
        quantityHundredths: 0,
        entryCount: 0,
        amount: 0,
        dueDate: lastDayOfMonth(month),
      };
      byMonth.set(month, row);
    }
    row.quantityHundredths += e.quantityHundredths;
    row.entryCount += 1;
    row.amount += entryAmount(e.quantityHundredths, rate);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * One bill line per month with entries. The month that contains `today` is
 * flagged inProgress: it is billed in arrears, so it cannot be overdue until
 * its last day has passed (the allocation already guarantees that because the
 * due date is the last day of the month).
 */
export function retainerBillLines(entries: TimeInput[], rate: number, unit: RateUnit, today: IsoDate): BillLine[] {
  const current = monthKeyOf(today);
  return retainerMonths(entries, rate).map((m) => ({
    id: m.month,
    label: m.label,
    amountDue: m.amount,
    dueDate: m.dueDate,
    detail: formatQuantity(m.quantityHundredths, unit),
    inProgress: m.month === current,
  }));
}

// ------------------------------------------------------------------ tasks

type TaskInput = Pick<Task, "id" | "title" | "price" | "status" | "order" | "doneAt">;

/** Done tasks only: each is owed from the Manila date it was marked done. Todo tasks are never billed. */
export function taskBillLines(tasks: TaskInput[]): BillLine[] {
  return tasks
    .filter((t) => t.status === "done" && t.doneAt !== null)
    .map((t) => ({
      id: t.id,
      label: t.title,
      amountDue: t.price,
      dueDate: isoDateOfInstant(t.doneAt as Date),
      order: t.order,
    }));
}

export type TaskTotals = {
  total: number;
  doneCount: number;
  todoCount: number;
  /** Value of done tasks: what is owed. */
  doneValue: number;
  /** Value of tasks still to do: not owed yet. */
  todoValue: number;
};

export function taskTotals(tasks: Pick<Task, "price" | "status">[]): TaskTotals {
  const out: TaskTotals = { total: tasks.length, doneCount: 0, todoCount: 0, doneValue: 0, todoValue: 0 };
  for (const t of tasks) {
    if (t.status === "done") {
      out.doneCount += 1;
      out.doneValue += t.price;
    } else {
      out.todoCount += 1;
      out.todoValue += t.price;
    }
  }
  return out;
}

// ----------------------------------------------------------------- finance

export type FinanceInput = {
  project: Pick<Project, "kind" | "contractValue" | "rate" | "rateUnit">;
  schedule: ScheduleLine[];
  entries: TimeInput[];
  tasks: TaskInput[];
  payments: Pick<Payment, "amount">[];
  today: IsoDate;
};

/** The derived bill lines for a project (empty for fixed projects, whose lines are stored). */
export function derivedBillLines(
  project: Pick<Project, "kind" | "rate" | "rateUnit">,
  data: { entries: TimeInput[]; tasks: TaskInput[] },
  today: IsoDate,
): BillLine[] {
  if (project.kind === "retainer") return retainerBillLines(data.entries, project.rate, project.rateUnit ?? "hour", today);
  if (project.kind === "tasks") return taskBillLines(data.tasks);
  return [];
}

/**
 * Finance for any kind of project. Fixed projects use their stored schedule and
 * contract value exactly as before; retainer and task projects feed derived
 * lines through the same allocation.
 */
export function financeFor(input: FinanceInput): ProjectFinance<BillLine> {
  const { project } = input;
  if (project.kind === "fixed") {
    return projectFinance({
      contractValue: project.contractValue,
      schedule: input.schedule,
      payments: input.payments,
      today: input.today,
    });
  }
  return billsFinance({
    lines: derivedBillLines(project, input, input.today),
    payments: input.payments,
    today: input.today,
  });
}

/**
 * Retainer lines whose due date falls in `month`, per currency: what has been
 * billed for that month, in progress included. Used by the dashboard card.
 */
export function billedInMonth(lines: Pick<BillLine, "amountDue" | "dueDate">[], month: MonthKey, currency: Currency, into: MoneyByCurrency = {}) {
  for (const l of lines) {
    if (monthKeyOf(l.dueDate) === month) addMoney(into, currency, l.amountDue);
  }
  return into;
}

export const KIND_LABELS: Record<ProjectKind, string> = {
  fixed: "Fixed price",
  retainer: "Retainer",
  tasks: "Task based",
};

export function isDerivedKind(kind: ProjectKind): boolean {
  return kind !== "fixed";
}
