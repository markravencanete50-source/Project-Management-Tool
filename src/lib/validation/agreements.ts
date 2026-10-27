import { z } from "zod";

// Pure and safe to import from client components (no server-only code here).

/** Exact consent wording required by the spec. Shown next to the checkbox. */
export const AGREEMENT_CONSENT_TEXT = "I have read and agree to this agreement and consent to sign electronically.";

export const MAX_SIGNATURE_BYTES = 300 * 1024;
export const SIGNATURE_DATA_URL_PREFIX = "data:image/png;base64,";

const docId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, "Invalid id");

export const requestLinkSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address")),
});

export const createAgreementSchema = z.object({
  projectId: docId,
  /** Required to create a new version when a signed agreement already exists (a scope change). */
  confirmScopeChange: z.boolean().optional(),
});

export const sendAgreementSchema = z.object({ projectId: docId, agreementId: docId });

export const inviteSchema = z.object({ clientId: docId });

export const sessionBodySchema = z.object({ idToken: z.string().min(20).max(8192) });

/** Magic link tokens are 32 random bytes in base64url: 43 characters. */
export const clientTokenBodySchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid token") });

export const signBodySchema = z.object({
  projectId: docId,
  agreementId: docId,
  version: z.number().int().positive(),
  pdfHash: z.string().regex(/^[a-f0-9]{64}$/, "Invalid document hash"),
  signerName: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(120, "Name is too long")
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "Name contains invalid characters"),
  signatureDataUrl: z
    .string()
    .startsWith(SIGNATURE_DATA_URL_PREFIX, "Signature must be a PNG image")
    .max(Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 64, "Signature is too large"),
  consent: z.literal(true, { error: "You must agree to sign electronically" }),
});
export type SignBody = z.infer<typeof signBodySchema>;

/**
 * A post-login destination is only ever a path inside the client portal.
 * Anything else (other hosts, protocol-relative URLs, backslashes) becomes null.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  if (!(value === "/portal" || value.startsWith("/portal/"))) return null;
  if (value.includes("\\") || value.includes("//") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://placeholder.invalid");
    if (url.origin !== "https://placeholder.invalid") return null;
  } catch {
    return null;
  }
  return value;
}
