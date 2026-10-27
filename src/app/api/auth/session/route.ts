import { NextResponse, type NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/auth/session";
import { sessionBodySchema } from "@/lib/validation/agreements";
import { isSameOrigin } from "@/server/auth-helpers";
import { col } from "@/server/data/refs";

export const runtime = "nodejs";

/** An ID token older than this cannot be exchanged for a 14 day session. */
const MAX_AUTH_AGE_SECONDS = 5 * 60;

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function json(body: Record<string, unknown>, status: number) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/**
 * POST { idToken }: exchange a fresh Firebase ID token for the session cookie.
 * Only admins and clients (custom claims set by the server) get a session.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);

  let idToken: string;
  try {
    idToken = sessionBodySchema.parse(await request.json()).idToken;
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const auth = adminAuth();
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    return json({ error: "invalid_token" }, 401);
  }

  const isAdmin = decoded.role === "admin";
  const clientId = typeof decoded.clientId === "string" ? decoded.clientId : null;
  const isClient = decoded.role === "client" && clientId !== null;
  if (!isAdmin && !isClient) return json({ error: "not_authorized" }, 403);

  // Recent sign-in only: a stolen older ID token cannot be turned into a long session.
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof decoded.auth_time !== "number" || nowSeconds - decoded.auth_time > MAX_AUTH_AGE_SECONDS) {
    return json({ error: "recent_sign_in_required" }, 401);
  }

  if (isClient) {
    // The client record must still exist and be active.
    const snap = await col.clients().doc(clientId).get();
    if (!snap.exists || snap.get("archivedAt")) return json({ error: "not_authorized" }, 403);
  }

  let cookie: string;
  try {
    cookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
  } catch {
    return json({ error: "invalid_token" }, 401);
  }

  const res = json({ ok: true, role: isAdmin ? "admin" : "client" }, 200);
  res.cookies.set(SESSION_COOKIE, cookie, { ...cookieBase, maxAge: SESSION_MAX_AGE_MS / 1000 });
  return res;
}

/** DELETE: clear the cookie and revoke the signed-in user's refresh tokens. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) {
    try {
      const auth = adminAuth();
      const decoded = await auth.verifySessionCookie(cookie);
      await auth.revokeRefreshTokens(decoded.uid);
    } catch {
      // Expired or invalid cookie: nothing to revoke.
    }
  }

  const res = json({ ok: true }, 200);
  res.cookies.set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return res;
}
