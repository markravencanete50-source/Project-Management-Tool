"use client";

import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Building2, FileSignature, Landmark, PiggyBank, RotateCcw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { SettingsSection } from "@/components/settings/settings-section";
import { saveSettings } from "@/server/actions/settings";
import { settingsSchema, type SettingsInput } from "@/lib/validation/settings";
import { SegmentedControl } from "@/components/dashboard/segmented-control";
import { OVERRIDABLE, parseRateInput, unitsToInput, type OverridableCurrency } from "@/lib/fx/overrides";
import { CURRENCIES, fromMinor, toMinorSigned, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

export type LiveRateHint = { rate: string; raw: number; label: string };

/** One currency: "Live rate" or "My rate", the number input, the live hint and a one-click reset. */
function FxRateRow({
  currency,
  form,
  live,
}: {
  currency: OverridableCurrency;
  form: ReturnType<typeof useForm<SettingsInput>>;
  live: LiveRateHint | undefined;
}) {
  const path = `fxOverrides.${currency}` as const;
  const stored = form.getValues(path);
  const [mode, setMode] = useState<"live" | "mine">(typeof stored === "number" && !Number.isNaN(stored) ? "mine" : "live");
  const [text, setText] = useState(typeof stored === "number" && !Number.isNaN(stored) ? unitsToInput(stored) : "");
  const error = form.formState.errors.fxOverrides?.[currency];
  const inputId = `fx-${currency}`;

  function push(next: string) {
    setText(next);
    form.setValue(path, parseRateInput(next) ?? Number.NaN, { shouldDirty: true, shouldValidate: true });
  }

  function change(next: "live" | "mine") {
    if (next === mode) return;
    setMode(next);
    if (next === "live") {
      form.setValue(path, null, { shouldDirty: true, shouldValidate: true });
    } else {
      // Start from the live rate (trimmed to 4 decimals) so the field is never empty.
      const start = text || (live ? String(Math.round(live.raw * 10000) / 10000) : "");
      push(start);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-medium">
          {currency} to PHP
          <span className="ml-2 font-normal text-muted-foreground tabular-nums">
            {live ? `Live now: ${live.rate}, ${live.label}` : "Live rate not available right now"}
          </span>
        </p>
        <SegmentedControl<"live" | "mine">
          label={`${currency} rate source`}
          value={mode}
          onChange={change}
          options={[
            { value: "live", label: "Live rate" },
            { value: "mine", label: "My rate" },
          ]}
        />
      </div>
      {mode === "mine" ? (
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={inputId}>
            1 {currency} = <span className="sr-only">how many</span> PHP
          </FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">1 {currency} =</span>
            <Input
              id={inputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="56.1234"
              value={text}
              onChange={(e) => push(e.target.value)}
              aria-invalid={!!error}
              className="w-36 tabular-nums"
            />
            <span className="text-sm text-muted-foreground">PHP</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => change("live")}>
              <RotateCcw data-icon="inline-start" />
              Use live rate
            </Button>
          </div>
          <FieldDescription>Up to 4 decimal places. Used for every {currency} amount on the dashboard, including past payments.</FieldDescription>
          <FieldError errors={[error]} />
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">The dashboard uses the live {currency} rate.</p>
      )}
    </div>
  );
}

/** One currency's optional opening balance: a signed decimal, blank for none. */
function OpeningBalanceRow({ currency, form }: { currency: Currency; form: ReturnType<typeof useForm<SettingsInput>> }) {
  const path = `openingBalances.${currency}` as const;
  const stored = form.getValues(path);
  const [text, setText] = useState(typeof stored === "number" && !Number.isNaN(stored) ? fromMinor(stored) : "");
  const error = form.formState.errors.openingBalances?.[currency];
  const inputId = `opening-${currency}`;

  function push(next: string) {
    setText(next);
    // Blank means no opening balance; anything unreadable is NaN so the schema shows its message.
    const minor = next.trim() === "" ? null : toMinorSigned(next);
    form.setValue(path, next.trim() === "" ? null : (minor ?? Number.NaN), { shouldDirty: true, shouldValidate: true });
  }

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={inputId}>{currency} opening balance</FieldLabel>
      <Input
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={text}
        onChange={(e) => push(e.target.value)}
        aria-invalid={!!error}
        className="tabular-nums"
      />
      <FieldError errors={[error]} />
    </Field>
  );
}

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

export function SettingsForm({
  initial,
  defaultTemplate,
  liveRates = {},
}: {
  initial: SettingsInput;
  defaultTemplate: string;
  liveRates?: Partial<Record<string, LiveRateHint>>;
}) {
  const router = useRouter();
  // Bumped on Discard so the rate rows remount from the reset values.
  const [discards, setDiscards] = useState(0);
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
        icon={<Landmark />}
        title="Exchange rates"
        description="The dashboard shows money in PHP. Use the live rate, or set your own for USD and GBP. A rate you set always wins."
      >
        <FieldGroup>
          {OVERRIDABLE.map((c) => (
            <FxRateRow key={`${c}-${discards}`} currency={c} form={form} live={liveRates[c]} />
          ))}
          <p className="text-xs text-muted-foreground">PHP to PHP is always 1. When every currency in use has your rate, no live rate is looked up.</p>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        icon={<PiggyBank />}
        title="Money"
        description="Optional opening balance for available money. Available money is opening balance + money received - money spent: a net figure from what you record here, not a bank balance."
      >
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-3">
            {CURRENCIES.map((c) => (
              <OpeningBalanceRow key={`${c}-${discards}`} currency={c} form={form} />
            ))}
          </div>
          <FieldDescription>Leave a currency blank for no opening balance. Use a minus sign if you started in debt, for example -200.</FieldDescription>
          <Field data-invalid={!!errors.openingBalanceDate}>
            <FieldLabel htmlFor="openingBalanceDate">Opening balance date (optional)</FieldLabel>
            <Input
              id="openingBalanceDate"
              type="date"
              className="sm:max-w-48"
              aria-invalid={!!errors.openingBalanceDate}
              {...form.register("openingBalanceDate", { setValueAs: (v: string) => (v ? v : null) })}
            />
            <FieldDescription>
              When set, money before this date is not counted: only payments and expenses on or after it are included in available money. Earnings and spending charts still show everything.
            </FieldDescription>
            <FieldError errors={[errors.openingBalanceDate]} />
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
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => {
                form.reset(initial);
                setDiscards((n) => n + 1);
              }}>
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
