import { CalendarClock, TriangleAlert, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SectionHeader } from "@/components/common/section-header";
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

      <section className="grid grid-cols-1 gap-3">
        <SectionHeader
          title="Payment schedule"
          description="When each payment is due and how much of it has been covered."
          actions={
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
          }
        />
        {finance.lines.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarClock />
              </EmptyMedia>
              <EmptyTitle>No payment schedule</EmptyTitle>
              <EmptyDescription>Without a schedule there are no due dates, so nothing can be overdue. Use Edit schedule to add one.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScheduleTable lines={finance.lines} currency={currency} />
        )}
      </section>

      <section className="grid grid-cols-1 gap-3">
        <SectionHeader
          title="Payments received"
          description="Money that has arrived. Each payment settles the earliest unpaid line."
          actions={<PaymentFormDialog projectId={project.id} currency={currency} />}
        />
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
