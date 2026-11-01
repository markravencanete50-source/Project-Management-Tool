import { Wallet } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PaymentsList } from "@/components/payments/payments-list";
import { ScheduleTable } from "@/components/payments/schedule-table";
import { PaymentSummary } from "@/components/payments/summary";
import { getPortalProjectPayments } from "@/server/data/payments";
import { isFlatUnit } from "@/lib/types";

/** Read-only payments view for the portal. Access is checked by the loader. */
export async function PortalPaymentsSection({ projectId }: { projectId: string }) {
  const { project, payments, finance } = await getPortalProjectPayments(projectId);
  const { currency } = project;
  const derived = project.kind !== "fixed";
  const retainer = project.kind === "retainer";
  const flat = retainer && isFlatUnit(project.rateUnit);

  return (
    <section className="grid grid-cols-1 gap-6" aria-labelledby="portal-payments-heading">
      <div>
        <h2 id="portal-payments-heading" className="text-xl font-semibold tracking-tight">
          Payments
        </h2>
        <p className="mt-1 text-base text-muted-foreground">What has been paid so far and what is coming up.</p>
      </div>
      <PaymentSummary
        contractValue={derived ? finance.scheduleTotal : project.contractValue}
        finance={finance}
        currency={currency}
        showOverdue={false}
        totalLabel={derived ? "Billed so far" : "Contract value"}
        basisLabel={derived ? "billed" : "contract value"}
      />

      <div className="grid grid-cols-1 gap-3">
        <h3 className="text-base font-semibold">{flat ? (project.rateUnit === "week" ? "Weekly billing" : "Monthly billing") : retainer ? "Monthly summary" : derived ? "Completed tasks" : "Payment schedule"}</h3>
        {finance.lines.length === 0 ? (
          <p className="text-base text-muted-foreground">
            {retainer ? "Nothing has been billed yet." : derived ? "No tasks have been completed yet." : "No payment schedule has been set for this project."}
          </p>
        ) : (
          <ScheduleTable
            lines={finance.lines}
            currency={currency}
            itemLabel={flat ? (project.rateUnit === "week" ? "Week" : "Month") : retainer ? "Month" : derived ? "Task" : "Payment"}
            dueLabel={retainer ? "Due" : derived ? "Done on" : "Due"}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <h3 className="text-base font-semibold">Payments received</h3>
        {payments.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Wallet />
              </EmptyMedia>
              <EmptyTitle>No payments recorded yet</EmptyTitle>
              <EmptyDescription>Payments will appear here once they have been received.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <PaymentsList payments={payments} currency={currency} projectId={project.id} editable={false} />
        )}
      </div>
    </section>
  );
}
