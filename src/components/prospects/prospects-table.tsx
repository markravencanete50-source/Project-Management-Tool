import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { isFollowUpDue, LOST_REASON_LABELS, SOURCE_LABELS, STAGE_LABELS } from "@/components/prospects/labels";
import type { Prospect } from "@/lib/types";

export function StageBadge({ stage }: { stage: Prospect["stage"] }) {
  return (
    <Badge variant={stage === "won" ? "default" : stage === "lost" ? "destructive" : "secondary"}>
      {STAGE_LABELS[stage]}
    </Badge>
  );
}

export function ProspectsTable({ prospects, today }: { prospects: Prospect[]; today: string }) {
  return (
    <div className="min-w-0 max-w-full overflow-x-auto rounded-lg border">
      <Table className="min-w-[44rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Prospect</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Estimated value</TableHead>
            <TableHead>Next follow-up</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prospects.map((p) => {
            const due = isFollowUpDue(p, today);
            return (
              <TableRow key={p.id} className={due ? "bg-destructive/5" : undefined}>
                <TableCell>
                  <Link href={`/admin/prospects/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {[p.company, p.service].filter(Boolean).join(" - ") || "No details"}
                  </div>
                  {p.archivedAt ? (
                    <Badge variant="outline" className="mt-1">
                      Archived
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>
                  <StageBadge stage={p.stage} />
                  {p.stage === "lost" && p.lostReason ? (
                    <div className="mt-1 text-xs text-muted-foreground">{LOST_REASON_LABELS[p.lostReason]}</div>
                  ) : null}
                </TableCell>
                <TableCell>{SOURCE_LABELS[p.source]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.estimatedValue ? formatMoney(p.estimatedValue, p.currency) : "Not set"}
                </TableCell>
                <TableCell>
                  {p.nextFollowUp ? formatIsoDate(p.nextFollowUp) : <span className="text-muted-foreground">None</span>}
                  {due ? (
                    <Badge variant="destructive" className="ml-2">
                      Follow-up due
                    </Badge>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
