import type { RevisionStatus } from "@/lib/types";

export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  awaiting_quote: "Awaiting quote",
  awaiting_approval: "Awaiting approval",
  requested: "Requested",
  in_progress: "In progress",
  delivered: "Delivered",
  approved: "Approved",
  cancelled: "Cancelled",
};

export const REVISION_STATUS_VARIANT: Record<
  RevisionStatus,
  "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "violet"
> = {
  awaiting_quote: "warning",
  awaiting_approval: "warning",
  requested: "secondary",
  in_progress: "info",
  delivered: "violet",
  approved: "success",
  cancelled: "destructive",
};

/** Readable file name from a stored id such as "raw:pmt/projects/x/revisions/abc_report.pdf". */
export function attachmentName(storedId: string, index: number): string {
  const last = storedId.split("/").pop() ?? "";
  return last ? last : `Attachment ${index + 1}`;
}
