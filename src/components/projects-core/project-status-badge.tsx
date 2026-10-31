import { Badge } from "@/components/ui/badge";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import type { ProjectStatus } from "@/lib/types";

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  agreement_sent: "Agreement sent",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const VARIANTS: Record<ProjectStatus, "default" | "outline" | "destructive" | "success" | "warning" | "info"> = {
  draft: "outline",
  agreement_sent: "info",
  active: "success",
  on_hold: "warning",
  completed: "default",
  cancelled: "destructive",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <AnimatedBadge k={status}>
      <Badge variant={VARIANTS[status]} dot>
        {STATUS_LABELS[status]}
      </Badge>
    </AnimatedBadge>
  );
}
