import type { Currency } from "@/lib/money";
import type { IsoDate } from "@/lib/dates";

// Document shapes as returned by the data layer: Firestore Timestamps are
// converted to Date, and every document carries its id. Money is always an
// integer in minor units.

export const PROSPECT_SOURCES = ["referral", "upwork", "linkedin", "cold_outreach", "website", "other"] as const;
export type ProspectSource = (typeof PROSPECT_SOURCES)[number];

export const PROSPECT_STAGES = ["new", "contacted", "proposal_sent", "waiting_for_client", "negotiating", "won", "lost"] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number];

/** Closed stages. Everything else in PROSPECT_STAGES is open (counts in the pipeline, never in win rate). */
export const CLOSED_PROSPECT_STAGES: readonly ProspectStage[] = ["won", "lost"];
export const isOpenStage = (stage: string | null | undefined): boolean =>
  !!stage && (PROSPECT_STAGES as readonly string[]).includes(stage) && !CLOSED_PROSPECT_STAGES.includes(stage as ProspectStage);
/** An unknown or missing stage from a stored document becomes "new" rather than breaking the board. */
export const normalizeStage = (stage: unknown): ProspectStage =>
  typeof stage === "string" && (PROSPECT_STAGES as readonly string[]).includes(stage) ? (stage as ProspectStage) : "new";

