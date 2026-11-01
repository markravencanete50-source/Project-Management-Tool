"use client";

import { useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RetainerSchedule } from "@/components/projects-core/retainer-schedule";
import { SimpleSelect } from "@/components/projects-core/simple-select";
import { useAction } from "@/components/common/use-action";
import { updateProject } from "@/server/actions/projects";
import { projectUpdateSchema, retainerUpdateSchema, tasksUpdateSchema } from "@/lib/validation/projects";
import type { Currency } from "@/lib/money";
import { isFlatUnit, type ProjectKind, type RateUnit } from "@/lib/types";

/** Every editable field as typed. Fields that do not apply to the kind are left out of the request. */
export type EditValues = {
  title: string;
  description: string;
  revisionAllowance: string;
  rateUnit: RateUnit;
  rate: string;
  /** Retainers: working schedule as typed ("8", "22"). */
  hoursPerDay: string;
  daysPerMonth: string;
  startDate: string;
  deadline: string;
  /** Retainers: last day of service. */
  endDate: string;
};

const UNIT_OPTIONS: { value: RateUnit; label: string }[] = [
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
];

function resolverFor(kind: ProjectKind): Resolver<EditValues> {
  const schema = kind === "retainer" ? retainerUpdateSchema : kind === "tasks" ? tasksUpdateSchema : projectUpdateSchema;
  return async (values) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "root");
      if (!errors[key]) errors[key] = { type: "validation", message: issue.message };
    }
    return { values: {}, errors };
  };
}

/** Edits title, description, dates and the kind's own settings. Never contract value, status or kind. */
export function ProjectEditDialog({
  projectId,
  kind,
  initial,
  currency,
  triggerLabel = "Edit",
  compact = false,
}: {
  projectId: string;
  kind: ProjectKind;
  initial: EditValues;
  /** Used to label the default price per task field. */
  currency?: Currency;
  triggerLabel?: string;
  /** A small ghost trigger, for shortcuts placed inside a page section. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { pending, execute } = useAction();

  const form = useForm<EditValues>({ resolver: resolverFor(kind), defaultValues: initial });
  const { register, control, handleSubmit, reset, formState } = form;
  const { errors } = formState;
  const unit = useWatch({ control, name: "rateUnit" });
  const rateText = useWatch({ control, name: "rate" }) ?? "";
  const hoursText = useWatch({ control, name: "hoursPerDay" }) ?? "";
  const daysText = useWatch({ control, name: "daysPerMonth" }) ?? "";

  function onSubmit() {
    const values = form.getValues();
    execute(() => updateProject(projectId, values), { success: "Project updated", onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(initial);
      }}
    >
      <DialogTrigger render={<Button variant={compact ? "ghost" : "outline"} size={compact ? "sm" : "default"} />}>
        <Pencil data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            {kind === "fixed"
              ? "Contract value and the payment schedule are edited in the Payments tab."
              : kind === "retainer"
                ? "Time is logged in the Time log tab. Payments are recorded in the Payments tab."
                : "Tasks are managed in the Tasks tab. Payments are recorded in the Payments tab."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.title)}>
              <FieldLabel htmlFor="edit-title">Title</FieldLabel>
              <Input id="edit-title" autoComplete="off" aria-invalid={Boolean(errors.title)} {...register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea id="edit-description" rows={4} {...register("description")} />
              <FieldDescription>
                {kind === "fixed" ? "Scope summary shown on the project and used in the agreement." : "What the work covers. The client sees this in their portal."}
              </FieldDescription>
              <FieldError errors={[errors.description]} />
            </Field>
            {kind === "fixed" ? (
              <Field data-invalid={Boolean(errors.revisionAllowance)}>
                <FieldLabel htmlFor="edit-revisions">Included revision rounds</FieldLabel>
                <Input id="edit-revisions" inputMode="numeric" aria-invalid={Boolean(errors.revisionAllowance)} {...register("revisionAllowance")} />
                <FieldDescription>Changing this does not alter the agreement that was already generated.</FieldDescription>
                <FieldError errors={[errors.revisionAllowance]} />
              </Field>
            ) : null}
            {kind === "retainer" ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="edit-unit">Billed</FieldLabel>
                  <Controller
                    control={control}
                    name="rateUnit"
                    render={({ field }) => <SimpleSelect id="edit-unit" value={field.value} onValueChange={(v) => field.onChange(v)} options={UNIT_OPTIONS} />}
                  />
                </Field>
                <Field data-invalid={Boolean(errors.rate)}>
                  <FieldLabel htmlFor="edit-rate">Rate per {unit}</FieldLabel>
                  <Input id="edit-rate" inputMode="decimal" autoComplete="off" aria-invalid={Boolean(errors.rate)} {...register("rate")} />
                  <FieldError errors={[errors.rate]} />
                </Field>
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  {isFlatUnit(unit)
                    ? `Changing the rate re-prices every billing period, past ${unit}s included, because bills are worked out from the current rate. The first ${unit} is always charged in full.`
                    : "Changing the rate re-prices all logged time, past months included, because bills are worked out from the current rate."}
                </p>
                <div className="sm:col-span-2">
                  <RetainerSchedule
                    idPrefix="edit"
                    hoursField={register("hoursPerDay")}
                    daysField={register("daysPerMonth")}
                    hoursError={errors.hoursPerDay}
                    daysError={errors.daysPerMonth}
                    unit={unit}
                    currency={currency ?? "USD"}
                    rateText={rateText}
                    hoursText={hoursText}
                    daysText={daysText}
                  />
                </div>
              </div>
            ) : null}
            {kind === "tasks" ? (
              <Field data-invalid={Boolean(errors.rate)}>
                <FieldLabel htmlFor="edit-task-price">Default price per task{currency ? ` (${currency})` : ""}, optional</FieldLabel>
                <Input
                  id="edit-task-price"
                  inputMode="decimal"
                  placeholder="500.00"
                  autoComplete="off"
                  className="tabular-nums sm:max-w-52"
                  aria-invalid={Boolean(errors.rate)}
                  {...register("rate")}
                />
                <FieldDescription>
                  New tasks start at this price. Changing it does not reprice existing tasks. Leave it blank for no default.
                </FieldDescription>
                <FieldError errors={[errors.rate]} />
              </Field>
            ) : null}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.startDate)}>
                <FieldLabel htmlFor="edit-start">Start date</FieldLabel>
                <Input id="edit-start" type="date" {...register("startDate")} />
                <FieldError errors={[errors.startDate]} />
              </Field>
              {kind === "retainer" ? (
                <Field data-invalid={Boolean(errors.endDate)}>
                  <FieldLabel htmlFor="edit-end">Last day of service, optional</FieldLabel>
                  <Input id="edit-end" type="date" {...register("endDate")} />
                  {isFlatUnit(unit) ? <FieldDescription>Week and month billing stops after this day.</FieldDescription> : null}
                  <FieldError errors={[errors.endDate]} />
                </Field>
              ) : (
                <Field data-invalid={Boolean(errors.deadline)}>
                  <FieldLabel htmlFor="edit-deadline">Deadline</FieldLabel>
                  <Input id="edit-deadline" type="date" {...register("deadline")} />
                  <FieldError errors={[errors.deadline]} />
                </Field>
              )}
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
