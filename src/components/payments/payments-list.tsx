import { Paperclip } from "lucide-react";
import { METHOD_LABELS } from "@/components/payments/labels";
import { DeletePaymentButton } from "@/components/payments/delete-payment-button";
import { PaymentFormDialog } from "@/components/payments/payment-form-dialog";
import { formatIsoDate } from "@/lib/dates";
import { fileUrl } from "@/lib/files";
import { formatMoney, type Currency } from "@/lib/money";
import type { Payment } from "@/lib/types";

type Props = {
  payments: Payment[];
  currency: Currency;
  projectId: string;
  /** Admin view: shows notes and edit / delete controls. The portal passes false. */
  editable: boolean;
};

export function PaymentsList({ payments, currency, projectId, editable }: Props) {
  return (
    <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
      {payments.map((p) => (
        <li key={p.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-medium tabular-nums">{formatMoney(p.amount, currency)}</div>
            <div className="text-sm text-muted-foreground">
              {formatIsoDate(p.paidOn)} · {METHOD_LABELS[p.method]}
            </div>
            {editable && p.note ? <p className="mt-1 text-sm break-words">{p.note}</p> : null}
            {p.receiptPublicId ? (
              <a
                href={fileUrl(p.receiptPublicId)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm underline underline-offset-4"
              >
                <Paperclip className="size-3.5" aria-hidden />
                View receipt
              </a>
            ) : null}
          </div>
          {editable ? (
            <div className="flex shrink-0 gap-2">
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
  );
}
