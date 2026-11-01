"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/dashboard/segmented-control";
import { NativeSelect } from "@/components/payments/native-select";
import { METHOD_LABELS } from "@/components/payments/labels";
import { useAction } from "@/components/common/use-action";
import { todayIso } from "@/lib/dates";
import { fileUrl } from "@/lib/files";
import { CURRENCIES, fromMinor, toMinor, type Currency } from "@/lib/money";
import { latestPaidOn, payerProblem } from "@/lib/standalone-payments";
import { PAYMENT_METHODS, type ActionResult, type PaymentMethod } from "@/lib/types";
import { uploadFile } from "@/lib/upload-client";
import { addPayment } from "@/server/actions/payments";
import {
  addStandalonePayment,
  getRecordPaymentOptions,
  updateStandalonePayment,
  type RecordPaymentOptions,
} from "@/server/actions/standalone-payments";

export const RECORD_PAYMENT_EVENT = "record-payment:open";

/** The payment-only entry being edited, passed with the open event. */
export type EditableStandalone = {
  id: string;
  clientId: string | null;
  payerName: string;
  note: string;
  currency: Currency;
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  receiptPublicId: string | null;
};

/** Open the Record payment dialog from anywhere: a button, the command palette, an edit link. */
export function openRecordPayment(edit?: EditableStandalone) {
  window.dispatchEvent(new CustomEvent(RECORD_PAYMENT_EVENT, { detail: { edit } }));
}

/** A button that opens the dialog. Server components can render it directly. */
export function RecordPaymentButton({ variant = "default", size = "default" }: { variant?: "default" | "outline"; size?: "default" | "sm" }) {
  return (
    <Button type="button" variant={variant} size={size} onClick={() => openRecordPayment()}>
      <Plus data-icon="inline-start" />
      Record payment
    </Button>
  );
}

type Mode = "only" | "project";
const SOMEONE_ELSE = "__other";

type Errors = Partial<Record<"who" | "payerName" | "amount" | "paidOn" | "project", string>>;

