import { startOfManilaDay, todayIso, type IsoDate } from "@/lib/dates";
import { toMinor, type Currency } from "@/lib/money";
import { toHundredths } from "@/lib/billing";
import type { Project, ProjectKind, Prospect, RateUnit } from "@/lib/types";

/** Default working schedule of a retainer, in hundredths: 8 hours a day, 22 days a month. */
export const DEFAULT_HOURS_PER_DAY = 800;
export const DEFAULT_DAYS_PER_MONTH = 2200;

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
  /** Retainer: minor units per unit. Tasks: the default price per new task. */
  rate?: number;
  /** Retainer only: last day of service. */
  endDate?: IsoDate | null;
  /** Retainer only, hundredths of hours. */
  hoursPerDay?: number;
  /** Retainer only, hundredths of days. */
  daysPerMonth?: number;
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
  | "endDate"
  | "endDateAuto"
  | "hoursPerDay"
  | "daysPerMonth"
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
      endDate: null,
      endDateAuto: false,
      hoursPerDay: DEFAULT_HOURS_PER_DAY,
      daysPerMonth: DEFAULT_DAYS_PER_MONTH,
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
    rate: input.rate ?? 0,
    rateUnit: input.kind === "retainer" ? (input.rateUnit ?? "hour") : null,
    endDate: input.kind === "retainer" ? (input.endDate ?? null) : null,
    endDateAuto: false,
    hoursPerDay: input.kind === "retainer" ? (input.hoursPerDay ?? DEFAULT_HOURS_PER_DAY) : DEFAULT_HOURS_PER_DAY,
    daysPerMonth: input.kind === "retainer" ? (input.daysPerMonth ?? DEFAULT_DAYS_PER_MONTH) : DEFAULT_DAYS_PER_MONTH,
    revisionAllowance: 0,
  };
}

/**
 * The project a converted prospect becomes: the same kind as the prospect.
 * Fixed copies the estimated value as the contract value and gets the default
 * revision allowance. Retainers copy rate, unit and currency. Tasks start with
 * an empty task list and copy the default price per task as their rate.
 */
export function prospectProjectInput(
  prospect: Pick<Prospect, "service" | "currency" | "estimatedValue" | "engagementKind" | "rate" | "rateUnit"> &
    Partial<Pick<Prospect, "hoursPerDay" | "daysPerMonth">>,
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
    rate: prospect.engagementKind === "retainer" || prospect.engagementKind === "tasks" ? prospect.rate : undefined,
    rateUnit: prospect.engagementKind === "retainer" ? prospect.rateUnit : undefined,
    hoursPerDay: prospect.engagementKind === "retainer" ? (prospect.hoursPerDay ?? DEFAULT_HOURS_PER_DAY) : undefined,
    daysPerMonth: prospect.engagementKind === "retainer" ? (prospect.daysPerMonth ?? DEFAULT_DAYS_PER_MONTH) : undefined,
  };
}

/** Defaults for a prospect document written before engagement kinds existed. */
export function normalizeProspectEngagement(
  doc: Partial<Pick<Prospect, "engagementKind" | "rate" | "rateUnit" | "hoursPerDay" | "daysPerMonth">>,
): Pick<Prospect, "engagementKind" | "rate" | "rateUnit" | "hoursPerDay" | "daysPerMonth"> {
  const engagementKind = doc.engagementKind ?? "fixed";
  return {
    engagementKind,
    rate: engagementKind === "retainer" || engagementKind === "tasks" ? (doc.rate ?? 0) : 0,
    rateUnit: engagementKind === "retainer" ? (doc.rateUnit ?? "hour") : null,
    hoursPerDay: engagementKind === "retainer" ? (doc.hoursPerDay ?? DEFAULT_HOURS_PER_DAY) : DEFAULT_HOURS_PER_DAY,
    daysPerMonth: engagementKind === "retainer" ? (doc.daysPerMonth ?? DEFAULT_DAYS_PER_MONTH) : DEFAULT_DAYS_PER_MONTH,
  };
}

// ------------------------------------------------- working schedule maths
// All pure. Schedule values are hundredths (8 hours is 800); money is minor units.

