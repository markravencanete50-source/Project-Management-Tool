import { CalendarClock, Wallet } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SectionHeader } from "@/components/common/section-header";
import { ScheduleTable } from "@/components/payments/schedule-table";
import { requireAdmin } from "@/lib/auth/session";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { isFlatUnit } from "@/lib/types";
import { getAdminProjectPayments } from "@/server/data/payments";

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

/** Admin: the derived billing periods of a week or month retainer, newest first. Nothing is logged by hand. */
export async function PeriodsTab({ projectId }: { projectId: string }) {
  await requireAdmin();
  const { project, finance } = await getAdminProjectPayments(projectId);
  if (project.kind !== "retainer" || !isFlatUnit(project.rateUnit)) notFound();
  const { currency, rateUnit } = project;
  const lines = [...finance.lines].reverse();

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-3 [--stagger:40ms]">
        <Stat
          label="Billed"
          icon={<CalendarClock />}
          value={formatMoney(finance.scheduleTotal, currency)}
          hint={`${finance.lines.length} ${finance.lines.length === 1 ? rateUnit : `${rateUnit}s`} at ${formatMoney(project.rate, currency)}`}
        />
        <Stat label="Paid" icon={<Wallet />} value={formatMoney(finance.paid, currency)} />
        <Stat
          label={finance.pending < 0 ? "Balance" : "Pending"}
          icon={<Wallet />}
          value={finance.pending < 0 ? `Overpaid by ${formatMoney(-finance.pending, currency)}` : formatMoney(finance.pending, currency)}
          hint={finance.overdueAmount > 0 ? `${formatMoney(finance.overdueAmount, currency)} overdue` : undefined}
        />
      </div>

      <section className="grid grid-cols-1 gap-4">
        <SectionHeader
          title="Billing periods"
          description={`Billed automatically every ${rateUnit}, in full, and due on its last day.${project.endDate ? ` Billing ends after ${formatIsoDate(project.endDate)}.` : ""}`}
        />
        {lines.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarClock />
              </EmptyMedia>
              <EmptyTitle>No billing periods yet</EmptyTitle>
              <EmptyDescription>The first {rateUnit} appears once the start date arrives.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScheduleTable lines={lines} currency={currency} itemLabel={rateUnit === "week" ? "Week" : "Month"} />
        )}
      </section>
    </div>
  );
}
