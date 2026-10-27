"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const PROJECT_TABS = [
  { value: "overview", label: "Overview" },
  { value: "payments", label: "Payments" },
  { value: "agreement", label: "Agreement" },
  { value: "revisions", label: "Revisions" },
  { value: "activity", label: "Activity" },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]["value"];

/**
 * Tab bar driven by the ?tab= search param. The server renders only the active
 * tab's content (passed as children), so inactive tabs load no data.
 */
export function ProjectTabs({ value, children }: { value: ProjectTab; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs
      value={value}
      onValueChange={(next) => router.replace(next === "overview" ? pathname : `${pathname}?tab=${String(next)}`, { scroll: false })}
    >
      <div className="overflow-x-auto pb-1">
        <TabsList className="min-w-max">
          {PROJECT_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="px-3">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value={value} className="pt-2">
        {children}
      </TabsContent>
    </Tabs>
  );
}
