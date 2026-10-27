"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useAction } from "@/components/common/use-action";
import { LabeledSelect } from "@/components/prospects/labeled-select";
import { SOURCE_LABELS, toItems } from "@/components/prospects/labels";
import { CURRENCIES, fromMinor } from "@/lib/money";
import { prospectInputSchema, type ProspectFormValues, type ProspectInput } from "@/lib/validation/prospects";
import { createProspect, updateProspect } from "@/server/actions/prospects";
import type { Prospect } from "@/lib/types";

const SOURCE_ITEMS = toItems(SOURCE_LABELS);
const CURRENCY_ITEMS = CURRENCIES.map((c) => ({ value: c, label: c }));

function defaults(p?: Prospect): ProspectFormValues {
  return {
    name: p?.name ?? "",
    company: p?.company ?? "",
    email: p?.email ?? "",
    source: p?.source ?? "other",
    service: p?.service ?? "",
    estimatedValue: p && p.estimatedValue ? fromMinor(p.estimatedValue) : "",
    currency: p?.currency ?? "USD",
    nextFollowUp: p?.nextFollowUp ?? "",
    notes: p?.notes ?? "",
  };
}

/** Create (no prospect) or edit (with prospect) form. */
export function ProspectForm({
  prospect,
  onDone,
  submitLabel,
}: {
  prospect?: Prospect;
  onDone?: () => void;
  submitLabel?: string;
}) {
  const { pending, execute } = useAction();
  const form = useForm<ProspectFormValues, unknown, ProspectInput>({
    resolver: zodResolver(prospectInputSchema),
    defaultValues: defaults(prospect),
  });
  const { register, control, formState } = form;
  const errors = formState.errors;

  // The server parses the raw strings again; the resolver only gives instant feedback.
  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    execute(() => (prospect ? updateProspect(prospect.id, values) : createProspect(values)), {
      success: prospect ? "Prospect updated" : "Prospect added",
      onSuccess: () => {
        if (!prospect) form.reset(defaults());
        onDone?.();
      },
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="p-name">Name</FieldLabel>
            <Input id="p-name" autoComplete="off" aria-invalid={!!errors.name} {...register("name")} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={!!errors.company}>
            <FieldLabel htmlFor="p-company">Company</FieldLabel>
            <Input id="p-company" autoComplete="off" {...register("company")} />
            <FieldError errors={[errors.company]} />
          </Field>
        </div>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="p-email">Email</FieldLabel>
          <Input id="p-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="p-source">Source</FieldLabel>
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <LabeledSelect
                  id="p-source"
                  className="w-full"
                  value={field.value}
                  onValueChange={field.onChange}
                  items={SOURCE_ITEMS}
                />
              )}
            />
          </Field>
          <Field data-invalid={!!errors.service}>
            <FieldLabel htmlFor="p-service">Service</FieldLabel>
            <Input id="p-service" autoComplete="off" placeholder="Website build" {...register("service")} />
            <FieldError errors={[errors.service]} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_6.5rem] gap-4">
          <Field data-invalid={!!errors.estimatedValue}>
            <FieldLabel htmlFor="p-value">Estimated value</FieldLabel>
            <Input
              id="p-value"
              inputMode="decimal"
              autoComplete="off"
              placeholder="1500.00"
              aria-invalid={!!errors.estimatedValue}
              {...register("estimatedValue")}
            />
            <FieldError errors={[errors.estimatedValue]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-currency">Currency</FieldLabel>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <LabeledSelect
                  id="p-currency"
                  className="w-full"
                  value={field.value}
                  onValueChange={field.onChange}
                  items={CURRENCY_ITEMS}
                />
              )}
            />
          </Field>
        </div>
        <Field data-invalid={!!errors.nextFollowUp}>
          <FieldLabel htmlFor="p-follow">Next follow-up</FieldLabel>
          <Input id="p-follow" type="date" aria-invalid={!!errors.nextFollowUp} {...register("nextFollowUp")} />
          <FieldError errors={[errors.nextFollowUp]} />
        </Field>
        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor="p-notes">Notes</FieldLabel>
          <Textarea id="p-notes" rows={4} {...register("notes")} />
          <FieldError errors={[errors.notes]} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : (submitLabel ?? (prospect ? "Save changes" : "Add prospect"))}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
