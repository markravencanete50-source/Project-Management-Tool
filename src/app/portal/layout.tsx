import Link from "next/link";
import { requireClient } from "@/lib/auth/session";
import { getSettings } from "@/server/data/settings";
import { SignOutButton } from "@/components/shell/sign-out-button";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  await requireClient();
  const settings = await getSettings();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-2 px-4">
          <Link href="/portal" className="min-w-0 truncate text-base font-semibold tracking-tight">
            {settings.businessName}
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl p-4 md:p-8">{children}</main>
    </div>
  );
}
