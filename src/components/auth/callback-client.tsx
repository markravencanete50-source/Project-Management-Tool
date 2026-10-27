"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { Loader2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ClientLinkForm } from "@/components/auth/client-link-form";
import { clientAuth } from "@/lib/firebase/client";

type Failure = "expired" | "used" | "invalid" | "conflict" | "failed";

const COPY: Record<Failure, { title: string; body: string }> = {
  expired: { title: "This link has expired", body: "Sign-in links work for 30 minutes. Request a new one below." },
  used: { title: "This link has already been used", body: "Each link works once. Request a new one below." },
  invalid: { title: "This link is not valid", body: "It may have been copied incompletely. Request a new one below." },
  conflict: { title: "We could not sign you in", body: "This email address cannot be used for the client portal. Please contact your developer." },
  failed: { title: "Something went wrong", body: "We could not complete sign-in. Request a new link below and try again." },
};

type Outcome = { nextPath: string } | { failure: Failure };

// A token can be redeemed once, and React Strict Mode runs effects twice in
// development, so the exchange is shared per token.
const inflight = new Map<string, Promise<Outcome>>();

async function exchange(token: string): Promise<Outcome> {
  try {
    const tokenRes = await fetch("/api/auth/client-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!tokenRes.ok) {
      const data = (await tokenRes.json().catch(() => ({}))) as { error?: string };
      if (data.error === "expired" || data.error === "used" || data.error === "invalid") return { failure: data.error };
      return { failure: data.error === "account_conflict" ? "conflict" : "failed" };
    }
    const { customToken, nextPath } = (await tokenRes.json()) as { customToken: string; nextPath: string | null };

    const credential = await signInWithCustomToken(clientAuth(), customToken);
    const idToken = await credential.user.getIdToken();
    const sessionRes = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!sessionRes.ok) return { failure: "failed" };
    return { nextPath: nextPath ?? "/portal" };
  } catch {
    return { failure: "failed" };
  } finally {
    // The cookie is the only session; drop the browser SDK's copy.
    await signOut(clientAuth()).catch(() => undefined);
  }
}

export function CallbackClient({ token }: { token: string | null }) {
  const router = useRouter();
  const [failure, setFailure] = useState<Failure | null>(token ? null : "invalid");

  useEffect(() => {
    if (!token) return;
    // Keep the one-time token out of the address bar and history.
    window.history.replaceState(null, "", "/auth/callback");
    let promise = inflight.get(token);
    if (!promise) {
      promise = exchange(token);
      inflight.set(token, promise);
    }
    let active = true;
    void promise.then((outcome) => {
      if (!active) return;
      if ("failure" in outcome) {
        setFailure(outcome.failure);
        return;
      }
      router.replace(outcome.nextPath);
      router.refresh();
    });
    return () => {
      active = false;
    };
  }, [token, router]);

  if (!failure) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    );
  }

  const copy = COPY[failure];
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription>{copy.body}</AlertDescription>
      </Alert>
      {failure !== "conflict" ? <ClientLinkForm submitLabel="Email me a new link" /> : null}
    </div>
  );
}
