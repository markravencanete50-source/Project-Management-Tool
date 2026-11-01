"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/projects-core/simple-select";
import { RetainerSchedule } from "@/components/projects-core/retainer-schedule";
import { KindPicker } from "@/components/common/kind-picker";
import { useAction } from "@/components/common/use-action";
import { createProject } from "@/server/actions/projects";
import { projectCreateSchema } from "@/lib/validation/projects";
import { CURRENCIES, type Currency } from "@/lib/money";
import { isFlatUnit, type ProjectKind, type RateUnit } from "@/lib/types";

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));
const UNIT_OPTIONS: { value: RateUnit; label: string }[] = [
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
];

export type ClientChoice = { id: string; name: string; company: string; defaultCurrency: Currency };

/** Every field as typed. Fields that do not apply to the chosen kind are ignored on submit. */
type FormValues = {
  kind: ProjectKind;
  clientId: string;
  title: string;
  description: string;
  currency: Currency;
  contractValue: string;
  revisionAllowance: string;
  rateUnit: RateUnit;
  rate: string;
  hoursPerDay: string;
  daysPerMonth: string;
  startDate: string;
  deadline: string;
  endDate: string;
};

/** Validate with the same schema the server uses, mapping issues onto form fields. */
const resolver: Resolver<FormValues> = async (values) => {
  const parsed = projectCreateSchema.safeParse(values);
  if (parsed.success) return { values, errors: {} };
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "root");
    if (!errors[key]) errors[key] = { type: "validation", message: issue.message };
  }
  return { values: {}, errors };
};

