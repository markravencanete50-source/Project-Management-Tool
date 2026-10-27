import { z } from "zod";

export const settingsSchema = z.object({
  acceptedRule: z.enum(["signed", "deposit_paid"]),
  defaultRevisionAllowance: z.number().int("Use a whole number").min(0, "Cannot be negative").max(50, "Keep this at 50 or fewer"),
  businessName: z.string().trim().min(1, "Business name is required").max(120),
  businessEmail: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address"),
  agreementTemplate: z.string().min(20, "The template is too short").max(60000, "The template is too long"),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
