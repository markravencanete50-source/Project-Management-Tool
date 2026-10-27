"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { saveSettings } from "@/server/actions/settings";
import { settingsSchema, type SettingsInput } from "@/lib/validation/settings";

export const TEMPLATE_PLACEHOLDERS: { key: string; meaning: string }[] = [
  { key: "{{businessName}}", meaning: "Your business name" },
  { key: "{{businessEmail}}", meaning: "Your business email" },
  { key: "{{clientName}}", meaning: "Client contact name" },
  { key: "{{clientCompany}}", meaning: "Client company" },
  { key: "{{clientEmail}}", meaning: "Client email" },
  { key: "{{projectTitle}}", meaning: "Project title" },
  { key: "{{scope}}", meaning: "Project description and scope" },
  { key: "{{price}}", meaning: "Contract value with currency" },
  { key: "{{paymentSchedule}}", meaning: "Payment schedule lines" },
  { key: "{{revisionAllowance}}", meaning: "Included revision rounds" },
  { key: "{{startDate}}", meaning: "Start date" },
  { key: "{{deadline}}", meaning: "Deadline" },
  { key: "{{date}}", meaning: "Agreement date" },
];

export function SettingsForm({ initial, defaultTemplate }: { initial: SettingsInput; defaultTemplate: string }) {
  const router = useRouter();
  const form = useForm<SettingsInput>({ resolver: zodResolver(settingsSchema), defaultValues: initial });
  const errors = form.formState.errors;

  async function onSubmit(values: SettingsInput) {
    const res = await saveSettings(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Settings saved");
    form.reset(values);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
          <CardDescription>Used in emails, agreements and the portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={!!errors.businessName}>
              <FieldLabel htmlFor="businessName">Business name</FieldLabel>
              <Input id="businessName" aria-invalid={!!errors.businessName} {...form.register("businessName")} />
              <FieldError errors={[errors.businessName]} />
            </Field>
            <Field data-invalid={!!errors.businessEmail}>
              <FieldLabel htmlFor="businessEmail">Business email</FieldLabel>
              <Input id="businessEmail" type="email" aria-invalid={!!errors.businessEmail} {...form.register("businessEmail")} />
              <FieldDescription>Clients reply to this address.</FieldDescription>
              <FieldError errors={[errors.businessEmail]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="timezone">Time zone</FieldLabel>
              <Input id="timezone" value="Asia/Manila, fixed in v1" readOnly disabled />
              <FieldDescription>Month totals and due dates all use Manila time.</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Defaults for how projects are accepted and how many revisions are included.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">A project counts as accepted when</FieldLegend>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" value="signed" className="mt-1" {...form.register("acceptedRule")} />
                  <span>The agreement is signed</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" value="deposit_paid" className="mt-1" {...form.register("acceptedRule")} />
                  <span>The deposit is paid in full</span>
                </label>
              </div>
              <FieldDescription>Changes apply going forward only. Projects already accepted keep their date.</FieldDescription>
              <FieldError errors={[errors.acceptedRule]} />
            </FieldSet>
            <Field data-invalid={!!errors.defaultRevisionAllowance}>
              <FieldLabel htmlFor="defaultRevisionAllowance">Default included revisions</FieldLabel>
              <Input
                id="defaultRevisionAllowance"
                type="number"
                min={0}
                max={50}
                step={1}
                inputMode="numeric"
                className="sm:max-w-32"
                aria-invalid={!!errors.defaultRevisionAllowance}
                {...form.register("defaultRevisionAllowance", { valueAsNumber: true })}
              />
              <FieldDescription>Applied to new projects. Extra rounds are billed as change orders.</FieldDescription>
              <FieldError errors={[errors.defaultRevisionAllowance]} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agreement template</CardTitle>
          <CardDescription>Plain text. Placeholders in double braces are filled in for each project.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Supported placeholders</summary>
            <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]">
              {TEMPLATE_PLACEHOLDERS.map((p) => (
                <div key={p.key} className="contents">
                  <dt>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{p.key}</code>
                  </dt>
                  <dd className="text-muted-foreground">{p.meaning}</dd>
                </div>
              ))}
            </dl>
          </details>
          <Field data-invalid={!!errors.agreementTemplate}>
            <FieldLabel htmlFor="agreementTemplate">Template text</FieldLabel>
            <Textarea
              id="agreementTemplate"
              rows={24}
              spellCheck={false}
              className="min-h-96 font-mono text-xs leading-relaxed md:text-xs"
              aria-invalid={!!errors.agreementTemplate}
              {...form.register("agreementTemplate")}
            />
            <FieldDescription>Signed agreements keep the text they were generated with. Edits only affect new versions.</FieldDescription>
            <FieldError errors={[errors.agreementTemplate]} />
          </Field>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.confirm("Replace the template text with the default? Nothing is saved until you press Save settings.")) {
                form.setValue("agreementTemplate", defaultTemplate, { shouldDirty: true, shouldValidate: true });
              }
            }}
          >
            Reset to default
          </Button>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 p-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
          {form.formState.isSubmitting ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