export function ProjectCreateForm({
  clients,
  initialClientId,
  initialKind = "fixed",
  defaultRevisionAllowance,
}: {
  clients: ClientChoice[];
  initialClientId: string | null;
  initialKind?: ProjectKind;
  defaultRevisionAllowance: number;
}) {
  const router = useRouter();
  const { pending, execute } = useAction();
  const preselected = clients.find((c) => c.id === initialClientId) ?? null;
  const [kind, setKind] = useState<ProjectKind>(initialKind);

  const form = useForm<FormValues>({
    resolver,
    defaultValues: {
      kind: initialKind,
      clientId: preselected?.id ?? "",
      title: "",
      description: "",
      currency: preselected?.defaultCurrency ?? "GBP",
      contractValue: "",
      revisionAllowance: String(defaultRevisionAllowance),
      rateUnit: "hour",
      rate: "",
      hoursPerDay: "8",
      daysPerMonth: "22",
      startDate: "",
      deadline: "",
      endDate: "",
    },
  });
  const { register, control, handleSubmit, setValue, formState } = form;
  const { errors } = formState;

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.company ? `${c.name} (${c.company})` : c.name }));
  const unit = useWatch({ control, name: "rateUnit" });
  const currency = useWatch({ control, name: "currency" });
  const rateText = useWatch({ control, name: "rate" }) ?? "";
  const hoursText = useWatch({ control, name: "hoursPerDay" }) ?? "";
  const daysText = useWatch({ control, name: "daysPerMonth" }) ?? "";

  function chooseKind(next: ProjectKind) {
    setKind(next);
    setValue("kind", next);
    form.clearErrors();
  }

  function onSubmit() {
    const values = form.getValues();
    execute(() => createProject(values), {
      success: "Project created",
      refresh: false,
      onSuccess: (data) => router.push(`/admin/projects/${data.id}`),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="enter flex max-w-2xl flex-col gap-6" noValidate>
      <section className="flex flex-col gap-3" aria-labelledby="project-kind-heading">
        <div>
          <h2 id="project-kind-heading" className="text-sm font-semibold">
            What kind of work is this?
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">The kind decides how the work is tracked and billed. It cannot be changed later.</p>
        </div>
        <KindPicker value={kind} onChange={chooseKind} idPrefix="new-project-kind" label="Kind of project" />
      </section>

      <FieldGroup className="gap-6 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <Field data-invalid={Boolean(errors.clientId)}>
          <FieldLabel htmlFor="project-client">Client</FieldLabel>
          <Controller
            control={control}
            name="clientId"
            render={({ field }) => (
              <SimpleSelect
                id="project-client"
                value={field.value}
                placeholder="Choose a client"
                options={clientOptions}
                onValueChange={(v) => {
                  field.onChange(v);
                  const chosen = clients.find((c) => c.id === v);
                  if (chosen) setValue("currency", chosen.defaultCurrency);
                }}
              />
            )}
          />
          <FieldDescription>Every project belongs to one client. The currency follows their default.</FieldDescription>
          <FieldError errors={[errors.clientId]} />
        </Field>

        <Field data-invalid={Boolean(errors.title)}>
          <FieldLabel htmlFor="project-title">Title</FieldLabel>
          <Input id="project-title" autoComplete="off" aria-invalid={Boolean(errors.title)} {...register("title")} />
          <FieldError errors={[errors.title]} />
        </Field>

        <Field data-invalid={Boolean(errors.description)}>
          <FieldLabel htmlFor="project-description">Description</FieldLabel>
          <Textarea id="project-description" rows={4} {...register("description")} />
          <FieldDescription>
            {kind === "fixed" ? "Scope summary. It is used when generating the agreement." : "What the work covers. The client sees this in their portal."}
          </FieldDescription>
          <FieldError errors={[errors.description]} />
        </Field>

        <div key={kind} className="enter-fade flex flex-col gap-6">
          <Field>
            <FieldLabel htmlFor="project-currency">Currency</FieldLabel>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <SimpleSelect id="project-currency" value={field.value} onValueChange={field.onChange} options={CURRENCY_OPTIONS} />
              )}
            />
          </Field>

          {kind === "fixed" ? (
            <>
              <Field data-invalid={Boolean(errors.contractValue)}>
                <FieldLabel htmlFor="project-value">Contract value</FieldLabel>
                <Input
                  id="project-value"
                  inputMode="decimal"
                  placeholder="1500.00"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.contractValue)}
                  {...register("contractValue")}
                />
                <FieldDescription>Payment schedule is set up afterwards in the Payments tab.</FieldDescription>
                <FieldError errors={[errors.contractValue]} />
              </Field>
              <Field data-invalid={Boolean(errors.revisionAllowance)}>
                <FieldLabel htmlFor="project-revisions">Included revision rounds</FieldLabel>
                <Input
                  id="project-revisions"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.revisionAllowance)}
                  {...register("revisionAllowance")}
                />
                <FieldDescription>Extra rounds beyond this number can be quoted as change orders.</FieldDescription>
                <FieldError errors={[errors.revisionAllowance]} />
              </Field>
            </>
          ) : null}

          {kind === "retainer" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="project-unit">Billed</FieldLabel>
                <Controller
                  control={control}
                  name="rateUnit"
                  render={({ field }) => (
                    <SimpleSelect id="project-unit" value={field.value} onValueChange={(v) => field.onChange(v)} options={UNIT_OPTIONS} />
                  )}
                />
              </Field>
              <Field data-invalid={Boolean(errors.rate)}>
                <FieldLabel htmlFor="project-rate">Rate per {unit}</FieldLabel>
                <Input
                  id="project-rate"
                  inputMode="decimal"
                  placeholder={unit === "hour" ? "25.00" : "180.00"}
                  autoComplete="off"
                  aria-invalid={Boolean(errors.rate)}
                  {...register("rate")}
                />
                <FieldError errors={[errors.rate]} />
              </Field>
              <p className="text-sm text-muted-foreground sm:col-span-2">
                {isFlatUnit(unit)
                  ? `Billed automatically every ${unit} at this flat rate, with no time logging. The first ${unit} is charged in full (no proration). Each ${unit} falls due on its last day. Billing stops at the last day of service. There is no agreement step.`
                  : "You log time against this rate. Each month is billed in arrears and falls due on its last day. There is no agreement step."}
              </p>
              <div className="sm:col-span-2">
                <RetainerSchedule
                  idPrefix="project"
                  hoursField={register("hoursPerDay")}
                  daysField={register("daysPerMonth")}
                  hoursError={errors.hoursPerDay}
                  daysError={errors.daysPerMonth}
                  unit={unit}
                  currency={currency}
                  rateText={rateText}
                  hoursText={hoursText}
                  daysText={daysText}
                />
              </div>
            </div>
          ) : null}

          {kind === "tasks" ? (
            <>
              <Field data-invalid={Boolean(errors.rate)}>
                <FieldLabel htmlFor="project-task-price">Default price per task ({currency}), optional</FieldLabel>
                <Input
                  id="project-task-price"
                  inputMode="decimal"
                  placeholder="500.00"
                  autoComplete="off"
                  className="tabular-nums sm:max-w-52"
                  aria-invalid={Boolean(errors.rate)}
                  {...register("rate")}
                />
                <FieldDescription>New tasks start at this price. You can change any task&apos;s price.</FieldDescription>
                <FieldError errors={[errors.rate]} />
              </Field>
              <p className="text-sm text-muted-foreground">
                Add priced tasks after creating the project. A task is owed the moment you mark it done. There is no agreement step.
              </p>
            </>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.startDate)}>
            <FieldLabel htmlFor="project-start">Start date</FieldLabel>
            <Input id="project-start" type="date" {...register("startDate")} />
            {kind !== "fixed" ? <FieldDescription>Defaults to today. The project counts as accepted on this date.</FieldDescription> : null}
            <FieldError errors={[errors.startDate]} />
          </Field>
          {kind === "retainer" ? (
            <Field data-invalid={Boolean(errors.endDate)}>
              <FieldLabel htmlFor="project-end">Last day of service, optional</FieldLabel>
              <Input id="project-end" type="date" {...register("endDate")} />
              {isFlatUnit(unit) ? <FieldDescription>Week and month billing stops after this day. Leave blank while it is ongoing.</FieldDescription> : null}
              <FieldError errors={[errors.endDate]} />
            </Field>
          ) : (
            <Field data-invalid={Boolean(errors.deadline)}>
              <FieldLabel htmlFor="project-deadline">Deadline</FieldLabel>
              <Input id="project-deadline" type="date" {...register("deadline")} />
              <FieldError errors={[errors.deadline]} />
            </Field>
          )}
        </div>
      </FieldGroup>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
