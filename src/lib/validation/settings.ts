import { z } from "zod";
import { FX_MAX_UNITS, FX_MIN_UNITS } from "@/lib/fx/overrides";

/** A manual rate in 1/10000 PHP; null (or absent) means use the live rate. */
const fxUnits = z
  .number({ error: "Enter a rate from 0.0001 to 1,000,000 with up to 4 decimals" })
  .int("Use at most 4 decimal places")
  .min(FX_MIN_UNITS, "The rate must be at least 0.0001")
  .max(FX_MAX_UNITS, "The rate must be 1,000,000 or less")
  .nullable()
  .optional();

export const settingsSchema = z.object({
  acceptedRule: z.enum(["signed", "deposit_paid"]),
  defaultRevisionAllowance: z.number().int("Use a whole number").min(0, "Cannot be negative").max(50, "Keep this at 50 or fewer"),
  businessName: z.string().trim().min(1, "Business name is required").max(120),
  businessEmail: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address"),
  agreementTemplate: z.string().min(20, "The template is too short").max(60000, "The template is too long"),
  fxOverrides: z.object({ USD: fxUnits, GBP: fxUnits }),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
