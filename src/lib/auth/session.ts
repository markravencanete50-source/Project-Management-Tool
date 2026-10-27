import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase/admin";

export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

// "staff" can be added here later; every check below goes through these types.
export type AdminSession = { role: "admin"; uid: string; email: string | null };
export type ClientSession = { role: "client"; uid: string; email: string | null; clientId: string };
export type Session = AdminSession | ClientSession;

export const getSession = cache(async (): Promise<Session | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const token = await adminAuth().verifySessionCookie(cookie, true);
    const email = token.email ?? null;
    if (token.role === "admin") return { role: "admin", uid: token.uid, email };
    if (token.role === "client" && typeof token.clientId === "string") {
      return { role: "client", uid: token.uid, email, clientId: token.clientId };
    }
    return null;
  } catch {
    return null;
  }
});

/** Use at the top of every admin page, loader, and server action. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");
  return session;
}

/** Use at the top of every portal page, loader, and server action. */
export async function requireClient(): Promise<ClientSession> {
  const session = await getSession();
  if (!session || session.role !== "client") redirect("/login");
  return session;
}

/** Admin or the owning client. */
export async function requireAny(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
