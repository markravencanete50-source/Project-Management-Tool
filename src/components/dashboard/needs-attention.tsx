import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/components/dashboard/calc";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

const REVISION_STATUS_LABEL: Record<string, string> = {
  awaiting_quote: "Needs a quote",
  requested: "Requested",
};

function Group({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {title}
          {count > 0 ? <Badge variant="secondary">{count}</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4" aria-hidden />
            {empty}
          </p>
        ) : (
          <ul className="divide-y">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}

const rowClass = "flex flex-col gap-0.5 py-2 text-sm first:pt-0 last:pb-0 hover:text-foreground";

export function NeedsAttention({ attention, today }: { attention: DashboardData["attention"]; today: string }) {
  const { overdue, followUps, revisions } = attention;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Group title="Overdue payments" count={overdue.length} empty="Nothing is overdue.">
        {overdue.map((item) => (
          <li key={`${item.projectId}-${item.lineId}`}>
            <Link href={`/admin/projects/${item.projectId}?tab=payments`} className={rowClass}>
              <span className="font-medium">
                {item.projectTitle}: {item.label}
              </span>
              <span className="text-muted-foreground">{item.clientName}</span>
              <span className="tabular-nums">
                {formatMoney(item.outstanding, item.currency)} outstanding, due {formatIsoDate(item.dueDate)}
              </span>
            </Link>
          </li>
        ))}
      </Group>

      <Group title="Follow-ups due" count={followUps.length} empty="No follow-ups due.">
        {followUps.map((item) => (
          <li key={item.prospectId}>
            <Link href={`/admin/prospects/${item.prospectId}`} className={rowClass}>
              <span className="font-medium">{item.name}</span>
              {item.company ? <span className="text-muted-foreground">{item.company}</span> : null}
              <span>
                {item.nextFollowUp < today ? "Overdue since" : "Due"} {formatIsoDate(item.nextFollowUp)}
              </span>
            </Link>
          </li>
        ))}
      </Group>

      <Group title="Revisions waiting on you" count={revisions.length} empty="No revisions are waiting.">
        {revisions.map((item) => (
          <li key={`${item.projectId}-${item.revisionId}`}>
            <Link href={`/admin/projects/${item.projectId}?tab=revisions`} className={rowClass}>
              <span className="font-medium">{item.projectTitle}</span>
              <span className="text-muted-foreground">{item.clientName}</span>
              <span>
                Round {item.round}: {REVISION_STATUS_LABEL[item.status] ?? item.status}
              </span>
            </Link>
          </li>
        ))}
      </Group>
    </div>
  );
}
