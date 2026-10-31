import "server-only";
import { z } from "zod";

const schema = z.object({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1).optional(),
  // Optional until file storage / email are set up. Features that need them fail with a clear message.
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  // Optional. A personal Wise API token turns on Wise as the dashboard's exchange rate source.
  // Without it the dashboard uses free public mid-market rates.
  WISE_API_TOKEN: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  ADMIN_EMAIL: z.email(),
  APP_URL: z.url(),
  CRON_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Validated server environment. Parsed lazily on first use so `next build`
 * succeeds before secrets are configured; any request that needs a missing
 * value fails loudly with the variable name.
 */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Missing or invalid environment variables: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function appUrl(path = "/"): string {
  return new URL(path, env().APP_URL).toString();
}
