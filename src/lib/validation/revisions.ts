import { z } from "zod";
import { toMinor } from "@/lib/money";

export const MAX_REVISION_ATTACHMENTS = 5;

export const revisionNotesSchema = z
  .string()
  .trim()
  .min(1, "Describe the changes you would like")
  .max(5000, "Notes must be 5000 characters or fewer");

export const requestRevisionSchema = z.object({
  projectId: z.string().min(1),
  notes: revisionNotesSchema,
  attachmentIds: z.array(z.string().min(1).max(500)).max(MAX_REVISION_ATTACHMENTS, `Attach at most ${MAX_REVISION_ATTACHMENTS} files`),
});

/** Form value for the notes field (client form). */
export const requestRevisionFormSchema = z.object({ notes: revisionNotesSchema });
export type RequestRevisionFormValues = z.infer<typeof requestRevisionFormSchema>;

export const priceSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const minor = toMinor(value);
    if (minor === null || minor <= 0) {
      ctx.addIssue({ code: "custom", message: "Enter a price greater than zero, like 250 or 250.50" });
      return z.NEVER;
    }
    return minor;
  });

export const setQuoteSchema = z.object({
  projectId: z.string().min(1),
  revisionId: z.string().min(1),
  price: priceSchema,
});

export const decideChangeOrderSchema = z.object({
  projectId: z.string().min(1),
  revisionId: z.string().min(1),
  approve: z.boolean(),
});

export const setRevisionStatusSchema = z.object({
  projectId: z.string().min(1),
  revisionId: z.string().min(1),
  status: z.enum(["in_progress", "delivered", "approved", "cancelled"]),
});
