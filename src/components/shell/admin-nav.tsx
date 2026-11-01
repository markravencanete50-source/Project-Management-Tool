"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { FolderKanban, LayoutDashboard, Receipt, Settings, Target, Users, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; exact: boolean }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/prospects", label: "Prospects", icon: Target, exact: false },
  { href: "/admin/clients", label: "Clients", icon: Users, exact: false },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban, exact: false },
  { href: "/admin/payments", label: "Payments", icon: Wallet, exact: false },
  { href: "/admin/expenses", label: "Expenses", icon: Receipt, exact: false },
  { href: "/admin/settings", label: "Settings", icon: Settings, exact: false },
];

/**
 * Sidebar navigation. The active item gets a pill that glides between rows
 * (shared layoutId). `group` keeps the desktop and drawer copies independent.
 * `collapsed` shows icons only, with tooltips carrying the labels.
 */
export function AdminNav({
  onNavigate,
  collapsed = false,
  group = "desktop",
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  group?: string;
}) {
  const pathname = usePathname();
  return (
    <LayoutGroup id={`nav-${group}`}>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          const link = (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              className={cn(
                "group/nav relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40",
                active ? "text-sidebar-accent-foreground" : "text-muted-foreground hover:text-foreground",
                collapsed && "justify-center gap-0 px-0",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="nav-active"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg bg-sidebar-accent shadow-xs ring-1 ring-primary/10"
                  transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.8 }}
                >
                  <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-primary" />
                </motion.span>
              ) : (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg bg-foreground/0 transition-colors duration-150 group-hover/nav:bg-foreground/5"
                />
              )}
              <Icon className={cn("relative size-[18px] shrink-0 transition-transform duration-200 group-hover/nav:scale-110", active && "text-primary")} />
              <span
                className={cn(
                  "relative truncate transition-[opacity] duration-200",
                  collapsed ? "pointer-events-none w-0 opacity-0" : "opacity-100",
                )}
              >
                {label}
              </span>
            </Link>
          );
          if (!collapsed) return link;
          return (
            <Tooltip key={href}>
              <TooltipTrigger render={link} />
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
