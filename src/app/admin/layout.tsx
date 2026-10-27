import { requireAdmin } from "@/lib/auth/session";
import { AdminShell } from "@/components/shell/admin-shell";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
