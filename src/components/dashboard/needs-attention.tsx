import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal, Stagger, StaggerItem } from "@/components/dashboard/motion";
import { daysBetween, type DashboardData } from "@/components/dashboard/calc";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "cn";

type Tone = "destructive" | "warning" | "info" | "violet";

const DOT: Record<Tone, string> = {
  destructive: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  violet: "bg-violet",
};
const META: Record<Tone, string> = {
  destructive: "text-destructive",
  warning: "text-warning",
  info: "text-info",
  violet: "text-violet",
};

const REVISION_STATUS: Record<string, { label: string; tone: Tone }> = {
  awaiting_quote: { label: "Needs a quote", tone: "violet" },
  requested: { label: "Requested", tone: "info" },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Row = {
  key: string;
  href: string;
  title: string;
  subtitle: string;
  meta: string;
  metaStrong?: string;
  tone: Tone;
};

function Section({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <section aria-label={title} className="min-w-0">
      <div className="flex items-center justify-between gap-2 pb-1">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <Stagger as="ul" stagger={0.045} inView className="-mx-2 grid">
          {rows.map((row) => (
            <StaggerItem as="li" key={row.key}>
              <Link
                href={row.href}
                className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 outline-none hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className={cn("size-2 shrink-0 rounded-full", DOT[row.tone])} aria-hidden />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{row.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{row.subtitle}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end text-right">
                  {row.metaStrong ? <span className="text-sm font-semibold tabular-nums">{row.metaStrong}</span> : null}
                  <span className={cn("text-xs font-medium tabular-nums", META[row.tone])}>{row.meta}</span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
                  aria-hidden
                />
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}

/** Everything waiting on you, grouped, with a coloured dot for how urgent each item is. */
export function NeedsAttention({ attention, today }: { attention: DashboardData["attention"]; today: string }) {
  const overdue: Row[] = attention.overdue.map((item) => {
    const days = daysBetween(item.dueDate, today);
    return {
      key: `${item.projectId}-${item.lineId}`,
      href: `/admin/projects/${item.projectId}?tab=payments`,
      title: item.projectTitle,
      subtitle: `${item.label} for ${item.clientName}`,
      metaStrong: formatMoney(item.outstanding, item.currency),
      meta: `${plural(days, "day", "days")} overdue, due ${formatIsoDate(item.dueDate)}`,
      tone: days > 14 ? "destructive" : "warning",
    };
  });
  const followUps: Row[] = attention.followUps.map((item) => {
    const days = daysBetween(item.nextFollowUp, today);
    return {
      key: item.prospectId,
      href: `/admin/prospects/${item.prospectId}`,
      title: item.name,
      subtitle: item.company || "Prospect",
      meta: days <= 0 ? "Due today" : `${plural(days, "day", "days")} late`,
      tone: days <= 0 ? "info" : days > 7 ? "destructive" : "warning",
    };
  });
  const revisions: Row[] = attention.revisions.map((item) => {
    const status = REVISION_STATUS[item.status] ?? { label: item.status, tone: "info" as const };
    return {
      key: `${item.projectId}-${item.revisionId}`,
      href: `/admin/projects/${item.projectId}?tab=revisions`,
      title: item.projectTitle,
      subtitle: `Round ${item.round} for ${item.clientName}`,
      meta: status.label,
      tone: status.tone,
    };
  });
  const total = overdue.length + followUps.length + revisions.length;

  return (
    <Reveal>
      <Card>
        <CardContent className="grid gap-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="attention-heading" className="text-base font-semibold tracking-tight">
                Needs attention
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Overdue payments, follow-ups and revisions waiting on you.</p>
            </div>
            {total > 0 ? (
              <span className="inline-flex h-5.5 shrink-0 items-center rounded-full bg-warning/14 px-2 text-xs font-medium text-warning tabular-nums dark:bg-warning/16">
                {plural(total, "item", "items")}
              </span>
            ) : null}
          </div>

          {total === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-success/12 text-success dark:bg-success/16">
                <CheckCircle2 className="size-5" aria-hidden />
              </span>
              <p className="text-sm font-medium">You are all caught up</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Nothing is overdue, no follow-ups are due and no revisions are waiting on you.
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              <Section title="Overdue payments" rows={overdue} empty="Nothing is overdue." />
              <Section title="Follow-ups due" rows={followUps} empty="No follow-ups due." />
              <Section title="Revisions waiting on you" rows={revisions} empty="No revisions are waiting." />
            </div>
          )}
        </CardContent>
      </Card>
    </Reveal>
  );
}
