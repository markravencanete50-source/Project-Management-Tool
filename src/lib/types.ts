import type { Currency } from "@/lib/money";
import type { IsoDate } from "@/lib/dates";

// Document shapes as returned by the data layer: Firestore Timestamps are
// converted to Date, and every document carries its id. Money is always an
// integer in minor units.

export const PROSPECT_SOURCES = ["referral", "upwork", "linkedin", "cold_outreach", "website", "other"] as const;
export type ProspectSource = (typeof PROSPECT_SOURCES)[number];

export const PROSPECT_STAGES = ["new", "contacted", "proposal_sent", "negotiating", "won", "lost"] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number];

export const LOST_REASONS = ["price", "timing", "no_response", "went_elsewhere", "other"] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const PROJECT_STATUSES = ["draft", "agreement_sent", "active", "on_hold", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
/** Statuses the admin may set by hand. draft and agreement_sent are set by flows. */
export const MANUAL_PROJECT_STATUSES = ["active", "on_hold", "completed", "cancelled"] as const;

export const SCHEDULE_KINDS = ["deposit", "milestone", "final", "change_order"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const PAYMENT_METHODS = ["bank", "paypal", "wise", "gcash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

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
  estimatedValue: number;
  currency: Currency;
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
  contractValue: number;
  revisionAllowance: number;
  archivedAt: Date | null;
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
};

/** Standard return shape for every server action. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
