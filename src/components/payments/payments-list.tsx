import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { METHOD_LABELS } from "@/components/payments/labels";
import { DeletePaymentButton } from "@/components/payments/delete-payment-button";
import { PaymentFormDialog } from "@/components/payments/payment-form-dialog";
import { formatIsoDate } from "@/lib/dates";
import { fileUrl } from "@/lib/files";
import { formatMoney, type Currency } from "@/lib/money";
import type { Payment } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  payments: Payment[];
  currency: Currency;
  projectId: string;
  /** Admin view: shows notes and edit / delete controls. The portal passes false. */
  editable: boolean;
};

/**
 * Payments received. One markup for every size: stacked cards below md, a
 * Stripe-like table (scrolling inside its own container) from md up.
 */
export function PaymentsList({ payments, currency, projectId, editable }: Props) {
  const cols = editable
    ? "md:grid-cols-[7.5rem_9rem_minmax(0,1fr)_8rem_11rem]"
    : "md:grid-cols-[7.5rem_9rem_minmax(0,1fr)_8rem]";

  return (
    <div className="md:overflow-x-auto md:rounded-xl md:border md:bg-card md:shadow-xs">
      <div className={editable ? "md:min-w-[44rem]" : undefined}>
        <div
          aria-hidden="true"
          className={cn(
            "hidden border-b bg-muted/40 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase md:grid md:gap-4",
            cols,
          )}
        >
          <span>Date</span>
          <span>Method</span>
          <span>{editable ? "Details" : "Receipt"}</span>
          <span className="text-right">Amount</span>
          {editable ? <span /> : null}
        </div>
        <ul className="stagger grid gap-3 [--stagger:35ms] md:gap-0">
          {payments.map((p) => (
            <li
              key={p.id}
              className={cn(
                "grid grid-cols-2 items-center gap-x-3 gap-y-2.5 rounded-xl border bg-card p-4 shadow-xs md:gap-4 md:rounded-none md:border-0 md:border-b md:border-border/70 md:px-4 md:py-3 md:shadow-none md:transition-colors md:duration-150 md:last:border-b-0 md:hover:bg-muted/40",
                cols,
              )}
            >
              <div className="text-lg font-semibold tabular-nums md:col-start-4 md:row-start-1 md:text-right md:text-sm">
                {formatMoney(p.amount, currency)}
              </div>
              <div className="justify-self-end text-sm text-muted-foreground md:col-start-1 md:row-start-1 md:justify-self-start">
                {formatIsoDate(p.paidOn)}
              </div>
              <div className="col-span-2 md:col-span-1 md:col-start-2 md:row-start-1">
                <Badge variant="outline">{METHOD_LABELS[p.method]}</Badge>
              </div>
              <div className="col-span-2 flex min-w-0 flex-col items-start gap-1.5 md:col-span-1 md:col-start-3 md:row-start-1">
                {editable && p.note ? <p className="text-sm break-words">{p.note}</p> : null}
                {p.receiptPublicId ? (
                  <a
                    href={fileUrl(p.receiptPublicId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-sm font-medium text-primary shadow-xs transition-colors hover:bg-primary/8 focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none max-md:min-h-10"
                  >
                    <Paperclip className="size-3.5" aria-hidden />
                    View receipt
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">No receipt attached</span>
                )}
              </div>
              {editable ? (
                <div className="col-span-2 flex gap-2 md:col-span-1 md:col-start-5 md:row-start-1 md:justify-end">
                  <PaymentFormDialog
                    projectId={projectId}
                    currency={currency}
                    payment={{
                      id: p.id,
                      amount: p.amount,
                      paidOn: p.paidOn,
                      method: p.method,
                      note: p.note,
                      receiptPublicId: p.receiptPublicId,
                    }}
                  />
                  <DeletePaymentButton projectId={projectId} paymentId={p.id} label={formatMoney(p.amount, currency)} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
