import { CalendarClock, Clock, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SectionHeader } from "@/components/common/section-header";
import { DeleteConfirmButton } from "@/components/billing/delete-confirm-button";
import { TimeEntryDialog } from "@/components/billing/time-entry-dialog";
import { entryAmount, formatQuantity, retainerMonths, UNIT_LABELS } from "@/lib/billing";
import { formatIsoDate, monthKeyOf, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireAdmin } from "@/lib/auth/session";
import { deleteTimeEntry } from "@/server/actions/time-entries";
import { getAdminProjectPayments } from "@/server/data/payments";
import { notFound } from "next/navigation";
import type { TimeEntry } from "@/lib/types";

function Stat({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&>svg]:size-3.5">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="text-lg font-semibold tracking-tight tabular-nums break-words sm:text-xl">{value}</div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Admin: log time, month subtotals, edit and delete. Retainers only. */
export async function TimeLogTab({ projectId }: { projectId: string }) {
  await requireAdmin();
  const { project, entries, finance } = await getAdminProjectPayments(projectId);
  if (project.kind !== "retainer" || !project.rateUnit) notFound();
  const { currency, rate, rateUnit } = project;
  const today = todayIso();
  const thisMonth = monthKeyOf(today);

  const months = retainerMonths(entries, rate);
  const current = months.find((m) => m.month === thisMonth);
  const byMonth = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const key = monthKeyOf(e.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }
  const newestFirst = [...months].reverse();
  const totalLogged = entries.reduce((sum, e) => sum + e.quantityHundredths, 0);

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-3 [--stagger:40ms]">
        <Stat
          label="This month"
          icon={<Clock />}
          value={formatMoney(current?.amount ?? 0, currency)}
          hint={current ? `${formatQuantity(current.quantityHundredths, rateUnit)} so far, billed after the month ends` : "Nothing logged yet this month"}
        />
        <Stat
          label="Total logged"
          icon={<CalendarClock />}
          value={formatQuantity(totalLogged, rateUnit)}
          hint={`${formatMoney(rate, currency)} per ${UNIT_LABELS[rateUnit].singular}`}
        />
        <Stat
          label="Billed so far"
          icon={<Wallet />}
          value={formatMoney(finance.scheduleTotal, currency)}
          hint={finance.pending < 0 ? `Overpaid by ${formatMoney(-finance.pending, currency)}` : `${formatMoney(finance.pending, currency)} pending`}
        />
      </div>

      <section className="grid grid-cols-1 gap-4">
        <SectionHeader
          title="Time entries"
          description="Grouped by month. A month is billed in arrears and falls due on its last day."
          actions={<TimeEntryDialog projectId={project.id} unit={rateUnit} rate={rate} currency={currency} />}
        />
        {entries.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock />
              </EmptyMedia>
              <EmptyTitle>No time logged yet</EmptyTitle>
              <EmptyDescription>Use Log time to record {UNIT_LABELS[rateUnit].plural} worked. Each month becomes one bill.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {newestFirst.map((m) => (
              <section key={m.month} aria-labelledby={`month-${m.month}`} className="overflow-hidden rounded-xl border bg-card shadow-xs">
                <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-muted/40 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <h3 id={`month-${m.month}`} className="text-sm font-semibold">
                      {m.label}
                    </h3>
                    {m.month === thisMonth ? (
                      <Badge variant="info" dot>
                        In progress
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm tabular-nums">
                    <span className="text-muted-foreground">{formatQuantity(m.quantityHundredths, rateUnit)}</span>
                    <span aria-hidden="true" className="mx-2 text-border">
                      |
                    </span>
                    <span className="font-semibold">{formatMoney(m.amount, currency)}</span>
                  </p>
                </header>
                <ul className="divide-y divide-border/70">
                  {(byMonth.get(m.month) ?? []).map((e) => (
                    <li key={e.id} className="grid gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[7rem_8rem_minmax(0,1fr)_7rem_auto] sm:items-center">
                      <span className="text-sm text-muted-foreground">{formatIsoDate(e.date)}</span>
                      <span className="text-sm font-medium tabular-nums">{formatQuantity(e.quantityHundredths, rateUnit)}</span>
                      <span className="min-w-0 text-sm break-words text-muted-foreground">{e.note || "No note"}</span>
                      <span className="text-sm font-medium tabular-nums sm:text-right">{formatMoney(entryAmount(e.quantityHundredths, rate), currency)}</span>
                      <div className="flex gap-2 sm:justify-end">
                        <TimeEntryDialog
                          projectId={project.id}
                          unit={rateUnit}
                          rate={rate}
                          currency={currency}
                          entry={{ id: e.id, date: e.date, quantityHundredths: e.quantityHundredths, note: e.note }}
                        />
                        <DeleteConfirmButton
                          title="Delete this time entry?"
                          description={`${formatQuantity(e.quantityHundredths, rateUnit)} on ${formatIsoDate(e.date)} will be removed and the month recalculated.`}
                          confirmLabel="Delete entry"
                          success="Time entry deleted"
                          action={deleteTimeEntry.bind(null, { projectId: project.id, entryId: e.id })}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
