import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/session";
import { AdminShell } from "@/components/shell/admin-shell";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdmin();
  const collapsed = (await cookies()).get("pt_sidebar")?.value === "1";
  return (
    <AdminShell email={session.email} defaultCollapsed={collapsed}>
      {children}
    </AdminShell>
  );
}
