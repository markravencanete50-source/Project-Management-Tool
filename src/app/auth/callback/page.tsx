import type { Metadata } from "next";
import { CallbackClient } from "@/components/auth/callback-client";
import { AuthShell } from "@/components/auth/auth-shell";

// The one-time token is in the URL: never send it on as a referrer.
export const metadata: Metadata = { title: "Signing in", referrer: "no-referrer" };

export default async function CallbackPage({ searchParams }: PageProps<"/auth/callback">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : null;
  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Client sign-in</h1>
          <p className="text-sm text-muted-foreground">One moment while we open your portal.</p>
        </div>
        <CallbackClient token={value} />
      </div>
    </AuthShell>
  );
}
