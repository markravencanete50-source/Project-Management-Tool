import { addMoney, type Currency, type MoneyByCurrency } from "@/lib/money";
import { monthKeyOf, type IsoDate, type MonthKey } from "@/lib/dates";
import type { Payment, ScheduleKind, ScheduleLine } from "@/lib/types";

// Pure payment maths. Nothing here is stored: every total is computed from the
// project's contract value, schedule lines, and payment entries on read.
//
// The allocation works on "bill lines": a label, an amount due and a due date.
// A fixed project's stored schedule lines are bill lines. For retainers and
// task projects the lines are derived from time entries or done tasks (see
// src/lib/billing.ts) and fed through exactly the same allocation.

export type LineState = "paid" | "partly_paid" | "unpaid";

/** Anything that can be billed: a stored schedule line or a derived line. */
export type BillLine = {
  id: string;
  label: string;
  amountDue: number;
  dueDate: IsoDate;
  /** Tie breaker for lines sharing a due date. Defaults to 0. */
  order?: number;
  /** Schedule lines only. */
  kind?: ScheduleKind;
  /** Short secondary text for derived lines, for example "42.5 hours". */
  detail?: string;
  /** Retainer months that have not ended yet. Display only: it never changes overdue. */
  inProgress?: boolean;
};

export type Allocation = {
  covered: number;
  outstanding: number;
  state: LineState;
  overdue: boolean;
};

export type AllocatedLine = ScheduleLine & Allocation;

export type ProjectFinance<L extends BillLine = ScheduleLine> = {
  paid: number;
  /** What is owed minus paid (contractValue for fixed projects, the billed total otherwise). Negative means overpaid. */
  pending: number;
  /** Sum of line amounts. For derived kinds this is the billed total. */
  scheduleTotal: number;
  /** True when there is no schedule, or the schedule sums to contractValue. */
  scheduleMatches: boolean;
  lines: (L & Allocation)[];
  overdueLines: (L & Allocation)[];
  overdueAmount: number;
};

export function sumPayments(payments: Pick<Payment, "amount">[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0);
}

export function sortSchedule<T extends Pick<BillLine, "dueDate"> & { order?: number }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Apply the total paid to bill lines oldest due date first. There is no
 * manual allocation: a payment always settles the earliest unpaid line.
 * Works for stored schedule lines and for lines derived from time or tasks.
 */
export function allocateBills<T extends BillLine>(lines: T[], paid: number, today: IsoDate): (T & Allocation)[] {
  let remaining = Math.max(0, paid);
  return sortSchedule(lines).map((line) => {
    const covered = Math.min(line.amountDue, remaining);
    remaining -= covered;
    const outstanding = line.amountDue - covered;
    const state: LineState = outstanding === 0 ? "paid" : covered > 0 ? "partly_paid" : "unpaid";
    return { ...line, covered, outstanding, state, overdue: outstanding > 0 && line.dueDate < today };
  });
}

/** Allocation for a fixed project's stored schedule. */
export function allocate(schedule: ScheduleLine[], paid: number, today: IsoDate): AllocatedLine[] {
  return allocateBills(schedule, paid, today);
}

/**
 * Finance for a project whose bill lines are derived (retainer or tasks): the
 * billed total is the sum of the lines and pending is billed minus paid.
 */
export function billsFinance<L extends BillLine>(input: {
  lines: L[];
  payments: Pick<Payment, "amount">[];
  today: IsoDate;
}): ProjectFinance<L> {
  const paid = sumPayments(input.payments);
  const lines = allocateBills(input.lines, paid, input.today);
  const billed = input.lines.reduce((sum, l) => sum + l.amountDue, 0);
  const overdueLines = lines.filter((l) => l.overdue);
  return {
    paid,
    pending: billed - paid,
    scheduleTotal: billed,
    scheduleMatches: true,
    lines,
    overdueLines,
    overdueAmount: overdueLines.reduce((sum, l) => sum + l.outstanding, 0),
  };
}

export function projectFinance(input: {
  contractValue: number;
  schedule: ScheduleLine[];
  payments: Pick<Payment, "amount">[];
  today: IsoDate;
}): ProjectFinance {
  const paid = sumPayments(input.payments);
  const lines = allocateBills(input.schedule, paid, input.today);
  const scheduleTotal = input.schedule.reduce((sum, l) => sum + l.amountDue, 0);
  const overdueLines = lines.filter((l) => l.overdue);
  return {
    paid,
    pending: input.contractValue - paid,
    scheduleTotal,
    scheduleMatches: input.schedule.length === 0 || scheduleTotal === input.contractValue,
    lines,
    overdueLines,
    overdueAmount: overdueLines.reduce((sum, l) => sum + l.outstanding, 0),
  };
}

/**
 * For the "deposit_paid" accepted rule: true once every deposit line is fully
 * covered. A project with no deposit lines counts as accepted on its first payment.
 */
export function depositCovered(schedule: ScheduleLine[], payments: Pick<Payment, "amount">[]): boolean {
  const paid = sumPayments(payments);
  if (paid <= 0) return false;
  const deposits = allocate(schedule, paid, "0000-00-00").filter((l) => l.kind === "deposit");
  return deposits.every((l) => l.state === "paid");
}

/** Payments grouped by Manila month of paidOn, per currency. */
export function earningsByMonth(
  payments: { amount: number; paidOn: IsoDate; currency: Currency }[],
): Map<MonthKey, MoneyByCurrency> {
  const out = new Map<MonthKey, MoneyByCurrency>();
  for (const p of payments) {
    const key = monthKeyOf(p.paidOn);
    addMoney(out.get(key) ?? out.set(key, {}).get(key)!, p.currency, p.amount);
  }
  return out;
}