export const LOST_REASONS = ["price", "timing", "no_response", "went_elsewhere", "other"] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const PROJECT_STATUSES = ["draft", "agreement_sent", "active", "on_hold", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
/** Statuses the admin may set by hand. draft and agreement_sent are set by flows. */
export const MANUAL_PROJECT_STATUSES = ["active", "on_hold", "completed", "cancelled"] as const;

/**
 * Engagement kind. "fixed" is the original fixed-price project (contract value,
 * schedule, milestones, agreements, revisions). "retainer" is billed by logged
 * time at an hourly or daily rate, monthly in arrears. "tasks" is billed per
 * priced task, owed when the task is marked done. Documents with no kind are "fixed".
 */
export const PROJECT_KINDS = ["fixed", "retainer", "tasks"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

/**
 * hour and day are logged: the owner records time against the rate. week and
 * month are flat fees billed automatically for every period, with no logging.
 */
export const RATE_UNITS = ["hour", "day", "week", "month"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];
export type FlatRateUnit = "week" | "month";

/** True for the auto-billed units (a flat fee per week or month). */
export function isFlatUnit(unit: RateUnit | null | undefined): unit is FlatRateUnit {
  return unit === "week" || unit === "month";
}

export const TASK_STATUSES = ["todo", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const SCHEDULE_KINDS = ["deposit", "milestone", "final", "change_order"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const PAYMENT_METHODS = ["bank", "paypal", "wise", "gcash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** How an expense was paid: every payment method plus cash and card. Payments keep their own shorter list. */
export const EXPENSE_METHODS = [...PAYMENT_METHODS, "cash", "card"] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

export const EXPENSE_CATEGORIES = ["software", "equipment", "subscriptions", "transport", "food", "taxes_fees", "marketing", "office", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** A recurring expense is a template that repeats; its occurrences are derived on read and never stored. */
export const RECURRING_INTERVALS = ["none", "weekly", "monthly", "yearly"] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];

export const AGREEMENT_STATUSES = ["draft", "sent", "viewed", "signed", "void"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const REVISION_STATUSES = [
  "awaiting_quote",
  "awaiting_approval",
  "requested",
  "in_progress",
  "delivered",
  "approved",
  "cancelled",
] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export type Actor = "admin" | "client" | "system";
export type Visibility = "internal" | "client";

export type Client = {
  id: string;
  name: string;
  company: string;
  email: string;
  defaultCurrency: Currency;
  notes: string;
  authUid: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Prospect = {
  id: string;
  name: string;
  company: string;
  email: string;
  source: ProspectSource;
  service: string;
  /** Fixed and tasks: the project value. Retainer: the monthly value. */
  estimatedValue: number;
  currency: Currency;
  /** Which kind of project this becomes. "fixed" for prospects written before kinds existed. */
  engagementKind: ProjectKind;
  /** Retainer prospects only. Null otherwise. */
  rateUnit: RateUnit | null;
  /** Retainer: minor units per unit. Tasks: default price per task. 0 otherwise. */
  rate: number;
  /** Retainer prospects: hours per day times 100. Defaults to 800. */
  hoursPerDay: number;
  /** Retainer prospects: working days per month times 100. Defaults to 2200. */
  daysPerMonth: number;
  stage: ProspectStage;
  lostReason: LostReason | null;
  nextFollowUp: IsoDate | null;
  notes: string;
  convertedClientId: string | null;
  convertedProjectId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
};

export type Project = {
  id: string;
  clientId: string;
  title: string;
  description: string;
  status: ProjectStatus;
  startDate: IsoDate | null;
  deadline: IsoDate | null;
  acceptedAt: Date | null;
  currency: Currency;
  /** Always "fixed" for documents written before engagement kinds existed. */
  kind: ProjectKind;
  /** Fixed projects only. 0 for the other kinds. */
  contractValue: number;
  /** Retainer: what one unit of logged time costs. Tasks: default price per new task. Minor units; 0 otherwise. */
  rate: number;
  /** Retainers only. Null otherwise. */
  rateUnit: RateUnit | null;
  /**
   * Retainers only: the last day of service. Flat (week/month) billing covers
   * periods that start on or before min(today, endDate). Null means ongoing.
   */
  endDate: IsoDate | null;
  /** Retainers: working schedule. Hours per day times 100 (8 is 800). Defaults to 800 for every other document. */
  hoursPerDay: number;
  /** Retainers: working days per month times 100 (22 is 2200). Defaults to 2200. */
  daysPerMonth: number;
  /** True when endDate was set by putting the project on hold or completing it, so going active again may clear it. */
  endDateAuto: boolean;
  revisionAllowance: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** projects/{id}/timeEntries/{id}: one block of logged time on a retainer. */
export type TimeEntry = {
  id: string;
  /** Manila calendar date the work was done. */
  date: IsoDate;
  /** Hours or days, times 100 (7.5 hours is 750). */
  quantityHundredths: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
};

/** projects/{id}/tasks/{id}: one priced task. Owed once it is done. */
export type Task = {
  id: string;
  title: string;
  /** Minor units, billed the moment the task is marked done. */
  price: number;
  status: TaskStatus;
  order: number;
  doneAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Milestone = {
  id: string;
  title: string;
  weight: number;
  order: number;
  done: boolean;
  doneAt: Date | null;
};

export type ScheduleLine = {
  id: string;
  label: string;
  kind: ScheduleKind;
  amountDue: number;
  dueDate: IsoDate;
  order: number;
};

export type Payment = {
  id: string;
  amount: number;
  paidOn: IsoDate;
  method: PaymentMethod;
  receiptPublicId: string | null;
  note: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Money received that is not attached to any project: top-level
 * standalonePayments/{id}. Counts as earnings on the dashboard only.
 */
export type StandalonePayment = {
  id: string;
  /** The client who paid, or null when it was someone else (then payerName says who). */
  clientId: string | null;
  payerName: string;
  note: string;
  currency: Currency;
  amount: number;
  paidOn: IsoDate;
  method: PaymentMethod;
  receiptPublicId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Money spent: top-level expenses/{id}. A recurring expense is a template; the
 * repeats are derived on read (see src/lib/expenses.ts) and never stored.
 */
export type Expense = {
  id: string;
  description: string;
  /** Integer minor units, greater than zero. */
  amount: number;
  currency: Currency;
  /** The date it was spent (the first date for a recurring expense). */
  spentOn: IsoDate;
  category: ExpenseCategory;
  method: ExpenseMethod;
  vendor: string;
  note: string;
  clientId: string | null;
  projectId: string | null;
  recurring: RecurringInterval;
  /** Last day a recurring expense may repeat on, or null to keep repeating. */
  recurringUntil: IsoDate | null;
  receiptPublicId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AgreementSnapshot = {
  scope: string;
  price: number;
  currency: Currency;
  schedule: { label: string; kind: ScheduleKind; amountDue: number; dueDate: IsoDate }[];
  revisionAllowance: number;
  timeline: { startDate: IsoDate | null; deadline: IsoDate | null };
};

export type Agreement = {
  id: string;
  version: number;
  status: AgreementStatus;
  snapshot: AgreementSnapshot;
  pdfPublicId: string;
  pdfHash: string;
  signedPdfPublicId: string | null;
  signedPdfHash: string | null;
  signaturePublicId: string | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  signedAt: Date | null;
  signerName: string | null;
  signerEmail: string | null;
  signerIp: string | null;
  userAgent: string | null;
  createdAt: Date;
};

export type Revision = {
  id: string;
  round: number;
  notes: string;
  attachmentPublicIds: string[];
  status: RevisionStatus;
  billable: boolean;
  price: number | null;
  changeOrderDecidedAt: Date | null;
  requestedAt: Date;
  updatedAt: Date;
};

export type Activity = {
  id: string;
  type: string;
  message: string;
  actor: Actor;
  visibility: Visibility;
  projectId: string | null;
  clientId: string | null;
  prospectId: string | null;
  createdAt: Date;
};

export type AcceptedRule = "signed" | "deposit_paid";

export type Settings = {
  timezone: string;
  acceptedRule: AcceptedRule;
  defaultRevisionAllowance: number;
  businessName: string;
  businessEmail: string;
  agreementTemplate: string;
  /** Manual PHP rates in 1/10000 PHP per 1 unit (56.1234 is 561234). Absent = live. */
  fxOverrides: { USD?: number; GBP?: number };
  /** Optional opening balance per currency in minor units (may be negative). Available money starts from it. */
  openingBalances: { GBP?: number; USD?: number; PHP?: number };
  /** When set, only payments and expenses on or after this date count towards available money. */
  openingBalanceDate: IsoDate | null;
};

/** Standard return shape for every server action. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
