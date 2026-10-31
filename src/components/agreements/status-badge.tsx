import { Badge } from "@/components/ui/badge";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import type { AgreementStatus } from "@/lib/types";

const LABEL: Record<AgreementStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  void: "Void",
};

const VARIANT: Record<AgreementStatus, "outline" | "info" | "violet" | "success" | "destructive"> = {
  draft: "outline",
  sent: "info",
  viewed: "violet",
  signed: "success",
  void: "destructive",
};

export function AgreementStatusBadge({ status }: { status: AgreementStatus }) {
  return (
    <AnimatedBadge k={status}>
      <Badge variant={VARIANT[status]} dot>
        {LABEL[status]}
      </Badge>
    </AnimatedBadge>
  );
}
