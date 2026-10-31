import Link from "next/link";
import { Layers } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { getSettings } from "@/server/data/settings";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  await requireClient();
  const settings = await getSettings();
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-2 px-4">
          <Link
            href="/portal"
            className="group/brand flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_1px_2px_oklch(0.3_0.12_277/0.4),inset_0_1px_0_oklch(1_0_0/0.2)] transition-transform duration-200 group-hover/brand:scale-105">
              <Layers className="size-4" />
            </span>
            <span className="min-w-0 truncate text-[0.9375rem] font-semibold tracking-tight">{settings.businessName}</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
