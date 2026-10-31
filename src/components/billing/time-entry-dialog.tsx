"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/common/use-action";
import { entryAmount, fromHundredths, toHundredths, UNIT_LABELS } from "@/lib/billing";
import { todayIso } from "@/lib/dates";
import { formatMoney, type Currency } from "@/lib/money";
import type { ActionResult, RateUnit } from "@/lib/types";
import { addTimeEntry, updateTimeEntry } from "@/server/actions/time-entries";

export type EditableEntry = { id: string; date: string; quantityHundredths: number; note: string };
type FormValues = { date: string; quantity: string; note: string };

function defaults(entry?: EditableEntry): FormValues {
  return entry
    ? { date: entry.date, quantity: fromHundredths(entry.quantityHundredths), note: entry.note }
    : { date: todayIso(), quantity: "", note: "" };
}

/** Log time (no `entry` prop) or edit an entry. Shows what the entry is worth as you type. */
export function TimeEntryDialog({
  projectId,
  unit,
  rate,
  currency,
  entry,
}: {
  projectId: string;
  unit: RateUnit;
  rate: number;
  currency: Currency;
  entry?: EditableEntry;
}) {
  const [open, setOpen] = useState(false);
  const { pending, execute } = useAction();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: defaults(entry) });

  const typed = toHundredths(useWatch({ control, name: "quantity" }) ?? "");
  const word = UNIT_LABELS[unit].plural;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(defaults(entry));
  }

  function onSubmit(values: FormValues) {
    execute(
      async (): Promise<ActionResult<unknown>> => {
        const body = { projectId, date: values.date, quantity: values.quantity, note: values.note };
        return entry ? updateTimeEntry({ ...body, entryId: entry.id }) : addTimeEntry(body);
      },
      { success: entry ? "Time entry updated" : "Time logged", onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant={entry ? "outline" : "default"} size={entry ? "sm" : "default"} />}>
        {entry ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
        {entry ? "Edit" : "Log time"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? "Edit time entry" : "Log time"}</DialogTitle>
          <DialogDescription>
            {entry ? "Correct the details of this entry." : `Record ${word} worked. Each month is billed in arrears.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4" noValidate>
          <FieldGroup>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.date)}>
                <FieldLabel htmlFor="time-date">Date worked</FieldLabel>
                <Input id="time-date" type="date" aria-invalid={Boolean(errors.date)} {...register("date", { required: "Choose the date" })} />
                <FieldError errors={[errors.date]} />
              </Field>
              <Field data-invalid={Boolean(errors.quantity)}>
                <FieldLabel htmlFor="time-quantity">{unit === "hour" ? "Hours" : "Days"}</FieldLabel>
                <Input
                  id="time-quantity"
                  inputMode="decimal"
                  placeholder={unit === "hour" ? "7.5" : "1"}
                  autoComplete="off"
                  className="tabular-nums"
                  aria-invalid={Boolean(errors.quantity)}
                  aria-describedby="time-quantity-hint"
                  {...register("quantity", {
                    validate: (v) =>
                      toHundredths(v) !== null || "Enter a number above 0 and up to 1000, with at most 2 decimals, for example 7.5",
                  })}
                />
                <FieldError errors={[errors.quantity]} />
              </Field>
            </div>
            <p id="time-quantity-hint" className="-mt-1 text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {typed !== null ? (
                <>
                  Worth <span className="font-medium text-foreground">{formatMoney(entryAmount(typed, rate), currency)}</span> at{" "}
                  {formatMoney(rate, currency)} per {UNIT_LABELS[unit].singular}.
                </>
              ) : (
                <>Rate is {formatMoney(rate, currency)} per {UNIT_LABELS[unit].singular}.</>
              )}
            </p>
            <Field data-invalid={Boolean(errors.note)}>
              <FieldLabel htmlFor="time-note">Note (optional)</FieldLabel>
              <Textarea id="time-note" rows={2} maxLength={300} {...register("note")} />
              <FieldDescription>For your records. Clients do not see individual entries or notes.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : entry ? "Save changes" : "Log time"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
