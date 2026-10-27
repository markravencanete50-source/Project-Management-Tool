// Not a client module: the server page imports this list, which it cannot do
// from a "use client" file (it would receive a client reference, not the array).
export const PROJECT_TABS = [
  { value: "overview", label: "Overview" },
  { value: "payments", label: "Payments" },
  { value: "agreement", label: "Agreement" },
  { value: "revisions", label: "Revisions" },
  { value: "activity", label: "Activity" },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]["value"];
