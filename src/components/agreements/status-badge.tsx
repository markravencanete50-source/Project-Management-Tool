import { Badge } from "@/components/ui/badge";
import type { AgreementStatus } from "@/lib/types";

const LABEL: Record<AgreementStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  void: "Void",
};

const VARIANT: Record<AgreementStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  sent: "secondary",
  viewed: "secondary",
  signed: "default",
  void: "outline",
};

export function AgreementStatusBadge({ status }: { status: AgreementStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
