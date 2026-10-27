import type { Metadata } from "next";
import { CallbackClient } from "@/components/auth/callback-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The one-time token is in the URL: never send it on as a referrer.
export const metadata: Metadata = { title: "Signing in", referrer: "no-referrer" };

export default async function CallbackPage({ searchParams }: PageProps<"/auth/callback">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Client sign-in</CardTitle>
        </CardHeader>
        <CardContent>
          <CallbackClient token={value} />
        </CardContent>
      </Card>
    </main>
  );
}
