import { Wallet } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PaymentsList } from "@/components/payments/payments-list";
import { ScheduleTable } from "@/components/payments/schedule-table";
import { PaymentSummary } from "@/components/payments/summary";
import { getPortalProjectPayments } from "@/server/data/payments";

/** Read-only payments view for the portal. Access is checked by the loader. */
export async function PortalPaymentsSection({ projectId }: { projectId: string }) {
  const { project, payments, finance } = await getPortalProjectPayments(projectId);
  const { currency } = project;

  return (
    <section className="grid grid-cols-1 gap-6" aria-labelledby="portal-payments-heading">
      <div>
        <h2 id="portal-payments-heading" className="text-xl font-semibold tracking-tight">
          Payments
        </h2>
        <p className="mt-1 text-base text-muted-foreground">What has been paid so far and what is coming up.</p>
      </div>
      <PaymentSummary contractValue={project.contractValue} finance={finance} currency={currency} showOverdue={false} />

      <div className="grid grid-cols-1 gap-3">
        <h3 className="text-base font-semibold">Payment schedule</h3>
        {finance.lines.length === 0 ? (
          <p className="text-base text-muted-foreground">No payment schedule has been set for this project.</p>
        ) : (
          <ScheduleTable lines={finance.lines} currency={currency} />
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
