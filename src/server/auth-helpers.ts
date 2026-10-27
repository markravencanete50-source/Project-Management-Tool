import "server-only";
import { randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { appUrl, env } from "@/lib/env";
import { sendAgreementReady, sendSignInLink } from "@/lib/email";
import { sha256Hex } from "@/lib/pdf/hash";
import { safeNextPath } from "@/lib/validation/agreements";
import { col } from "@/server/data/refs";
import type { Client } from "@/lib/types";

// Not a "use server" file on purpose: everything exported here must stay
// uncallable from the browser.

export const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000;
export const LOGIN_LINK_COOLDOWN_MS = 60 * 1000;

/**
 * CSRF guard for POST/DELETE route handlers (server actions already do this).
 * The Origin header must be present and match APP_URL. A missing Origin is
 * refused: browsers always send it on cross-site and same-site POSTs.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(env().APP_URL).origin;
  } catch {
    return false;
  }
}

export type LinkPurpose = "invite" | "login" | "agreement";

/**
 * Create a single-use sign-in link for a client and email it. Only the SHA-256
 * hash of the token is stored; the raw token exists only in the emailed URL.
 * The link is valid for 30 minutes. Returns nothing so callers cannot leak it.
 */
export async function issueClientLink(
  client: Pick<Client, "id" | "name" | "email">,
  purpose: LinkPurpose,
  nextPath?: string,
  projectTitle?: string,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const email = client.email.trim().toLowerCase();
  await col
    .loginTokens()
    .doc(sha256Hex(token))
    .set({
      clientId: client.id,
      email,
      purpose,
      expiresAt: Timestamp.fromMillis(now + LOGIN_TOKEN_TTL_MS),
      usedAt: null,
      nextPath: safeNextPath(nextPath),
      createdAt: Timestamp.fromMillis(now),
    });
  const url = appUrl(`/auth/callback?token=${token}`);
  // Agreement emails name the project; every other purpose uses the generic sign-in email.
  if (purpose === "agreement" && projectTitle) {
    await sendAgreementReady({ to: email, clientName: client.name, projectTitle, url });
  } else {
    await sendSignInLink({ to: email, name: client.name, url, purpose });
  }
}
