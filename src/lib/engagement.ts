import { startOfManilaDay, todayIso, type IsoDate } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import type { Project, ProjectKind, Prospect, RateUnit } from "@/lib/types";

// Pure rules for creating projects of each engagement kind. The server actions
// (create project, convert prospect) call these so the rules are unit tested.

export type NewProjectInput = {
  kind: ProjectKind;
  clientId: string;
  title: string;
  description: string;
  currency: Currency;
  startDate: IsoDate | null;
  deadline: IsoDate | null;
  /** Fixed only. */
  contractValue?: number;
  /** Fixed only. */
  revisionAllowance?: number;
  /** Retainer only. */
  rateUnit?: RateUnit | null;
  /** Retainer only, minor units per unit. */
  rate?: number;
};

export type NewProjectFields = Pick<
  Project,
  | "clientId"
  | "title"
  | "description"
  | "status"
  | "kind"
  | "startDate"
  | "deadline"
  | "acceptedAt"
  | "currency"
  | "contractValue"
  | "rate"
  | "rateUnit"
  | "revisionAllowance"
>;

/**
 * The stored fields of a brand new project (timestamps and archivedAt are
 * added by the writer).
 *
 * fixed: a draft with no acceptance, exactly as before.
 * retainer and tasks: no agreement step, so they start active and are accepted
 * on their start date (today when none is given, which is then stored too).
 */
export function newProjectFields(input: NewProjectInput, now: Date = new Date()): NewProjectFields {
  const common = {
    clientId: input.clientId,
    title: input.title,
    description: input.description,
    currency: input.currency,
    deadline: input.deadline,
  };
  if (input.kind === "fixed") {
    return {
      ...common,
      status: "draft",
      kind: "fixed",
      startDate: input.startDate,
      acceptedAt: null,
      contractValue: input.contractValue ?? 0,
      rate: 0,
      rateUnit: null,
      revisionAllowance: input.revisionAllowance ?? 0,
    };
  }
  const startDate = input.startDate ?? todayIso(now);
  return {
    ...common,
    status: "active",
    kind: input.kind,
    startDate,
    acceptedAt: startOfManilaDay(startDate),
    contractValue: 0,
    rate: input.kind === "retainer" ? (input.rate ?? 0) : 0,
    rateUnit: input.kind === "retainer" ? (input.rateUnit ?? "hour") : null,
    revisionAllowance: 0,
  };
}

/**
 * The project a converted prospect becomes: the same kind as the prospect.
 * Fixed copies the estimated value as the contract value and gets the default
 * revision allowance. Retainers copy rate, unit and currency. Tasks start with
 * an empty task list.
 */
export function prospectProjectInput(
  prospect: Pick<Prospect, "service" | "currency" | "estimatedValue" | "engagementKind" | "rate" | "rateUnit">,
  clientId: string,
  defaultRevisionAllowance: number,
): NewProjectInput {
  return {
    kind: prospect.engagementKind,
    clientId,
    title: prospect.service.trim() || "New project",
    description: "",
    currency: prospect.currency,
    startDate: null,
    deadline: null,
    contractValue: prospect.engagementKind === "fixed" ? prospect.estimatedValue : undefined,
    revisionAllowance: prospect.engagementKind === "fixed" ? defaultRevisionAllowance : undefined,
    rate: prospect.engagementKind === "retainer" ? prospect.rate : undefined,
    rateUnit: prospect.engagementKind === "retainer" ? prospect.rateUnit : undefined,
  };
}

/** Defaults for a prospect document written before engagement kinds existed. */
export function normalizeProspectEngagement(
  doc: Partial<Pick<Prospect, "engagementKind" | "rate" | "rateUnit">>,
): Pick<Prospect, "engagementKind" | "rate" | "rateUnit"> {
  const engagementKind = doc.engagementKind ?? "fixed";
  return {
    engagementKind,
    rate: engagementKind === "retainer" ? (doc.rate ?? 0) : 0,
    rateUnit: engagementKind === "retainer" ? (doc.rateUnit ?? "hour") : null,
  };
}

/** The estimated-value label for a prospect kind. */
export function estimatedValueLabel(kind: ProjectKind): string {
  return kind === "retainer" ? "Estimated monthly value" : "Estimated project value";
}

/** "/mo" for retainer prospects, nothing otherwise. */
export function valueSuffix(kind: ProjectKind): string {
  return kind === "retainer" ? "/mo" : "";
}
