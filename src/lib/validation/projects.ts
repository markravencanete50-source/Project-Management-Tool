import { z } from "zod";
import { CURRENCIES, toMinor } from "@/lib/money";
import { isoDateSchema } from "@/lib/dates";
import { MANUAL_PROJECT_STATUSES, RATE_UNITS } from "@/lib/types";
import { toHundredths } from "@/lib/billing";
import { DEFAULT_DAYS_PER_MONTH, DEFAULT_HOURS_PER_DAY } from "@/lib/engagement";

/** Optional date-only field: empty string means "not set". */
const optionalDate = z
  .union([z.literal(""), isoDateSchema])
  .transform((v): string | null => (v === "" ? null : v));

/** Whole number typed into a text input. */
const wholeNumber = (label: string, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be a whole number`)
    .transform(Number)
    .refine((n) => n <= max, `${label} must be ${max} or less`);

/** Decimal money string to integer minor units. */
const moneyString = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const minor = toMinor(s);
    if (minor === null) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount, for example 1500.50" });
      return z.NEVER;
    }
    return minor;
  });

function datesInOrder(v: { startDate: string | null; deadline: string | null }) {
  return !v.startDate || !v.deadline || v.deadline >= v.startDate;
}
const datesMessage = { message: "Deadline cannot be before the start date", path: ["deadline"] };

const createCommon = {
  clientId: z.string().min(1, "Choose a client"),
  title: z.string().trim().min(1, "Title is required").max(160),
  description: z.string().trim().max(5000),
  currency: z.enum(CURRENCIES),
  startDate: optionalDate,
  deadline: optionalDate,
};

/** A rate per hour or day. Must be above zero. */
const rateString = moneyString.refine((n) => n > 0, "Rate must be greater than zero");

/**
 * The default price per new task. Blank means none (0). Not negative. It only
 * prefills new tasks and never reprices existing ones.
 */
const defaultTaskPrice = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (s === "") return 0;
    const minor = toMinor(s);
    if (minor === null) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount, for example 500.00" });
      return z.NEVER;
    }
    return minor;
  });

/** A schedule value typed as a decimal, stored as hundredths. Blank means the default. */
const scheduleField = (label: string, min: number, max: number, fallback: number) =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (s === "") return fallback;
      const h = toHundredths(s);
      if (h === null || h < min * 100 || h > max * 100) {
        ctx.addIssue({ code: "custom", message: `${label} must be a number from ${min} to ${max}` });
        return z.NEVER;
      }
      return h;
    });
/** Hours worked per day, 0.25 to 24 (default 8). */
export const hoursPerDayField = scheduleField("Hours per day", 0.25, 24, DEFAULT_HOURS_PER_DAY);
/** Days worked per month, 0.5 to 31 (default 22). */
export const daysPerMonthField = scheduleField("Days per month", 0.5, 31, DEFAULT_DAYS_PER_MONTH);

const fixedCreate = z
  .object({
    ...createCommon,
    kind: z.literal("fixed"),
    contractValue: moneyString,
    revisionAllowance: wholeNumber("Revision allowance", 50),
  })
  .refine(datesInOrder, datesMessage);

/** Retainers: the last day of service. Blank means ongoing. */
const endDateMessage = { message: "Last day of service cannot be before the start date", path: ["endDate"] };
function endAfterStart(v: { startDate: string | null; endDate?: string | null }) {
  return !v.startDate || !v.endDate || v.endDate >= v.startDate;
}

const retainerCreate = z
  .object({
    ...createCommon,
    kind: z.literal("retainer"),
    rateUnit: z.enum(RATE_UNITS),
    rate: rateString,
    hoursPerDay: hoursPerDayField.optional(),
    daysPerMonth: daysPerMonthField.optional(),
    endDate: optionalDate.optional(),
  })
  .refine(datesInOrder, datesMessage)
  .refine(endAfterStart, endDateMessage);

const tasksCreate = z
  .object({ ...createCommon, kind: z.literal("tasks"), rate: defaultTaskPrice.optional() })
  .refine(datesInOrder, datesMessage);

/** Input without a kind is a fixed project, so older callers keep working. */
function defaultKind(value: unknown): unknown {
  return value && typeof value === "object" && !("kind" in value) ? { kind: "fixed", ...value } : value;
}

export const projectCreateSchema = z.preprocess(
  defaultKind,
  z.discriminatedUnion("kind", [fixedCreate, retainerCreate, tasksCreate]),
);

/** Edit never touches contractValue, status, client or currency. This is the fixed project shape. */
export const projectUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(160),
    description: z.string().trim().max(5000),
    revisionAllowance: wholeNumber("Revision allowance", 50),
    startDate: optionalDate,
    deadline: optionalDate,
  })
  .refine(datesInOrder, datesMessage);

/** Retainers can also change the rate, unit and last day of service. A typed end date is the owner's, never auto-cleared. Task projects have no revision allowance. */
export const retainerUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(160),
    description: z.string().trim().max(5000),
    rateUnit: z.enum(RATE_UNITS),
    rate: rateString,
    startDate: optionalDate,
    deadline: optionalDate,
    hoursPerDay: hoursPerDayField.optional(),
    daysPerMonth: daysPerMonthField.optional(),
    endDate: optionalDate.optional(),
  })
  .refine(datesInOrder, datesMessage)
  .refine(endAfterStart, endDateMessage);

/** Task projects can also change the default price per task (it never reprices existing tasks). */
export const tasksUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(160),
    description: z.string().trim().max(5000),
    rate: defaultTaskPrice.optional(),
    startDate: optionalDate,
    deadline: optionalDate,
  })
  .refine(datesInOrder, datesMessage);

export const projectStatusSchema = z.enum(MANUAL_PROJECT_STATUSES);

export const milestonesSchema = z
  .array(
    z.object({
      id: z.string().min(1).optional(),
      title: z.string().trim().min(1, "Every milestone needs a title").max(160),
      weight: z.number({ error: "Weight must be a number" }).int("Weights must be whole numbers").positive("Weights must be above zero"),
    }),
  )
  .max(50, "Too many milestones");

export type ProjectCreateInput = z.input<typeof fixedCreate> | z.input<typeof retainerCreate> | z.input<typeof tasksCreate>;
export type ProjectCreateOutput = z.output<typeof fixedCreate> | z.output<typeof retainerCreate> | z.output<typeof tasksCreate>;
export type ProjectUpdateInput = z.input<typeof projectUpdateSchema>;
export type RetainerUpdateInput = z.input<typeof retainerUpdateSchema>;
export type TasksUpdateInput = z.input<typeof tasksUpdateSchema>;
export type MilestoneInput = z.input<typeof milestonesSchema>[number];
