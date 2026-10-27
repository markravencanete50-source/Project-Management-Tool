import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, db } from "@/lib/firebase/admin";
import { sha256Hex } from "@/lib/pdf/hash";
import { clientTokenBodySchema, safeNextPath } from "@/lib/validation/agreements";
import { isSameOrigin } from "@/server/auth-helpers";
import { logActivity } from "@/server/activity";
import { col } from "@/server/data/refs";

export const runtime = "nodejs";

type Failure = "invalid" | "expired" | "used";

function json(body: Record<string, unknown>, status: number) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/**
 * POST { token }: redeem a magic link token. The token is looked up by its
 * SHA-256 hash and marked used in the same transaction that checks it, so it
 * can be redeemed exactly once. Returns a Firebase custom token for the browser
 * to sign in with, then exchange for the session cookie at /api/auth/session.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);

  let token: string;
  try {
    token = clientTokenBodySchema.parse(await request.json()).token;
  } catch {
    return json({ error: "invalid" }, 400);
  }

  const tokenRef = col.loginTokens().doc(sha256Hex(token));
  const redeemed = await db().runTransaction(
    async (tx): Promise<{ failure: Failure } | { clientId: string; email: string; nextPath: string | null }> => {
      const snap = await tx.get(tokenRef);
      if (!snap.exists) return { failure: "invalid" };
      const data = snap.data() as {
        clientId?: unknown;
        email?: unknown;
        expiresAt?: Timestamp;
        usedAt?: Timestamp | null;
        nextPath?: unknown;
      };
      if (typeof data.clientId !== "string" || typeof data.email !== "string" || !data.expiresAt) return { failure: "invalid" };
      if (data.usedAt) return { failure: "used" };
      if (data.expiresAt.toMillis() < Date.now()) return { failure: "expired" };

      // The client must still exist, be active, and still own the address the link was sent to.
      const clientSnap = await tx.get(col.clients().doc(data.clientId));
      if (!clientSnap.exists) return { failure: "invalid" };
      const client = clientSnap.data() as { email?: string; archivedAt?: Timestamp | null };
      if (client.archivedAt || (client.email ?? "").toLowerCase() !== data.email.toLowerCase()) return { failure: "invalid" };

      tx.update(tokenRef, { usedAt: Timestamp.now() });
      return { clientId: data.clientId, email: data.email.toLowerCase(), nextPath: safeNextPath(data.nextPath) };
    },
  );

  if ("failure" in redeemed) return json({ error: redeemed.failure }, 400);

  try {
    const auth = adminAuth();
    const clientRef = col.clients().doc(redeemed.clientId);
    const clientSnap = await clientRef.get();
    const clientName = (clientSnap.get("name") as string | undefined) ?? "";
    const knownUid = clientSnap.get("authUid") as string | null | undefined;

    // Find the Auth user: by the saved uid, else by email, else create one.
    let user = null;
    if (knownUid) {
      try {
        const byUid = await auth.getUser(knownUid);
        if ((byUid.email ?? "").toLowerCase() === redeemed.email) user = byUid;
      } catch (err) {
        if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      }
    }
    if (!user) {
      try {
        user = await auth.getUserByEmail(redeemed.email);
      } catch (err) {
        if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
        user = await auth.createUser({ email: redeemed.email, emailVerified: true, displayName: clientName || undefined });
      }
    }

    // Never turn another kind of account (the admin) into a client, and never sign in disabled users.
    const existingRole = (user.customClaims as { role?: string } | undefined)?.role;
    if (user.disabled || (existingRole !== undefined && existingRole !== "client")) {
      return json({ error: "account_conflict" }, 409);
    }

    await auth.setCustomUserClaims(user.uid, { role: "client", clientId: redeemed.clientId });
    const customToken = await auth.createCustomToken(user.uid, { role: "client", clientId: redeemed.clientId });

    if (knownUid !== user.uid) {
      const batch = db().batch();
      batch.update(clientRef, { authUid: user.uid });
      logActivity(batch, {
        type: "client.portal_account_linked",
        message: `Portal account linked for ${clientName || "client"}`,
        actor: "system",
        visibility: "internal",
        clientId: redeemed.clientId,
      });
      await batch.commit();
    }

    return json({ customToken, nextPath: redeemed.nextPath }, 200);
  } catch (err) {
    console.error("client-token failed", err);
    return json({ error: "failed" }, 500);
  }
}
