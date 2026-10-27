import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { env } from "@/lib/env";

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const e = env();
  // Emulator runs (tests, local dev) need no credentials.
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({ projectId: e.FIREBASE_ADMIN_PROJECT_ID });
  }
  if (!e.FIREBASE_ADMIN_CLIENT_EMAIL || !e.FIREBASE_ADMIN_PRIVATE_KEY) {
    throw new Error("FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY are required");
  }
  return initializeApp({
    credential: cert({
      projectId: e.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: e.FIREBASE_ADMIN_CLIENT_EMAIL,
      // Vercel and .env files store the key with literal "\n" sequences.
      privateKey: e.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\n/g, "\n"),
    }),
  });
}

let firestore: Firestore | undefined;

export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore(adminApp());
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}

export function adminAuth() {
  return getAuth(adminApp());
}
