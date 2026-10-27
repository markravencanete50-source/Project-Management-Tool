import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { toMinor } from "@/lib/money";
import { PAYMENT_METHODS, SCHEDULE_KINDS } from "@/lib/types";

/** Decimal string from a form to minor units; errors when it is not a valid amount. */
export const moneyString = (label: string, opts: { allowZero?: boolean } = {}) =>
  z
    .string()
    .transform((value, ctx) => {
      const minor = toMinor(value);
      if (minor === null) {
        ctx.addIssue({ code: "custom", message: `${label} must be a valid amount, for example 1500.50` });
        return z.NEVER;
      }
      if (minor === 0 && !opts.allowZero) {
        ctx.addIssue({ code: "custom", message: `${label} must be greater than zero` });
        return z.NEVER;
      }
      return minor;
    });

const idSchema = z.string().min(1);

const paymentFields = {
  projectId: idSchema,
  amount: moneyString("Amount"),
  paidOn: isoDateSchema,
  method: z.enum(PAYMENT_METHODS),
  note: z.string().trim().max(500, "Note is too long").default(""),
  receiptPublicId: z.string().min(1).max(500).nullable().default(null),
};

export const addPaymentSchema = z.object(paymentFields);
export const updatePaymentSchema = z.object({ ...paymentFields, paymentId: idSchema });
export const deletePaymentSchema = z.object({ projectId: idSchema, paymentId: idSchema });

export const MAX_SCHEDULE_LINES = 40;

export const scheduleLineSchema = z.object({
  id: z.string().min(1).nullable().default(null),
  label: z.string().trim().min(1, "Every line needs a label").max(120, "Label is too long"),
  kind: z.enum(SCHEDULE_KINDS),
  amount: moneyString("Line amount"),
  dueDate: isoDateSchema,
});

export const saveScheduleSchema = z
  .object({
    projectId: idSchema,
    contractValue: moneyString("Contract value", { allowZero: true }),
    lines: z.array(scheduleLineSchema).max(MAX_SCHEDULE_LINES, "Too many schedule lines"),
  })
  .superRefine((value, ctx) => {
    if (value.lines.length === 0) return;
    const total = value.lines.reduce((sum, l) => sum + l.amount, 0);
    if (total !== value.contractValue) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Schedule lines must add up to the contract value" });
    }
  });

export type AddPaymentInput = z.input<typeof addPaymentSchema>;
export type UpdatePaymentInput = z.input<typeof updatePaymentSchema>;
export type DeletePaymentInput = z.input<typeof deletePaymentSchema>;
export type SaveScheduleInput = z.input<typeof saveScheduleSchema>;
