import { z } from "zod";
import { CURRENCIES, toMinor } from "@/lib/money";
import { isoDateSchema } from "@/lib/dates";
import { LOST_REASONS, PROSPECT_SOURCES, PROSPECT_STAGES } from "@/lib/types";

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .refine((s) => s === "" || z.email().safeParse(s).success, "Enter a valid email address");

const moneyField = z.string().transform((s, ctx) => {
  if (s.trim() === "") return 0;
  const minor = toMinor(s);
  if (minor === null) {
    ctx.addIssue({ code: "custom", message: "Enter an amount like 1500 or 1500.50" });
    return z.NEVER;
  }
  return minor;
});

const followUpField = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (s === "") return null;
    const parsed = isoDateSchema.safeParse(s);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    return parsed.data;
  });

/** Form input: every field is a string as typed. Output has estimatedValue in minor units. */
export const prospectInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  company: z.string().trim().max(200),
  email: emailField,
  source: z.enum(PROSPECT_SOURCES),
  service: z.string().trim().max(200),
  estimatedValue: moneyField,
  currency: z.enum(CURRENCIES),
  nextFollowUp: followUpField,
  notes: z.string().max(10000),
});
export type ProspectFormValues = z.input<typeof prospectInputSchema>;
export type ProspectInput = z.output<typeof prospectInputSchema>;

export const prospectIdSchema = z.string().min(1).max(200);

export const moveStageSchema = z
  .object({
    id: prospectIdSchema,
    stage: z.enum(PROSPECT_STAGES),
    lostReason: z.enum(LOST_REASONS).nullish(),
  })
  .refine((v) => v.stage !== "lost" || !!v.lostReason, { message: "Choose a reason for losing this prospect" });