/**
 * What a retainer is expected to earn in a month at its rate and schedule.
 * hour: rate * hoursPerDay * daysPerMonth. day: rate * daysPerMonth.
 * week: rate * 52 / 12. month: the rate. Rounded to minor units.
 */
export function expectedMonthly(unit: RateUnit, rate: number, hoursPerDay: number, daysPerMonth: number): number {
  if (!(rate > 0)) return 0;
  switch (unit) {
    case "hour":
      return Math.round((rate * hoursPerDay * daysPerMonth) / 10_000);
    case "day":
      return Math.round((rate * daysPerMonth) / 100);
    case "week":
      return Math.round((rate * 52) / 12);
    case "month":
      return rate;
  }
}

export type EquivalentRates = { hourly: number; daily: number; weekly: number };

/** The same monthly figure expressed per hour, per day and per week. A zero divisor gives 0. */
export function equivalentRates(monthly: number, hoursPerDay: number, daysPerMonth: number): EquivalentRates {
  const hoursPerMonth = (hoursPerDay * daysPerMonth) / 10_000;
  return {
    hourly: hoursPerMonth > 0 ? Math.round(monthly / hoursPerMonth) : 0,
    daily: daysPerMonth > 0 ? Math.round((monthly * 100) / daysPerMonth) : 0,
    weekly: Math.round((monthly * 12) / 52),
  };
}

/** Expected logged quantity in a month, in hundredths of the unit: hours = hpd * dpm, days = dpm. Flat units log nothing. */
export function expectedQuantity(unit: RateUnit, hoursPerDay: number, daysPerMonth: number): number {
  if (unit === "hour") return Math.round((hoursPerDay * daysPerMonth) / 100);
  if (unit === "day") return daysPerMonth;
  return 0;
}

export type MeterState = "none" | "under" | "on_track" | "over";

/** under below 90% of expected, on track from 90% to 110%, over above that. No expectation gives "none". */
export function meterState(logged: number, expected: number): MeterState {
  if (!(expected > 0)) return "none";
  const ratio = logged / expected;
  if (ratio < 0.9) return "under";
  if (ratio <= 1.1) return "on_track";
  return "over";
}

/** What a new time entry starts at: a full working day of hours, or one day. In hundredths. */
export function defaultEntryQuantity(unit: RateUnit, hoursPerDay: number): number {
  return unit === "hour" ? hoursPerDay : unit === "day" ? 100 : 0;
}

/** The estimated-value label for a prospect kind. */
export function estimatedValueLabel(kind: ProjectKind): string {
  return kind === "retainer" ? "Estimated monthly value" : "Estimated project value";
}

/** "/mo" for retainer prospects, nothing otherwise. */
export function valueSuffix(kind: ProjectKind): string {
  return kind === "retainer" ? "/mo" : "";
}

/**
 * The expected monthly figure from form text: rate, hours per day and days per
 * month as typed. Blank schedule fields mean the defaults. Returns null while
 * the rate or a schedule value is missing or out of range.
 */
export function expectedFromInputs(
  unit: RateUnit,
  rateText: string,
  hoursText: string,
  daysText: string,
): { monthly: number; rates: EquivalentRates; hoursPerDay: number; daysPerMonth: number } | null {
  const rate = toMinor(rateText);
  if (rate === null || rate <= 0) return null;
  const hoursPerDay = hoursText.trim() === "" ? DEFAULT_HOURS_PER_DAY : toHundredths(hoursText);
  const daysPerMonth = daysText.trim() === "" ? DEFAULT_DAYS_PER_MONTH : toHundredths(daysText);
  if (hoursPerDay === null || hoursPerDay < 25 || hoursPerDay > 2400) return null;
  if (daysPerMonth === null || daysPerMonth < 50 || daysPerMonth > 3100) return null;
  const monthly = expectedMonthly(unit, rate, hoursPerDay, daysPerMonth);
  return { monthly, rates: equivalentRates(monthly, hoursPerDay, daysPerMonth), hoursPerDay, daysPerMonth };
}
