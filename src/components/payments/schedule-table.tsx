import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KIND_LABELS } from "@/components/payments/labels";
import { formatIsoDate } from "@/lib/dates";
import type { AllocatedLine } from "@/lib/finance";
import { formatMoney, type Currency } from "@/lib/money";

export function LineStateBadge({ line }: { line: Pick<AllocatedLine, "state" | "overdue"> }) {
  if (line.overdue) return <Badge variant="destructive">Overdue</Badge>;
  if (line.state === "paid") return <Badge variant="secondary">Paid</Badge>;
  if (line.state === "partly_paid") return <Badge variant="outline">Partly paid</Badge>;
  return <Badge variant="outline">Unpaid</Badge>;
}

/** Read-only schedule with allocation state. Scrolls inside its own container on narrow screens. */
export function ScheduleTable({ lines, currency }: { lines: AllocatedLine[]; currency: Currency }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Payment</TableHead>
          <TableHead>Due</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">Outstanding</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell>
              <div className="font-medium">{line.label}</div>
              <div className="text-xs text-muted-foreground">{KIND_LABELS[line.kind]}</div>
            </TableCell>
            <TableCell className="whitespace-nowrap">{formatIsoDate(line.dueDate)}</TableCell>
            <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(line.amountDue, currency)}</TableCell>
            <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(line.covered, currency)}</TableCell>
            <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(line.outstanding, currency)}</TableCell>
            <TableCell>
              <LineStateBadge line={line} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
