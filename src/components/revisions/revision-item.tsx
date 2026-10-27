import type { ReactNode } from "react";
import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatMoney, type Currency } from "@/lib/money";
import { formatInstant } from "@/lib/dates";
import { fileUrl } from "@/lib/files";
import type { Revision } from "@/lib/types";
import { attachmentName, REVISION_STATUS_LABEL, REVISION_STATUS_VARIANT } from "@/components/revisions/labels";

/** One revision, shown the same way to admin and client. Actions come in as children. */
export function RevisionItem({ revision, currency, children }: { revision: Revision; currency: Currency; children?: ReactNode }) {
  return (
    <li className="rounded-lg border p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Revision {revision.round}</span>
        <Badge variant={REVISION_STATUS_VARIANT[revision.status]}>{REVISION_STATUS_LABEL[revision.status]}</Badge>
        {revision.billable ? (
          <Badge variant="outline">
            {revision.price !== null ? `Extra round, ${formatMoney(revision.price, currency)}` : "Extra round, not yet quoted"}
          </Badge>
        ) : (
          <Badge variant="outline">Included</Badge>
        )}
        <span className="text-xs text-muted-foreground sm:ml-auto">{formatInstant(revision.requestedAt)}</span>
      </div>
      <p className="mt-2 text-sm whitespace-pre-wrap break-words">{revision.notes}</p>
      {revision.attachmentPublicIds.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {revision.attachmentPublicIds.map((id, i) => (
            <li key={id} className="max-w-full">
              <a
                href={fileUrl(id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
              >
                <Paperclip className="size-3 shrink-0" />
                <span className="truncate">{attachmentName(id, i)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {children ? <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div> : null}
    </li>
  );
}
