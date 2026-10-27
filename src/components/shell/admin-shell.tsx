"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminNav } from "@/components/shell/admin-nav";
import { SignOutButton } from "@/components/shell/sign-out-button";

const BRAND = "Project Tracker";

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r bg-card p-4 md:flex">
        <div className="px-3 py-2 text-base font-semibold tracking-tight">{BRAND}</div>
        <AdminNav />
        <SignOutButton className="mt-auto justify-start" />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
          <span className="text-base font-semibold tracking-tight">{BRAND}</span>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
              <Menu />
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>{BRAND}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
                <AdminNav onNavigate={() => setOpen(false)} />
                <SignOutButton className="mt-auto justify-start" />
              </div>
            </SheetContent>
          </Sheet>
        </header>
        <main className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
