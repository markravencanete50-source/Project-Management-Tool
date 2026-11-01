import { addDaysIso, monthKeyOf, type IsoDate, type MonthKey } from "@/lib/dates";
import { addMoney, type Currency, type MoneyByCurrency } from "@/lib/money";
import type { PaymentMethod, StandalonePayment } from "@/lib/types";

// Pure rules for "payment only" entries: money received that is not attached to
// any project, schedule line, retainer or task list. They count as earnings on
// the dashboard and nowhere else (never pending balance, overdue, progress or
// accepted counts).

/** A payment may be dated up to one day ahead of today (Manila), to allow for time zones. */
export function latestPaidOn(today: IsoDate): IsoDate {
  return addDaysIso(today, 1);
}

/** Why a payer is missing, or null when it is fine: a client, or a payer name when there is none. */
export function payerProblem(input: { clientId: string | null; payerName: string }): string | null {
  if (input.clientId) return null;
  return input.payerName.trim() === "" ? "Enter who paid, or choose a client" : null;
}

/** Normalise a stored document: missing or odd fields become safe values. */
export function normalizeStandalone(id: string, raw: Record<string, unknown>, createdAt: Date, updatedAt: Date): StandalonePayment {
  const currency = raw.currency === "GBP" || raw.currency === "USD" || raw.currency === "PHP" ? raw.currency : "PHP";
  const methods: PaymentMethod[] = ["bank", "paypal", "wise", "gcash", "other"];
  return {
    id,
    clientId: typeof raw.clientId === "string" && raw.clientId ? raw.clientId : null,
    payerName: typeof raw.payerName === "string" ? raw.payerName : "",
    note: typeof raw.note === "string" ? raw.note : "",
    currency,
    amount: typeof raw.amount === "number" && Number.isFinite(raw.amount) ? Math.round(raw.amount) : 0,
    paidOn: typeof raw.paidOn === "string" ? raw.paidOn : "1970-01-01",
    method: methods.includes(raw.method as PaymentMethod) ? (raw.method as PaymentMethod) : "other",
    receiptPublicId: typeof raw.receiptPublicId === "string" && raw.receiptPublicId ? raw.receiptPublicId : null,
    createdAt,
    updatedAt,
  };
}

// ------------------------------------------------------------ the ledger

/** One line of "all money received": a project payment or a payment-only entry. */
export type LedgerRow = {
  id: string;
  source: "project" | "standalone";
  projectId: string | null;
  projectTitle: string | null;
  clientId: string | null;
  /** Client name, or the payer name for a payment with no client. */
  who: string;
  currency: Currency;
  amount: number;
  paidOn: IsoDate;
  method: PaymentMethod;
  note: string;
  receiptPublicId: string | null;
  createdAt: Date;
};

export type LedgerFilters = {
  /** "YYYY-MM" or "all". */
  month: string;
  currency: string;
  clientId: string;
  source: string;
};

export const NO_FILTERS: LedgerFilters = { month: "all", currency: "all", clientId: "all", source: "all" };

/** Newest first: by paid date, then by when it was recorded, then by id so the order is stable. */
export function sortLedger<T extends Pick<LedgerRow, "paidOn" | "createdAt" | "id">>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
  );
}

export function filterLedger(rows: LedgerRow[], f: LedgerFilters): LedgerRow[] {
  return rows.filter((r) => {
    if (f.month !== "all" && monthKeyOf(r.paidOn) !== f.month) return false;
    if (f.currency !== "all" && r.currency !== f.currency) return false;
    if (f.clientId !== "all" && r.clientId !== f.clientId) return false;
    if (f.source === "project" && r.source !== "project") return false;
    if (f.source === "standalone" && r.source !== "standalone") return false;
    return true;
  });
}

/** Totals per currency (currencies are never added together). */
export function ledgerTotals(rows: Pick<LedgerRow, "currency" | "amount">[]): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  for (const r of rows) addMoney(out, r.currency, r.amount);
  return out;
}

/** Months that have at least one payment, newest first, for the month filter. */
export function ledgerMonths(rows: Pick<LedgerRow, "paidOn">[]): MonthKey[] {
  return [...new Set(rows.map((r) => monthKeyOf(r.paidOn)))].sort().reverse();
}

/** Read the filters from URL search params, ignoring anything unexpected. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): LedgerFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "all";
  const month = one(sp.month);
  const currency = one(sp.currency);
  const source = one(sp.source);
  return {
    month: /^\d{4}-\d{2}$/.test(month) ? month : "all",
    currency: currency === "GBP" || currency === "USD" || currency === "PHP" ? currency : "all",
    clientId: one(sp.client).slice(0, 80) || "all",
    source: source === "project" || source === "standalone" ? source : "all",
  };
}
