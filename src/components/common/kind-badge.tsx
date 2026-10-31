import { CalendarClock, FileText, ListChecks } from "lucide-react";
import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import type { ProjectKind } from "@/lib/types";

export const KIND_ICONS: Record<ProjectKind, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  fixed: FileText,
  retainer: CalendarClock,
  tasks: ListChecks,
};

/** Short names for badges and filters. The long names live in KIND_LABELS (src/lib/billing.ts). */
export const KIND_SHORT: Record<ProjectKind, string> = {
  fixed: "Fixed",
  retainer: "Retainer",
  tasks: "Tasks",
};

const VARIANT: Record<ProjectKind, "outline" | "violet" | "info"> = {
  fixed: "outline",
  retainer: "violet",
  tasks: "info",
};

/** Engagement kind pill, shared by projects and prospects. Server safe. */
export function KindBadge({ kind, className }: { kind: ProjectKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return (
    <Badge variant={VARIANT[kind]} className={className}>
      <Icon aria-hidden />
      {KIND_SHORT[kind]}
    </Badge>
  );
}
