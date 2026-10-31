import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/auth-shell";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
