/**
 * Grant the admin claim to a Firebase Auth user.
 *   pnpm set-admin you@example.com
 * Reads FIREBASE_ADMIN_* from .env.local. Sign in with Google once first so the
 * user exists, then sign out and back in after running this.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: pnpm set-admin <email>");
  const { FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } = process.env;
  if (!FIREBASE_ADMIN_PROJECT_ID || !FIREBASE_ADMIN_CLIENT_EMAIL || !FIREBASE_ADMIN_PRIVATE_KEY) {
    throw new Error("FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY must be set");
  }
  initializeApp({
    credential: cert({
      projectId: FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\n/g, "\n"),
    }),
  });
  const auth = getAuth();
  const user = await auth.getUserByEmail(email.toLowerCase());
  await auth.setCustomUserClaims(user.uid, { role: "admin" });
  await auth.revokeRefreshTokens(user.uid);
  console.log(`Admin claim set for ${user.email} (${user.uid}). Sign in again to pick it up.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
