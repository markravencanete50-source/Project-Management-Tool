import { z } from "zod";
import { isoDateSchema, todayIso } from "@/lib/dates";
import { latestPaidOn, payerProblem } from "@/lib/standalone-payments";
import { CURRENCIES } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/types";
import { moneyString } from "@/lib/validation/payments";

const fields = {
  clientId: z.string().min(1).max(80).nullable().default(null),
  payerName: z.string().trim().max(120, "Name is too long").default(""),
  note: z.string().trim().max(500, "Note is too long").default(""),
  currency: z.enum(CURRENCIES, { error: "Choose a currency" }),
  amount: moneyString("Amount"),
  paidOn: isoDateSchema,
  method: z.enum(PAYMENT_METHODS),
  receiptPublicId: z.string().min(1).max(500).nullable().default(null),
};

/** The shared rules: a payer (client or name) and a date no later than tomorrow in Manila. */
function rules<T extends { clientId: string | null; payerName: string; paidOn: string }>(value: T, ctx: z.RefinementCtx) {
  const problem = payerProblem(value);
  if (problem) ctx.addIssue({ code: "custom", path: ["payerName"], message: problem });
  if (value.paidOn > latestPaidOn(todayIso())) {
    ctx.addIssue({ code: "custom", path: ["paidOn"], message: "The date cannot be in the future" });
  }
}

export const addStandaloneSchema = z.object(fields).superRefine(rules);
export const updateStandaloneSchema = z.object({ ...fields, id: z.string().min(1) }).superRefine(rules);
export const deleteStandaloneSchema = z.object({ id: z.string().min(1) });

export type AddStandaloneInput = z.input<typeof addStandaloneSchema>;
export type UpdateStandaloneInput = z.input<typeof updateStandaloneSchema>;
export type DeleteStandaloneInput = z.input<typeof deleteStandaloneSchema>;
