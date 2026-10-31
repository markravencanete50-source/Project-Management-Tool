import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { KIND_LABELS } from "@/components/payments/labels";
import { formatIsoDate } from "@/lib/dates";
import type { AllocatedLine } from "@/lib/finance";
import { formatMoney, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

export function LineStateBadge({ line }: { line: Pick<AllocatedLine, "state" | "overdue"> }) {
  if (line.overdue) {
    return (
      <Badge variant="destructive" dot>
        Overdue
      </Badge>
    );
  }
  if (line.state === "paid") {
    return (
      <Badge variant="success" dot>
        Paid
      </Badge>
    );
  }
  if (line.state === "partly_paid") {
    return (
      <Badge variant="info" dot>
        Partially paid
      </Badge>
    );
  }
  return (
    <Badge variant="warning" dot>
      Due
    </Badge>
  );
}

/** Column template shared by the header and every row from md up. */
const COLS = "md:grid-cols-[minmax(0,2fr)_6.5rem_minmax(6rem,1fr)_minmax(6rem,1fr)_minmax(6rem,1fr)_8.5rem]";

function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 md:block", className)}>
      <span className="text-sm text-muted-foreground md:hidden">{label}</span>
      <span className="text-sm tabular-nums md:whitespace-nowrap">{children}</span>
    </div>
  );
}

/**
 * Read-only schedule with allocation state. One markup for every size: stacked
 * cards below md, a Stripe-like table (scrolling inside its own container) from md up.
 */
export function ScheduleTable({ lines, currency }: { lines: AllocatedLine[]; currency: Currency }) {
  return (
    <div className="md:overflow-x-auto md:rounded-xl md:border md:bg-card md:shadow-xs">
      <div className="md:min-w-[44rem]">
        <div
          aria-hidden="true"
          className={cn(
            "hidden border-b bg-muted/40 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase md:grid md:gap-4",
            COLS,
          )}
        >
          <span>Payment</span>
          <span>Due</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Outstanding</span>
          <span>Status</span>
        </div>
        <ul className="stagger grid gap-3 [--stagger:35ms] md:gap-0">
          {lines.map((line) => (
            <li
              key={line.id}
              className={cn(
                "grid gap-2 rounded-xl border bg-card p-4 shadow-xs md:items-center md:gap-4 md:rounded-none md:border-0 md:border-b md:border-border/70 md:px-4 md:py-3 md:shadow-none md:transition-colors md:duration-150 md:last:border-b-0 md:hover:bg-muted/40",
                COLS,
                line.overdue && "border-destructive/25",
              )}
            >
              <div className="flex items-start justify-between gap-3 md:block">
                <div className="min-w-0">
                  <div className="font-medium break-words">{line.label}</div>
                  <div className="text-xs text-muted-foreground">{KIND_LABELS[line.kind]}</div>
                </div>
                <div className="shrink-0 md:hidden">
                  <LineStateBadge line={line} />
                </div>
              </div>
              <Cell label="Due">{formatIsoDate(line.dueDate)}</Cell>
              <Cell label="Amount" className="md:text-right">
                {formatMoney(line.amountDue, currency)}
              </Cell>
              <Cell label="Paid" className="md:text-right">
                {formatMoney(line.covered, currency)}
              </Cell>
              <Cell label="Outstanding" className={cn("md:text-right", line.overdue && "font-medium text-destructive")}>
                {formatMoney(line.outstanding, currency)}
              </Cell>
              <div className="hidden md:block">
                <LineStateBadge line={line} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
