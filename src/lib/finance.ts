import { addMoney, type Currency, type MoneyByCurrency } from "@/lib/money";
import { monthKeyOf, type IsoDate, type MonthKey } from "@/lib/dates";
import type { Payment, ScheduleLine } from "@/lib/types";

// Pure payment maths. Nothing here is stored: every total is computed from the
// project's contract value, schedule lines, and payment entries on read.

export type LineState = "paid" | "partly_paid" | "unpaid";

export type AllocatedLine = ScheduleLine & {
  covered: number;
  outstanding: number;
  state: LineState;
  overdue: boolean;
};

export type ProjectFinance = {
  paid: number;
  /** contractValue - paid. Negative means overpaid. */
  pending: number;
  scheduleTotal: number;
  /** True when there is no schedule, or the schedule sums to contractValue. */
  scheduleMatches: boolean;
  lines: AllocatedLine[];
  overdueLines: AllocatedLine[];
  overdueAmount: number;
};

export function sumPayments(payments: Pick<Payment, "amount">[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0);
}

export function sortSchedule<T extends Pick<ScheduleLine, "dueDate" | "order">>(lines: T[]): T[] {
  return [...lines].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.order - b.order);
}

/**
 * Apply the total paid to schedule lines oldest due date first. There is no
 * manual allocation: a payment always settles the earliest unpaid line.
 */
export function allocate(schedule: ScheduleLine[], paid: number, today: IsoDate): AllocatedLine[] {
  let remaining = Math.max(0, paid);
  return sortSchedule(schedule).map((line) => {
    const covered = Math.min(line.amountDue, remaining);
    remaining -= covered;
    const outstanding = line.amountDue - covered;
    const state: LineState = outstanding === 0 ? "paid" : covered > 0 ? "partly_paid" : "unpaid";
    return { ...line, covered, outstanding, state, overdue: outstanding > 0 && line.dueDate < today };
  });
}

export function projectFinance(input: {
  contractValue: number;
  schedule: ScheduleLine[];
  payments: Pick<Payment, "amount">[];
  today: IsoDate;
}): ProjectFinance {
  const paid = sumPayments(input.payments);
  const lines = allocate(input.schedule, paid, input.today);
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
