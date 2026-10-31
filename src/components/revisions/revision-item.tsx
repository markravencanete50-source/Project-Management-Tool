import type { ReactNode } from "react";
import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { formatMoney, type Currency } from "@/lib/money";
import { formatInstant } from "@/lib/dates";
import { fileUrl } from "@/lib/files";
import type { Revision } from "@/lib/types";
import { attachmentName, REVISION_STATUS_LABEL, REVISION_STATUS_VARIANT } from "@/components/revisions/labels";

/** One revision, shown the same way to admin and client. Actions come in as children. */
export function RevisionItem({ revision, currency, children }: { revision: Revision; currency: Currency; children?: ReactNode }) {
  const updated = revision.updatedAt.getTime() - revision.requestedAt.getTime() > 60_000;

  return (
    <li className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-semibold text-primary tabular-nums"
        >
          {revision.round}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="font-semibold">Revision {revision.round}</span>
            <AnimatedBadge k={revision.status}>
              <Badge variant={REVISION_STATUS_VARIANT[revision.status]} dot>
                {REVISION_STATUS_LABEL[revision.status]}
              </Badge>
            </AnimatedBadge>
            {revision.billable ? (
              <Badge variant="outline" className="tabular-nums">
                {revision.price !== null ? `Extra round, ${formatMoney(revision.price, currency)}` : "Extra round, not yet quoted"}
              </Badge>
            ) : (
              <Badge variant="outline">Included</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Requested {formatInstant(revision.requestedAt)}
            {updated ? `, updated ${formatInstant(revision.updatedAt)}` : ""}
          </p>
        </div>
      </div>

      <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2.5 text-sm break-words whitespace-pre-wrap">{revision.notes}</p>

      {revision.attachmentPublicIds.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Attachments">
          {revision.attachmentPublicIds.map((id, i) => (
            <li key={id} className="max-w-full">
              <a
                href={fileUrl(id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-medium shadow-xs transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none"
              >
                <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{attachmentName(id, i)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {children ? <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">{children}</div> : null}
    </li>
  );
}
