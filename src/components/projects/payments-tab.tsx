import { TriangleAlert, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PaymentsList } from "@/components/payments/payments-list";
import { PaymentFormDialog } from "@/components/payments/payment-form-dialog";
import { ScheduleEditor } from "@/components/payments/schedule-editor";
import { ScheduleTable } from "@/components/payments/schedule-table";
import { PaymentSummary } from "@/components/payments/summary";
import { requireAdmin } from "@/lib/auth/session";
import { sortSchedule } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { getAdminProjectPayments } from "@/server/data/payments";

export async function PaymentsTab({ projectId }: { projectId: string }) {
  await requireAdmin();
  const { project, schedule, payments, finance } = await getAdminProjectPayments(projectId);
  const { currency } = project;

  return (
    <div className="grid grid-cols-1 gap-8">
      <PaymentSummary contractValue={project.contractValue} finance={finance} currency={currency} />

      {!finance.scheduleMatches ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Schedule does not match the contract value</AlertTitle>
          <AlertDescription>
            The schedule lines total {formatMoney(finance.scheduleTotal, currency)} but the contract value is{" "}
            {formatMoney(project.contractValue, currency)}. Edit the schedule to fix the difference.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid grid-cols-1 gap-3" aria-labelledby="schedule-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="schedule-heading" className="text-base font-semibold">
            Payment schedule
          </h2>
          <ScheduleEditor
            projectId={project.id}
            currency={currency}
            contractValue={project.contractValue}
            lines={sortSchedule(schedule).map((l) => ({
              id: l.id,
              label: l.label,
              kind: l.kind,
              amountDue: l.amountDue,
              dueDate: l.dueDate,
            }))}
          />
        </div>
        {finance.lines.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Wallet />
              </EmptyMedia>
              <EmptyTitle>No payment schedule</EmptyTitle>
              <EmptyDescription>Without a schedule there are no due dates, so nothing can be overdue.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="rounded-lg ring-1 ring-foreground/10">
            <ScheduleTable lines={finance.lines} currency={currency} />
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3" aria-labelledby="payments-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="payments-heading" className="text-base font-semibold">
            Payments received
          </h2>
          <PaymentFormDialog projectId={project.id} currency={currency} />
        </div>
        {payments.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Wallet />
              </EmptyMedia>
              <EmptyTitle>No payments yet</EmptyTitle>
              <EmptyDescription>Add a payment when money arrives. This app does not collect payments.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <PaymentsList payments={payments} currency={currency} projectId={project.id} editable />
        )}
      </section>
    </div>
  );
}
