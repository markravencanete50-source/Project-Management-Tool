import { getApps, initializeApp } from "firebase/app";
import { getAuth, inMemoryPersistence, setPersistence, type Auth } from "firebase/auth";

// The browser uses Firebase only to sign in. The session lives in an httpOnly
// cookie, so the SDK keeps nothing on disk.
let auth: Auth | undefined;

export function clientAuth(): Auth {
  if (!auth) {
    const app =
      getApps()[0] ??
      initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
    auth = getAuth(app);
    void setPersistence(auth, inMemoryPersistence);
  }
  return auth;
}
