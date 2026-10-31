import type { ProjectKind } from "@/lib/types";

// Not a client module: the server page imports this list, which it cannot do
// from a "use client" file (it would receive a client reference, not the array).
const ALL_TABS = [
  { value: "overview", label: "Overview" },
  { value: "time", label: "Time log" },
  { value: "tasks", label: "Tasks" },
  { value: "payments", label: "Payments" },
  { value: "agreement", label: "Agreement" },
  { value: "revisions", label: "Revisions" },
  { value: "activity", label: "Activity" },
] as const;

export type ProjectTab = (typeof ALL_TABS)[number]["value"];
export type ProjectTabItem = { value: ProjectTab; label: string };

const BY_KIND: Record<ProjectKind, ProjectTab[]> = {
  // Fixed price keeps exactly the tabs it always had.
  fixed: ["overview", "payments", "agreement", "revisions", "activity"],
  // No agreement or revisions for the other kinds. Activity stays so the log of changes is reachable.
  retainer: ["overview", "time", "payments", "activity"],
  tasks: ["overview", "tasks", "payments", "activity"],
};

/** The tabs a project of this kind shows, in order. */
export function tabsFor(kind: ProjectKind): ProjectTabItem[] {
  return BY_KIND[kind].map((value) => ALL_TABS.find((t) => t.value === value)!);
}
