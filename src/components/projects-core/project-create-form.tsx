"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/projects-core/simple-select";
import { useAction } from "@/components/common/use-action";
import { createProject } from "@/server/actions/projects";
import { projectCreateSchema, type ProjectCreateInput } from "@/lib/validation/projects";
import { CURRENCIES, type Currency } from "@/lib/money";

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

export type ClientChoice = { id: string; name: string; company: string; defaultCurrency: Currency };

export function ProjectCreateForm({
  clients,
  initialClientId,
  defaultRevisionAllowance,
}: {
  clients: ClientChoice[];
  initialClientId: string | null;
  defaultRevisionAllowance: number;
}) {
  const router = useRouter();
  const { pending, execute } = useAction();
  const preselected = clients.find((c) => c.id === initialClientId) ?? null;

  const form = useForm<ProjectCreateInput, unknown, unknown>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      clientId: preselected?.id ?? "",
      title: "",
      description: "",
      currency: preselected?.defaultCurrency ?? "GBP",
      contractValue: "",
      revisionAllowance: String(defaultRevisionAllowance),
      startDate: "",
      deadline: "",
    },
  });
  const { register, control, handleSubmit, setValue, formState } = form;
  const { errors } = formState;

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.company ? `${c.name} (${c.company})` : c.name }));

  function onSubmit() {
    const values = form.getValues();
    execute(() => createProject(values), {
      success: "Project created",
      refresh: false,
      onSuccess: (data) => router.push(`/admin/projects/${data.id}`),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-2xl flex-col gap-6" noValidate>
      <FieldGroup>
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
          <FieldDescription>Scope summary. It is used when generating the agreement.</FieldDescription>
          <FieldError errors={[errors.description]} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
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
            <FieldError errors={[errors.contractValue]} />
          </Field>
        </div>

        <Field data-invalid={Boolean(errors.revisionAllowance)}>
          <FieldLabel htmlFor="project-revisions">Included revision rounds</FieldLabel>
          <Input
            id="project-revisions"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(errors.revisionAllowance)}
            {...register("revisionAllowance")}
          />
          <FieldError errors={[errors.revisionAllowance]} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.startDate)}>
            <FieldLabel htmlFor="project-start">Start date</FieldLabel>
            <Input id="project-start" type="date" {...register("startDate")} />
            <FieldError errors={[errors.startDate]} />
          </Field>
          <Field data-invalid={Boolean(errors.deadline)}>
            <FieldLabel htmlFor="project-deadline">Deadline</FieldLabel>
            <Input id="project-deadline" type="date" {...register("deadline")} />
            <FieldError errors={[errors.deadline]} />
          </Field>
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