export function RecordPaymentHost() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<RecordPaymentOptions | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [edit, setEdit] = useState<EditableStandalone | null>(null);
  const [mode, setMode] = useState<Mode>("only");
  const [who, setWho] = useState(SOMEONE_ELSE);
  const [payerName, setPayerName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [currency, setCurrency] = useState<Currency>("PHP");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const { pending, execute } = useAction();

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ edit?: EditableStandalone }>).detail;
      const editing = detail?.edit ?? null;
      setEdit(editing);
      setMode("only");
      setWho(editing ? (editing.clientId ?? SOMEONE_ELSE) : SOMEONE_ELSE);
      setPayerName(editing?.payerName ?? "");
      setProjectId("");
      setCurrency(editing?.currency ?? "PHP");
      setAmount(editing ? fromMinor(editing.amount) : "");
      setPaidOn(editing?.paidOn ?? todayIso());
      setMethod(editing?.method ?? "bank");
      setNote(editing?.note ?? "");
      setFile(null);
      setRemoveReceipt(false);
      setErrors({});
      setLoadError(false);
      setOpen(true);
      // Options (clients and projects) load once per page view, when the dialog first opens.
      void getRecordPaymentOptions().then((res) => {
        if (res.ok) setOptions(res.data);
        else setLoadError(true);
      });
    }
    window.addEventListener(RECORD_PAYMENT_EVENT, onOpen);
    return () => window.removeEventListener(RECORD_PAYMENT_EVENT, onOpen);
  }, []);

  const clientProjects = options?.projects.filter((p) => p.clientId === who) ?? [];
  const project = options?.projects.find((p) => p.id === projectId) ?? null;
  const shownCurrency: Currency = mode === "project" ? (project?.currency ?? "PHP") : currency;

  function chooseWho(next: string) {
    setWho(next);
    setProjectId("");
    const client = options?.clients.find((c) => c.id === next);
    if (client && !edit) setCurrency(client.defaultCurrency);
  }

  function chooseProject(next: string) {
    setProjectId(next);
  }

  function validate(): { minor: number } | null {
    const e: Errors = {};
    const minor = toMinor(amount);
    if (minor === null) e.amount = "Enter a valid amount, for example 1500.50";
    else if (minor <= 0) e.amount = "Amount must be greater than zero";
    if (!paidOn) e.paidOn = "Choose the date";
    else if (paidOn > latestPaidOn(todayIso())) e.paidOn = "The date cannot be in the future";
    if (mode === "only") {
      const problem = payerProblem({ clientId: who === SOMEONE_ELSE ? null : who, payerName });
      if (problem) e.payerName = problem;
    } else {
      if (who === SOMEONE_ELSE) e.who = "Choose a client";
      else if (!projectId) e.project = "Choose a project";
    }
    setErrors(e);
    return Object.keys(e).length === 0 && minor !== null ? { minor } : null;
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    execute(
      async (): Promise<ActionResult<unknown>> => {
        let receipt: string | null = removeReceipt ? null : (edit?.receiptPublicId ?? null);
        if (file) {
          try {
            receipt = await uploadFile(file, {
              projectId: mode === "project" ? projectId : "standalone",
              purpose: mode === "project" ? "receipts" : "standalone-receipts",
            });
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
          }
        }
        if (mode === "project") {
          return addPayment({ projectId, amount, paidOn, method, note, receiptPublicId: receipt });
        }
        const body = {
          clientId: who === SOMEONE_ELSE ? null : who,
          payerName: payerName.trim(),
          note,
          currency,
          amount,
          paidOn,
          method,
          receiptPublicId: receipt,
        };
        return edit ? updateStandalonePayment({ ...body, id: edit.id }) : addStandalonePayment(body);
      },
      {
        success: edit ? "Payment updated" : mode === "project" ? "Payment recorded" : "Payment recorded (no project)",
        onSuccess: () => setOpen(false),
      },
    );
  }

  const existingReceipt = edit?.receiptPublicId && !removeReceipt ? edit.receiptPublicId : null;
  const showReceipt = options?.receipts ?? false;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? "Edit payment" : "Record payment"}</DialogTitle>
          <DialogDescription>
            {edit
              ? "Correct the details of money you received. This payment is not attached to a project."
              : mode === "only"
                ? "Money you received that does not belong to a project. It counts as earnings on the dashboard."
                : "Attach the payment to a project. It settles the oldest unpaid bill first and the client is emailed."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
          {edit ? null : (
            <SegmentedControl<Mode>
              label="Where does this payment go"
              value={mode}
              onChange={(next) => {
                setMode(next);
                setErrors({});
                if (next === "project" && who === SOMEONE_ELSE) setWho("");
                if (next === "only" && who === "") setWho(SOMEONE_ELSE);
              }}
              className="w-full [&>button]:flex-1"
              options={[
                { value: "only", label: "Payment only" },
                { value: "project", label: "Attach to a project" },
              ]}
            />
          )}
          {loadError ? <p className="text-sm text-destructive">Could not load clients and projects. Close this and try again.</p> : null}
          <FieldGroup>
            {mode === "only" ? (
              <>
                <Field data-invalid={Boolean(errors.payerName)}>
                  <FieldLabel htmlFor="rp-who">Who paid</FieldLabel>
                  <NativeSelect id="rp-who" value={who} onChange={(e) => chooseWho(e.target.value)}>
                    <option value={SOMEONE_ELSE}>Someone else</option>
                    {options?.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.company ? `, ${c.company}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                {who === SOMEONE_ELSE ? (
                  <Field data-invalid={Boolean(errors.payerName)}>
                    <FieldLabel htmlFor="rp-payer">Payer name</FieldLabel>
                    <Input
                      id="rp-payer"
                      autoComplete="off"
                      maxLength={120}
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                      aria-invalid={Boolean(errors.payerName)}
                    />
                    <FieldError errors={[errors.payerName ? { message: errors.payerName } : undefined]} />
                  </Field>
                ) : null}
              </>
            ) : (
              <>
                <Field data-invalid={Boolean(errors.who)}>
                  <FieldLabel htmlFor="rp-client">Client</FieldLabel>
                  <NativeSelect id="rp-client" value={who === SOMEONE_ELSE ? "" : who} onChange={(e) => chooseWho(e.target.value)}>
                    <option value="">Choose a client</option>
                    {options?.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <FieldError errors={[errors.who ? { message: errors.who } : undefined]} />
                </Field>
                <Field data-invalid={Boolean(errors.project)}>
                  <FieldLabel htmlFor="rp-project">Project</FieldLabel>
                  <NativeSelect id="rp-project" value={projectId} onChange={(e) => chooseProject(e.target.value)} disabled={!who || who === SOMEONE_ELSE}>
                    <option value="">{clientProjects.length === 0 && who && who !== SOMEONE_ELSE ? "This client has no projects" : "Choose a project"}</option>
                    {clientProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.currency})
                      </option>
                    ))}
                  </NativeSelect>
                  <FieldError errors={[errors.project ? { message: errors.project } : undefined]} />
                </Field>
              </>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.amount)}>
                <FieldLabel htmlFor="rp-amount">Amount</FieldLabel>
                <div className="flex gap-2">
                  {mode === "only" ? (
                    <NativeSelect aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="w-24 shrink-0">
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <span className="grid h-10 w-16 shrink-0 place-items-center rounded-lg border bg-muted/40 text-sm font-medium text-muted-foreground sm:h-9">
                      {shownCurrency}
                    </span>
                  )}
                  <Input
                    id="rp-amount"
                    inputMode="decimal"
                    placeholder="1500.00"
                    autoComplete="off"
                    className="min-w-0 tabular-nums"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-invalid={Boolean(errors.amount)}
                  />
                </div>
                <FieldError errors={[errors.amount ? { message: errors.amount } : undefined]} />
              </Field>
              <Field data-invalid={Boolean(errors.paidOn)}>
                <FieldLabel htmlFor="rp-date">Date received</FieldLabel>
                <Input id="rp-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} aria-invalid={Boolean(errors.paidOn)} />
                <FieldError errors={[errors.paidOn ? { message: errors.paidOn } : undefined]} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="rp-method">Method</FieldLabel>
              <NativeSelect id="rp-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="rp-note">Note (optional)</FieldLabel>
              <Textarea id="rp-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {showReceipt ? (
              <Field>
                <FieldLabel htmlFor="rp-receipt">Receipt (optional)</FieldLabel>
                {existingReceipt ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <Paperclip className="size-3.5 text-muted-foreground" aria-hidden />
                    <a href={fileUrl(existingReceipt)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
                      Current receipt
                    </a>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveReceipt(true)}>
                      Remove
                    </Button>
                  </div>
                ) : null}
                <Input id="rp-receipt" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <FieldDescription>Image or PDF, up to 10 MB.</FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || loadError}>
              {pending ? "Saving..." : edit ? "Save changes" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
