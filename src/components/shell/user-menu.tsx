"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSignOut } from "@/components/shell/sign-out-button";
import { cn } from "@/lib/utils";

/** Account menu pinned to the bottom of the sidebar. */
export function UserMenu({ email, collapsed = false }: { email: string | null; collapsed?: boolean }) {
  const { signOut, pending } = useSignOut();
  const initial = (email?.trim()[0] ?? "A").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "group/user flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-[3px] focus-visible:ring-ring/40 data-popup-open:bg-foreground/5",
          collapsed && "justify-center p-1.5",
        )}
      >
        <Avatar size="default">
          <AvatarFallback className="bg-primary/12 font-semibold text-primary">{initial}</AvatarFallback>
        </Avatar>
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm leading-tight font-medium">Admin</span>
              <span className="block truncate text-xs text-muted-foreground">{email ?? "Signed in"}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-60 min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{email ?? "Signed in"}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/admin/settings" />}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" disabled={pending} onClick={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
