import { z } from "zod";
import { CURRENCIES } from "@/lib/money";

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  company: z.string().trim().max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  defaultCurrency: z.enum(CURRENCIES),
  notes: z.string().trim().max(5000),
});

export type ClientInput = z.input<typeof clientSchema>;
export type ClientData = z.output<typeof clientSchema>;
