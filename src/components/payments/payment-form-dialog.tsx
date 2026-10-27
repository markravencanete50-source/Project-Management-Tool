"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/payments/native-select";
import { METHOD_LABELS } from "@/components/payments/labels";
import { useAction } from "@/components/common/use-action";
import { todayIso } from "@/lib/dates";
import { fileUrl } from "@/lib/files";
import { fromMinor, toMinor, type Currency } from "@/lib/money";
import { PAYMENT_METHODS, type ActionResult, type PaymentMethod } from "@/lib/types";
import { uploadFile } from "@/lib/upload-client";
import { addPayment, updatePayment } from "@/server/actions/payments";

type EditablePayment = {
  id: string;
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  note: string;
  receiptPublicId: string | null;
};

type FormValues = { amount: string; paidOn: string; method: PaymentMethod; note: string };

function defaults(payment?: EditablePayment): FormValues {
  return payment
    ? { amount: fromMinor(payment.amount), paidOn: payment.paidOn, method: payment.method, note: payment.note }
    : { amount: "", paidOn: todayIso(), method: "bank", note: "" };
}

/** Add a payment (no `payment` prop) or edit an existing one. */
export function PaymentFormDialog({
  projectId,
  currency,
  payment,
}: {
  projectId: string;
  currency: Currency;
  payment?: EditablePayment;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const { pending, execute } = useAction();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: defaults(payment) });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      reset(defaults(payment));
      setFile(null);
      setRemoveReceipt(false);
    }
  }

  function onSubmit(values: FormValues) {
    execute(
      async (): Promise<ActionResult<unknown>> => {
        let receipt: string | null = removeReceipt ? null : (payment?.receiptPublicId ?? null);
        if (file) {
          try {
            receipt = await uploadFile(file, { projectId, purpose: "receipts" });
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
          }
        }
        const body = { projectId, ...values, receiptPublicId: receipt };
        return payment ? updatePayment({ ...body, paymentId: payment.id }) : addPayment(body);
      },
      { success: payment ? "Payment updated" : "Payment recorded", onSuccess: () => setOpen(false) },
    );
  }

  const hasExistingReceipt = Boolean(payment?.receiptPublicId) && !removeReceipt;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant={payment ? "outline" : "default"} size={payment ? "sm" : "default"} />}>
        {payment ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
        {payment ? "Edit" : "Add payment"}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{payment ? "Edit payment" : "Add payment"}</DialogTitle>
          <DialogDescription>
            {payment
              ? "Correct the details of money you received."
              : `Record money you received, in ${currency}. The client is emailed a confirmation.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4" noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.amount)}>
              <FieldLabel htmlFor="payment-amount">Amount ({currency})</FieldLabel>
              <Input
                id="payment-amount"
                inputMode="decimal"
                placeholder="1500.00"
                autoComplete="off"
                aria-invalid={Boolean(errors.amount)}
                {...register("amount", {
                  validate: (v) => {
                    const minor = toMinor(v);
                    if (minor === null) return "Enter a valid amount, for example 1500.50";
                    return minor > 0 || "Amount must be greater than zero";
                  },
                })}
              />
              <FieldError errors={[errors.amount]} />
            </Field>
            <Field data-invalid={Boolean(errors.paidOn)}>
              <FieldLabel htmlFor="payment-date">Date received</FieldLabel>
              <Input
                id="payment-date"
                type="date"
                aria-invalid={Boolean(errors.paidOn)}
                {...register("paidOn", { required: "Choose the date" })}
              />
              <FieldError errors={[errors.paidOn]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="payment-method">Method</FieldLabel>
              <NativeSelect id="payment-method" {...register("method")}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="payment-note">Note (optional)</FieldLabel>
              <Textarea id="payment-note" rows={2} maxLength={500} {...register("note")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="payment-receipt">Receipt (optional)</FieldLabel>
              {hasExistingReceipt && payment?.receiptPublicId ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <a
                    href={fileUrl(payment.receiptPublicId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    Current receipt
                  </a>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveReceipt(true)}>
                    Remove
                  </Button>
                </div>
              ) : null}
              <Input
                id="payment-receipt"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">Image or PDF, up to 10 MB.</p>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : payment ? "Save changes" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
