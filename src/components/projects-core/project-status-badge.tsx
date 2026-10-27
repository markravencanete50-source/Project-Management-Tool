import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@/lib/types";

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  agreement_sent: "Agreement sent",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const VARIANTS: Record<ProjectStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  agreement_sent: "secondary",
  active: "default",
  on_hold: "outline",
  completed: "secondary",
  cancelled: "destructive",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}
