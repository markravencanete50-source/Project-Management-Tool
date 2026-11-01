"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Layers, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminNav, NAV_ITEMS } from "@/components/shell/admin-nav";
import { RecordPaymentHost } from "@/components/payments/record-payment";
import { CommandPalette } from "@/components/shell/command-palette";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { cn } from "@/lib/utils";

const BRAND = "Project Tracker";
const COLLAPSE_COOKIE = "pt_sidebar";

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/admin"
      aria-label={BRAND}
      className={cn(
        "flex h-10 items-center gap-2.5 rounded-lg px-1.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        collapsed && "justify-center px-0",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_1px_2px_oklch(0.3_0.12_277/0.4),inset_0_1px_0_oklch(1_0_0/0.2)]">
        <Layers className="size-4" />
      </span>
      {collapsed ? null : <span className="truncate text-[0.9375rem] font-semibold tracking-tight">{BRAND}</span>}
    </Link>
  );
}

/** Builds a breadcrumb trail from the URL. Dynamic ids show as "Details". */
function useCrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean).slice(1); // drop "admin"
  if (parts.length === 0) return [{ label: "Dashboard", href: "/admin" }];
  const section = NAV_ITEMS.find((n) => n.href === `/admin/${parts[0]}`);
  const crumbs = [{ label: section?.label ?? "Page", href: `/admin/${parts[0]}` }];
  if (parts[1]) crumbs.push({ label: parts[1] === "new" ? "New" : "Details", href: pathname });
  return crumbs;
}

function Topbar({ menu, onSearch }: { menu: ReactNode; onSearch: () => void }) {
  const crumbs = useCrumbs();
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md supports-backdrop-filter:bg-background/70 md:px-6">
      {menu}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex min-w-0 items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" /> : null}
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="truncate font-medium">
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search pages and actions"
          className="group/search hidden h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-[border-color,box-shadow,color] duration-150 outline-none hover:border-ring/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:flex sm:w-56"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] leading-none">Ctrl K</kbd>
        </button>
        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search pages and actions" onClick={onSearch}>
          <Search />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function AdminShell({
  children,
  email = null,
  defaultCollapsed = false,
}: {
  children: ReactNode;
  email?: string | null;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className="flex min-h-dvh">
      <aside
        data-collapsed={collapsed}
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col gap-3 overflow-hidden border-r bg-sidebar p-3 text-sidebar-foreground transition-[width] duration-300 ease-(--ease-out) md:flex",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <Brand collapsed={collapsed} />
        <div className="mt-2 flex-1">
          <AdminNav collapsed={collapsed} group="desktop" />
        </div>
        <div className="flex flex-col gap-1 border-t pt-3">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size={collapsed ? "icon" : "default"}
                  onClick={toggleCollapsed}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-pressed={collapsed}
                  className={cn("text-muted-foreground", collapsed ? "mx-auto" : "justify-start gap-3 px-3")}
                />
              }
            >
              <CollapseIcon />
              {collapsed ? null : "Collapse"}
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
          </Tooltip>
          <UserMenu email={email} collapsed={collapsed} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onSearch={() => setPalette(true)}
          menu={
            <Sheet open={drawer} onOpenChange={setDrawer}>
              <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />}>
                <Menu />
              </SheetTrigger>
              <SheetContent side="left" showCloseButton={false} className="w-72 gap-0 p-3 data-[side=left]:w-72">
                <SheetHeader className="p-0">
                  <SheetTitle className="sr-only">{BRAND}</SheetTitle>
                  <SheetDescription className="sr-only">Main navigation</SheetDescription>
                  <Brand />
                </SheetHeader>
                <div className="mt-4 flex-1">
                  <AdminNav onNavigate={() => setDrawer(false)} group="drawer" />
                </div>
                <div className="border-t pt-3">
                  <UserMenu email={email} />
                </div>
              </SheetContent>
            </Sheet>
          }
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <RecordPaymentHost />
    </div>
  );
}
