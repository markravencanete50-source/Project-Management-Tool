"use client";

import { useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Building2, FileSignature, RotateCcw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { SettingsSection } from "@/components/settings/settings-section";
import { saveSettings } from "@/server/actions/settings";
import { settingsSchema, type SettingsInput } from "@/lib/validation/settings";
import { cn } from "@/lib/utils";

export const TEMPLATE_PLACEHOLDERS: { key: string; meaning: string }[] = [
  { key: "{{businessName}}", meaning: "Your business name" },
  { key: "{{businessEmail}}", meaning: "Your business email" },
  { key: "{{clientName}}", meaning: "Client contact name" },
  { key: "{{clientCompany}}", meaning: "Client company" },
  { key: "{{clientEmail}}", meaning: "Client email" },
  { key: "{{projectTitle}}", meaning: "Project title" },
  { key: "{{scope}}", meaning: "Project description and scope" },
  { key: "{{price}}", meaning: "Contract value with currency" },
  { key: "{{currency}}", meaning: "Currency code" },
  { key: "{{paymentSchedule}}", meaning: "Payment schedule lines" },
  { key: "{{revisionAllowance}}", meaning: "Included revision rounds" },
  { key: "{{startDate}}", meaning: "Start date" },
  { key: "{{deadline}}", meaning: "Deadline" },
  { key: "{{agreementDate}}", meaning: "Agreement date" },
  { key: "{{governingLaw}}", meaning: "Governing law (Republic of the Philippines)" },
];

const ACCEPTED_OPTIONS: { value: SettingsInput["acceptedRule"]; title: string; hint: string }[] = [
  { value: "signed", title: "The agreement is signed", hint: "The project becomes active as soon as the client signs." },
  { value: "deposit_paid", title: "The deposit is paid in full", hint: "The project becomes active once the deposit is covered." },
];

export function SettingsForm({ initial, defaultTemplate }: { initial: SettingsInput; defaultTemplate: string }) {
  const router = useRouter();
  const form = useForm<SettingsInput>({ resolver: zodResolver(settingsSchema), defaultValues: initial });
  const errors = form.formState.errors;
  const { isDirty, isSubmitting } = form.formState;
  const templateRef = useRef<HTMLTextAreaElement | null>(null);
  const { ref: templateFormRef, ...templateField } = form.register("agreementTemplate");
  const templateLength = (useWatch({ control: form.control, name: "agreementTemplate" }) ?? "").length;

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

  /** Drops a placeholder into the template at the caret. */
  function insertPlaceholder(key: string) {
    const el = templateRef.current;
    const current = form.getValues("agreementTemplate") ?? "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? start;
    form.setValue("agreementTemplate", current.slice(0, start) + key + current.slice(end), {
      shouldDirty: true,
      shouldValidate: true,
    });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + key.length, start + key.length);
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      <SettingsSection icon={<Building2 />} title="Business" description="Shown in emails, agreements and the client portal.">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
          <Field>
            <FieldLabel htmlFor="timezone">Time zone</FieldLabel>
            <Input id="timezone" value="Asia/Manila, fixed in v1" readOnly disabled className="sm:max-w-sm" />
            <FieldDescription>Month totals and due dates all use Manila time.</FieldDescription>
          </Field>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        icon={<FileSignature />}
        title="Agreements and acceptance"
        description="When a project counts as accepted, and how many revisions new projects include."
      >
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">A project counts as accepted when</FieldLegend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ACCEPTED_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm transition-[border-color,background-color,box-shadow] duration-150",
                    "hover:bg-muted/40 has-checked:border-primary/60 has-checked:bg-primary/5 has-checked:shadow-xs has-focus-visible:ring-3 has-focus-visible:ring-ring/40",
                  )}
                >
                  <input
                    type="radio"
                    value={opt.value}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    {...form.register("acceptedRule")}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{opt.title}</span>
                    <span className="block text-muted-foreground">{opt.hint}</span>
                  </span>
                </label>
              ))}
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
              className="tabular-nums sm:max-w-32"
              aria-invalid={!!errors.defaultRevisionAllowance}
              {...form.register("defaultRevisionAllowance", { valueAsNumber: true })}
            />
            <FieldDescription>Applied to new projects. Extra rounds are billed as change orders.</FieldDescription>
            <FieldError errors={[errors.defaultRevisionAllowance]} />
          </Field>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        icon={<ScrollText />}
        title="Agreement template"
        description="Plain text. Placeholders in double braces are filled in for each project."
      >
        <div className="flex flex-col gap-4">
          <details className="rounded-lg border bg-muted/30 text-sm">
            <summary className="cursor-pointer rounded-lg px-3 py-2.5 font-medium outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40">
              Supported placeholders
              <span className="ml-2 font-normal text-muted-foreground">Select one to insert it at the cursor</span>
            </summary>
            <ul className="grid gap-1.5 border-t p-3 sm:grid-cols-2">
              {TEMPLATE_PLACEHOLDERS.map((p) => (
                <li key={p.key} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => insertPlaceholder(p.key)}
                    className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md border bg-card px-2.5 py-1.5 text-left outline-none transition-[border-color,background-color] duration-150 hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/40"
                  >
                    <code className="font-mono text-xs text-primary">{p.key}</code>
                    <span className="text-xs text-muted-foreground">{p.meaning}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <Field data-invalid={!!errors.agreementTemplate}>
            <FieldLabel htmlFor="agreementTemplate">Template text</FieldLabel>
            <Textarea
              id="agreementTemplate"
              rows={24}
              spellCheck={false}
              className="min-h-112 resize-y bg-muted/20 font-mono text-[13px] leading-6 md:text-[13px]"
              aria-invalid={!!errors.agreementTemplate}
              {...templateField}
              ref={(el) => {
                templateFormRef(el);
                templateRef.current = el;
              }}
            />
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <FieldDescription className="min-w-0 flex-1">
                Signed agreements keep the text they were generated with. Edits only affect new versions.
              </FieldDescription>
              <span className="text-xs text-muted-foreground tabular-nums">{templateLength.toLocaleString()} characters</span>
            </div>
            <FieldError errors={[errors.agreementTemplate]} />
          </Field>
          <div>
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
              <RotateCcw data-icon="inline-start" />
              Reset to default
            </Button>
          </div>
        </div>
      </SettingsSection>

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border bg-card/90 p-3 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <p aria-live="polite" className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn("size-2 shrink-0 rounded-full transition-colors duration-200", isDirty ? "bg-warning" : "bg-success")}
          />
          <span className="truncate">{isDirty ? "You have unsaved changes" : "All changes saved"}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {isDirty ? (
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => form.reset(initial)}>
              Discard
            </Button>
          ) : null}
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </div>
    </form>
  );
}
