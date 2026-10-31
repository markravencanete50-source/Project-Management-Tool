import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { InitialsAvatar } from "@/components/common/initials-avatar";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  companyLine,
  isFollowUpDue,
  LOST_REASON_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  STAGE_VARIANT,
} from "@/components/prospects/labels";
import type { Prospect } from "@/lib/types";

export function StageBadge({ stage }: { stage: Prospect["stage"] }) {
  return (
    <AnimatedBadge k={stage}>
      <Badge variant={STAGE_VARIANT[stage]} dot>
        {STAGE_LABELS[stage]}
      </Badge>
    </AnimatedBadge>
  );
}

const STRETCHED = "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none";

export function ProspectsTable({ prospects, today }: { prospects: Prospect[]; today: string }) {
  return (
    <>
      {/* Below md: stacked cards. */}
      <ul className="stagger grid gap-2 md:hidden">
        {prospects.map((p) => {
          const due = isFollowUpDue(p, today);
          const line = companyLine(p);
          return (
            <li
              key={p.id}
              className={
                "card-interactive relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/40 " +
                (due ? "border-destructive/30 bg-destructive/5" : "")
              }
            >
              <div className="flex items-start gap-3">
                <InitialsAvatar name={p.name} />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/prospects/${p.id}`} className={`block truncate text-sm font-medium ${STRETCHED}`}>
                    {p.name}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">{line || "No details"}</div>
                </div>
                <StageBadge stage={p.stage} />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className={p.estimatedValue ? "font-semibold tabular-nums" : "text-muted-foreground"}>
                  {p.estimatedValue ? formatMoney(p.estimatedValue, p.currency) : "No value"}
                </span>
                <span className="text-xs text-muted-foreground">{SOURCE_LABELS[p.source]}</span>
              </div>
              {p.nextFollowUp || p.archivedAt || (p.stage === "lost" && p.lostReason) ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  {p.nextFollowUp ? (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      {formatIsoDate(p.nextFollowUp)}
                    </span>
                  ) : null}
                  {due ? (
                    <Badge variant="destructive" dot>
                      Follow-up due
                    </Badge>
                  ) : null}
                  {p.stage === "lost" && p.lostReason ? <span>Lost: {LOST_REASON_LABELS[p.lostReason]}</span> : null}
                  {p.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* md and up: table. */}
      <div className="enter-fade hidden min-w-0 max-w-full overflow-hidden rounded-xl border bg-card shadow-xs md:block">
        <Table>
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
              const line = companyLine(p);
              return (
                <TableRow
                  key={p.id}
                  className={`relative has-[a:focus-visible]:bg-muted/60 ${due ? "bg-destructive/5 hover:bg-destructive/10" : ""}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={p.name} />
                      <div className="min-w-0">
                        <Link href={`/admin/prospects/${p.id}`} className={`block max-w-64 truncate font-medium ${STRETCHED}`}>
                          {p.name}
                        </Link>
                        <div className="max-w-64 truncate text-xs text-muted-foreground">{line || "No details"}</div>
                      </div>
                      {p.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={p.stage} />
                    {p.stage === "lost" && p.lostReason ? (
                      <div className="mt-1 text-xs text-muted-foreground">{LOST_REASON_LABELS[p.lostReason]}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{SOURCE_LABELS[p.source]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.estimatedValue ? (
                      <span className="font-medium">{formatMoney(p.estimatedValue, p.currency)}</span>
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {p.nextFollowUp ? formatIsoDate(p.nextFollowUp) : <span className="text-muted-foreground">None</span>}
                      {due ? (
                        <Badge variant="destructive" dot>
                          Follow-up due
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
