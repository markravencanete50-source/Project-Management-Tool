"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FolderPlus, Moon, Plus, Search, Sun, UserPlus } from "lucide-react";
import { useTheme } from "next-themes";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { openRecordPayment } from "@/components/payments/record-payment";
import { NAV_ITEMS } from "@/components/shell/admin-nav";
import { cn } from "@/lib/utils";

type Command = { id: string; label: string; hint: string; icon: ComponentType<{ className?: string }>; run: () => void };

/** Ctrl/Cmd+K jump menu: pages, quick creates and theme. Pure navigation, no data fetching. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      ...NAV_ITEMS.map((n) => ({ id: n.href, label: n.label, hint: "Go to", icon: n.icon, run: go(n.href) })),
      { id: "record-payment", label: "Record payment", hint: "Create", icon: Plus, run: () => openRecordPayment() },
      { id: "new-project", label: "New project", hint: "Create", icon: FolderPlus, run: go("/admin/projects/new") },
      { id: "clients", label: "Add a client", hint: "Create", icon: UserPlus, run: go("/admin/clients") },
      { id: "light", label: "Light theme", hint: "Theme", icon: Sun, run: () => setTheme("light") },
      { id: "dark", label: "Dark theme", hint: "Theme", icon: Moon, run: () => setTheme("dark") },
    ];
  }, [router, setTheme]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index, open]);

  function choose(cmd: Command | undefined) {
    if (!cmd) return;
    onOpenChange(false);
    cmd.run();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
          setIndex(0);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-lg max-sm:top-16 max-sm:bottom-auto"
      >
        <DialogTitle className="sr-only">Jump to</DialogTitle>
        <DialogDescription className="sr-only">Search pages and quick actions.</DialogDescription>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={results[index] ? `cmd-${results[index].id}` : undefined}
            aria-label="Search pages and actions"
            placeholder="Search pages and actions"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(results[index]);
              }
            }}
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          />
        </div>
        <ul id="command-list" role="listbox" ref={listRef} className="max-h-72 overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches that search.</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.id}
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === index}
                data-index={i}
                onMouseMove={() => setIndex(i)}
                onClick={() => choose(c)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  i === index ? "bg-accent text-accent-foreground" : "text-foreground",
                )}
              >
                <c.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.hint}</span>
                {i === index ? <CornerDownLeft className="size-3.5 text-muted-foreground" /> : null}
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
