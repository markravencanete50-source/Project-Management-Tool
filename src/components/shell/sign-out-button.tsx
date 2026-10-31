"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Shared sign out: clears the session cookie, then goes to the login page. */
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      const res = await fetch("/api/auth/session", { method: "DELETE" });
      if (!res.ok) throw new Error("Sign out failed");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Could not sign out. Please try again.");
      setPending(false);
    }
  }

  return { signOut, pending };
}

export function SignOutButton({ className, variant = "ghost" }: { className?: string; variant?: "ghost" | "outline" }) {
  const { signOut, pending } = useSignOut();

  return (
    <Button variant={variant} className={className} onClick={signOut} disabled={pending}>
      <LogOut data-icon="inline-start" />
      Sign out
    </Button>
  );
}
