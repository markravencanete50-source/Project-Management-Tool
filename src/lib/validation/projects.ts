import { z } from "zod";
import { CURRENCIES, toMinor } from "@/lib/money";
import { isoDateSchema } from "@/lib/dates";
import { MANUAL_PROJECT_STATUSES, RATE_UNITS } from "@/lib/types";

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

const fixedCreate = z
  .object({
    ...createCommon,
    kind: z.literal("fixed"),
    contractValue: moneyString,
    revisionAllowance: wholeNumber("Revision allowance", 50),
  })
  .refine(datesInOrder, datesMessage);

const retainerCreate = z
  .object({
    ...createCommon,
    kind: z.literal("retainer"),
    rateUnit: z.enum(RATE_UNITS),
    rate: rateString,
  })
  .refine(datesInOrder, datesMessage);

const tasksCreate = z.object({ ...createCommon, kind: z.literal("tasks") }).refine(datesInOrder, datesMessage);

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

/** Retainers can also change the rate. Task projects have no revision allowance. */
export const retainerUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(160),
    description: z.string().trim().max(5000),
    rateUnit: z.enum(RATE_UNITS),
    rate: rateString,
    startDate: optionalDate,
    deadline: optionalDate,
  })
  .refine(datesInOrder, datesMessage);

export const tasksUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(160),
    description: z.string().trim().max(5000),
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
