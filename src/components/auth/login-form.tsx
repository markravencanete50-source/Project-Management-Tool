"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ClientLinkForm } from "@/components/auth/client-link-form";
import { clientAuth } from "@/lib/firebase/client";

const IGNORED_POPUP_ERRORS = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setError(null);
    setBusy(true);
    try {
      const credential = await signInWithPopup(clientAuth(), new GoogleAuthProvider());
      const idToken = await credential.user.getIdToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (res.status === 403) {
        setError("This Google account is not an admin account. Clients sign in with the email link below.");
        return;
      }
      if (!res.ok) {
        setError("Sign-in failed. Please try again.");
        return;
      }
      const data = (await res.json()) as { role?: string };
      router.replace(data.role === "admin" ? "/admin" : "/portal");
      router.refresh();
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (IGNORED_POPUP_ERRORS.has(code)) return;
      setError(code === "auth/popup-blocked" ? "The sign-in popup was blocked. Allow popups for this site and try again." : "Sign-in failed. Please try again.");
    } finally {
      // The cookie is the only session; drop the browser SDK's copy.
      await signOut(clientAuth()).catch(() => undefined);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Admin</h2>
        <Button type="button" size="lg" className="w-full" onClick={signInWithGoogle} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <GoogleMark />}
          {busy ? "Signing in..." : "Sign in with Google"}
        </Button>
        {error ? (
          <Alert variant="destructive" className="enter-fade">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <Separator className="flex-1" />
        <span>or</span>
        <Separator className="flex-1" />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Client portal</h2>
        <p className="text-sm text-muted-foreground">Enter the email address we have for you and we will send a sign-in link.</p>
        <ClientLinkForm />
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-icon="inline-start" className="size-4">
      <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.6 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.7 14.55 2.8 12 2.8 6.93 2.8 2.8 6.93 2.8 12S6.93 21.2 12 21.2c5.27 0 8.76-3.7 8.76-8.92 0-.6-.07-1.06-.16-1.18z" />
    </svg>
  );
}
