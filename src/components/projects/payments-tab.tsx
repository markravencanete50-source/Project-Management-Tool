import { CalendarClock, ListChecks, TriangleAlert, Wallet } from "lucide-react";
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
  const derived = project.kind !== "fixed";

  const paymentsSection = (
    <section className="grid grid-cols-1 gap-3">
      <SectionHeader
        title="Payments received"
        description={
          derived
            ? "Money that has arrived. Each payment settles the oldest unpaid bill first."
            : "Money that has arrived. Each payment settles the earliest unpaid line."
        }
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
  );

  if (derived) {
    const retainer = project.kind === "retainer";
    return (
      <div className="grid grid-cols-1 gap-8">
        <PaymentSummary
          contractValue={finance.scheduleTotal}
          finance={finance}
          currency={currency}
          totalLabel="Billed so far"
          basisLabel="billed"
        />
        <section className="grid grid-cols-1 gap-3">
          <SectionHeader
            title={retainer ? "Monthly bills" : "Owed tasks"}
            description={
              retainer
                ? "Each month with logged time is billed in arrears and falls due on its last day. The current month is in progress."
                : "A task is owed the moment it is marked done. Tasks still to do are not billed."
            }
          />
          {finance.lines.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">{retainer ? <CalendarClock /> : <ListChecks />}</EmptyMedia>
                <EmptyTitle>{retainer ? "Nothing billed yet" : "No tasks owed yet"}</EmptyTitle>
                <EmptyDescription>
                  {retainer ? "Log time in the Time log tab and each month will appear here." : "Mark a task done in the Tasks tab and it will appear here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ScheduleTable
              lines={finance.lines}
              currency={currency}
              itemLabel={retainer ? "Month" : "Task"}
              dueLabel={retainer ? "Due" : "Done on"}
            />
          )}
        </section>
        {paymentsSection}
      </div>
    );
  }

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

      {paymentsSection}
    </div>
  );
}
