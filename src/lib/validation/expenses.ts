import { z } from "zod";
import { isoDateSchema, todayIso } from "@/lib/dates";
import { latestSpentOn, recurringUntilProblem } from "@/lib/expenses";
import { CURRENCIES } from "@/lib/money";
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, RECURRING_INTERVALS } from "@/lib/types";
import { moneyString } from "@/lib/validation/payments";

const fields = {
  description: z.string().trim().min(1, "Describe what you bought").max(160, "Description is too long"),
  amount: moneyString("Amount"),
  currency: z.enum(CURRENCIES, { error: "Choose a currency" }),
  spentOn: isoDateSchema,
  category: z.enum(EXPENSE_CATEGORIES, { error: "Choose a category" }),
  method: z.enum(EXPENSE_METHODS).default("other"),
  vendor: z.string().trim().max(120, "Vendor is too long").default(""),
  note: z.string().trim().max(500, "Note is too long").default(""),
  clientId: z.string().min(1).max(80).nullable().default(null),
  projectId: z.string().min(1).max(80).nullable().default(null),
  recurring: z.enum(RECURRING_INTERVALS).default("none"),
  recurringUntil: isoDateSchema.nullable().default(null),
  receiptPublicId: z.string().min(1).max(500).nullable().default(null),
};

/** The shared rules: a date no later than tomorrow in Manila, and a sensible stop date. */
function rules<T extends { spentOn: string; recurring: (typeof RECURRING_INTERVALS)[number]; recurringUntil: string | null }>(
  value: T,
  ctx: z.RefinementCtx,
) {
  if (value.spentOn > latestSpentOn(todayIso())) {
    ctx.addIssue({ code: "custom", path: ["spentOn"], message: "The date cannot be in the future" });
  }
  const problem = recurringUntilProblem(value);
  if (problem) ctx.addIssue({ code: "custom", path: ["recurringUntil"], message: problem });
}

export const addExpenseSchema = z.object(fields).superRefine(rules);
export const updateExpenseSchema = z.object({ ...fields, id: z.string().min(1) }).superRefine(rules);
export const deleteExpenseSchema = z.object({ id: z.string().min(1) });

export type AddExpenseInput = z.input<typeof addExpenseSchema>;
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;
export type DeleteExpenseInput = z.input<typeof deleteExpenseSchema>;
