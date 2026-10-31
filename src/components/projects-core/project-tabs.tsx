"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PROJECT_TABS, type ProjectTab } from "@/components/projects-core/tab-values";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Tab bar driven by the ?tab= search param. The server renders only the active
 * tab's content (passed as children), so inactive tabs load no data.
 * The selected tab updates immediately (so the indicator slides at once) while
 * the server content for it loads; the old content dims until it arrives.
 */
export function ProjectTabs({ value, children }: { value: ProjectTab; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<ProjectTab>(value);
  const [seen, setSeen] = useState<ProjectTab>(value);
  const scroller = useRef<HTMLDivElement>(null);

  // Follow the URL when it changes from elsewhere (back button, links).
  if (seen !== value) {
    setSeen(value);
    setActive(value);
  }

  // Keep the active tab visible inside the horizontally scrollable bar.
  useEffect(() => {
    const box = scroller.current;
    const tab = box?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!box || !tab) return;
    const b = box.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    const pad = 12;
    let delta = 0;
    if (t.left < b.left + pad) delta = t.left - b.left - pad;
    else if (t.right > b.right - pad) delta = t.right - b.right + pad;
    if (delta !== 0) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      box.scrollBy({ left: delta, behavior: reduce ? "auto" : "smooth" });
    }
  }, [active]);

  return (
    <Tabs
      value={active}
      onValueChange={(next) => {
        const tab = next as ProjectTab;
        setActive(tab);
        startTransition(() => {
          router.replace(tab === "overview" ? pathname : `${pathname}?tab=${tab}`, { scroll: false });
        });
      }}
    >
      <div ref={scroller} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <TabsList variant="line" className="w-max min-w-full justify-start">
          {PROJECT_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="flex-none px-3.5">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent
        key={value}
        value={active}
        className={cn("pt-3 transition-opacity duration-200", pending && "opacity-60")}
        aria-busy={pending}
      >
        {children}
      </TabsContent>
    </Tabs>
  );
}
