"use client";

import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/payments/native-select";
import { KIND_LABELS } from "@/components/payments/labels";
import { useAction } from "@/components/common/use-action";
import { todayIso } from "@/lib/dates";
import { formatMoney, fromMinor, toMinor, type Currency } from "@/lib/money";
import { SCHEDULE_KINDS, type ScheduleKind } from "@/lib/types";
import { MAX_SCHEDULE_LINES } from "@/lib/validation/payments";
import { saveSchedule } from "@/server/actions/payments";

type LineValue = { id: string | null; label: string; kind: ScheduleKind; amount: string; dueDate: string };
type FormValues = { contractValue: string; lines: LineValue[] };

export type EditorLine = { id: string; label: string; kind: ScheduleKind; amountDue: number; dueDate: string };

function toDefaults(contractValue: number, lines: EditorLine[]): FormValues {
  return {
    contractValue: fromMinor(contractValue),
    lines: lines.map((l) => ({ id: l.id, label: l.label, kind: l.kind, amount: fromMinor(l.amountDue), dueDate: l.dueDate })),
  };
}

/**
 * Edits the contract value and every schedule line in one form. Saving is
 * blocked unless there are no lines, or the lines add up to the contract value.
 */
export function ScheduleEditor({
  projectId,
  currency,
  contractValue,
  lines,
}: {
  projectId: string;
  currency: Currency;
  contractValue: number;
  lines: EditorLine[];
}) {
  const [open, setOpen] = useState(false);
  const { pending, execute } = useAction();
  const { register, control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: toDefaults(contractValue, lines),
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const values = useWatch({ control }) as Partial<FormValues>;

  const contractMinor = toMinor(values.contractValue ?? "");
  const rows = values.lines ?? [];
  const minors = rows.map((l) => toMinor(l?.amount ?? ""));
  const sum = minors.reduce<number>((total, m) => total + (m ?? 0), 0);
  const rowsComplete = rows.every(
    (l, i) => Boolean(l?.label?.trim()) && Boolean(l?.dueDate) && minors[i] !== null && (minors[i] ?? 0) > 0,
  );
  const difference = contractMinor === null ? null : contractMinor - sum;
  const hasLines = rows.length > 0;
  const canSave = contractMinor !== null && rowsComplete && (!hasLines || difference === 0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(toDefaults(contractValue, lines));
  }

  function addLine() {
    const remaining = difference;
    append({
      id: null,
      label: "",
      kind: rows.length === 0 ? "deposit" : "milestone",
      amount: remaining !== null && remaining > 0 ? fromMinor(remaining) : "",
      dueDate: todayIso(),
    });
  }

  function onSubmit(v: FormValues) {
    execute(() => saveSchedule({ projectId, contractValue: v.contractValue, lines: v.lines }), {
      success: "Payment schedule saved",
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        <CalendarClock data-icon="inline-start" />
        Edit schedule
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Contract value and payment schedule</DialogTitle>
          <DialogDescription>
            The schedule lines must add up to the contract value. Leave the schedule empty if you do not want due dates.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4" noValidate>
          <Field>
            <FieldLabel htmlFor="schedule-contract">Contract value ({currency})</FieldLabel>
            <Input id="schedule-contract" inputMode="decimal" autoComplete="off" {...register("contractValue")} />
          </Field>

          <div className="grid grid-cols-1 gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-2 gap-3 rounded-lg p-3 ring-1 ring-foreground/10">
                <Field className="col-span-2">
                  <FieldLabel htmlFor={`line-label-${index}`}>Label</FieldLabel>
                  <Input id={`line-label-${index}`} maxLength={120} {...register(`lines.${index}.label`)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`line-kind-${index}`}>Type</FieldLabel>
                  <NativeSelect id={`line-kind-${index}`} {...register(`lines.${index}.kind`)}>
                    {SCHEDULE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABELS[k]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`line-amount-${index}`}>Amount ({currency})</FieldLabel>
                  <Input
                    id={`line-amount-${index}`}
                    inputMode="decimal"
                    autoComplete="off"
                    {...register(`lines.${index}.amount`)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`line-date-${index}`}>Due date</FieldLabel>
                  <Input id={`line-date-${index}`} type="date" {...register(`lines.${index}.dueDate`)} />
                </Field>
                <div className="flex items-end justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                    <Trash2 data-icon="inline-start" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={addLine}
              disabled={fields.length >= MAX_SCHEDULE_LINES}
            >
              <Plus data-icon="inline-start" />
              Add line
            </Button>
          </div>

          <div
            aria-live="polite"
            className={`rounded-lg px-3 py-2 text-sm ring-1 ${
              canSave ? "ring-foreground/10" : "text-destructive ring-destructive/40"
            }`}
          >
            {contractMinor === null ? (
              "Enter a valid contract value."
            ) : !hasLines ? (
              "No schedule lines. Nothing will be due or overdue."
            ) : !rowsComplete ? (
              "Every line needs a label, a due date and an amount above zero."
            ) : difference === 0 ? (
              `Schedule adds up to ${formatMoney(sum, currency)}.`
            ) : (
              `Lines total ${formatMoney(sum, currency)}. Difference: ${
                (difference ?? 0) > 0 ? "" : "-"
              }${formatMoney(Math.abs(difference ?? 0), currency)} ${(difference ?? 0) > 0 ? "still to allocate" : "over the contract value"}.`
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || !canSave}>
              {pending ? "Saving..." : "Save schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
