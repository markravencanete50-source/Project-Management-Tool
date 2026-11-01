"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/payments/native-select";
import { CATEGORY_LABELS, EXPENSE_METHOD_LABELS, RECURRING_LABELS } from "@/components/expenses/labels";
import { useAction } from "@/components/common/use-action";
import { todayIso } from "@/lib/dates";
import { latestSpentOn, recurringUntilProblem } from "@/lib/expenses";
import { fileUrl } from "@/lib/files";
import { CURRENCIES, fromMinor, toMinor, type Currency } from "@/lib/money";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  RECURRING_INTERVALS,
  type ActionResult,
  type ExpenseCategory,
  type ExpenseMethod,
  type RecurringInterval,
} from "@/lib/types";
import { uploadFile } from "@/lib/upload-client";
import { addExpense, getExpenseOptions, updateExpense, type ExpenseOptions } from "@/server/actions/expenses";

export const EXPENSE_DIALOG_EVENT = "expense-dialog:open";

/** The stored expense being edited, passed with the open event. For a recurring one this is the repeating template. */
export type EditableExpense = {
  id: string;
  description: string;
  amount: number;
  currency: Currency;
  spentOn: string;
  category: ExpenseCategory;
  method: ExpenseMethod;
  vendor: string;
  note: string;
  clientId: string | null;
  projectId: string | null;
  recurring: RecurringInterval;
  recurringUntil: string | null;
  receiptPublicId: string | null;
};

/** Open the Add expense dialog from anywhere: a button, the command palette, an edit link. */
export function openExpenseDialog(edit?: EditableExpense) {
  window.dispatchEvent(new CustomEvent(EXPENSE_DIALOG_EVENT, { detail: { edit } }));
}

/** A button that opens the dialog. Server components can render it directly. */
export function AddExpenseButton({ variant = "default", size = "default" }: { variant?: "default" | "outline"; size?: "default" | "sm" }) {
  return (
    <Button type="button" variant={variant} size={size} onClick={() => openExpenseDialog()}>
      <Plus data-icon="inline-start" />
      Add expense
    </Button>
  );
}

type Errors = Partial<Record<"description" | "amount" | "spentOn" | "recurringUntil", string>>;

export function ExpenseDialogHost() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ExpenseOptions | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [edit, setEdit] = useState<EditableExpense | null>(null);
  const [more, setMore] = useState(false);
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<Currency>("PHP");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(todayIso());
  const [category, setCategory] = useState<ExpenseCategory>("other");
  const [method, setMethod] = useState<ExpenseMethod>("card");
  const [vendor, setVendor] = useState("");
  const [note, setNote] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [recurring, setRecurring] = useState<RecurringInterval>("none");
  const [recurringUntil, setRecurringUntil] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const { pending, execute } = useAction();

  useEffect(() => {
    function onOpen(e: Event) {
      const editing = (e as CustomEvent<{ edit?: EditableExpense }>).detail?.edit ?? null;
      setEdit(editing);
      setDescription(editing?.description ?? "");
      setCurrency(editing?.currency ?? "PHP");
      setAmount(editing ? fromMinor(editing.amount) : "");
      setSpentOn(editing?.spentOn ?? todayIso());
      setCategory(editing?.category ?? "other");
      setMethod(editing?.method ?? "card");
      setVendor(editing?.vendor ?? "");
      setNote(editing?.note ?? "");
      setClientId(editing?.clientId ?? "");
      setProjectId(editing?.projectId ?? "");
      setRecurring(editing?.recurring ?? "none");
      setRecurringUntil(editing?.recurringUntil ?? "");
      setFile(null);
      setRemoveReceipt(false);
      setErrors({});
      setLoadError(false);
      // The extras stay folded away unless an edit actually uses them.
      setMore(Boolean(editing && (editing.vendor || editing.note || editing.clientId || editing.projectId || editing.recurring !== "none" || editing.receiptPublicId)));
      setOpen(true);
      // Options (clients and projects) load each time the dialog opens, so new ones always appear.
      void getExpenseOptions().then((res) => {
        if (res.ok) setOptions(res.data);
        else setLoadError(true);
      });
    }
    window.addEventListener(EXPENSE_DIALOG_EVENT, onOpen);
    return () => window.removeEventListener(EXPENSE_DIALOG_EVENT, onOpen);
  }, []);

  const projectChoices = options?.projects.filter((p) => !clientId || p.clientId === clientId) ?? [];

  function chooseClient(next: string) {
    setClientId(next);
    // A project from another client no longer fits.
    if (projectId && next && options?.projects.find((p) => p.id === projectId)?.clientId !== next) setProjectId("");
  }

  function chooseProject(next: string) {
    setProjectId(next);
    const owner = options?.projects.find((p) => p.id === next)?.clientId;
    if (next && owner) setClientId(owner);
  }

  function validate(): { ok: boolean } {
    const e: Errors = {};
    const minor = toMinor(amount);
    if (description.trim() === "") e.description = "Describe what you bought";
    if (minor === null) e.amount = "Enter a valid amount, for example 1500.50";
    else if (minor <= 0) e.amount = "Amount must be greater than zero";
    if (!spentOn) e.spentOn = "Choose the date";
    else if (spentOn > latestSpentOn(todayIso())) e.spentOn = "The date cannot be in the future";
    const stop = recurringUntilProblem({ spentOn, recurring, recurringUntil: recurringUntil || null });
    if (stop) e.recurringUntil = stop;
    setErrors(e);
    if (Object.keys(e).length > 0) {
      // Problems in the folded-away part must be visible.
      if (e.recurringUntil) setMore(true);
      return { ok: false };
    }
    return { ok: true };
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate().ok) return;
    execute(
      async (): Promise<ActionResult<unknown>> => {
        let receipt: string | null = removeReceipt ? null : (edit?.receiptPublicId ?? null);
        if (file) {
          try {
            receipt = await uploadFile(file, { projectId: "expenses", purpose: "expense-receipts" });
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
          }
        }
        const data = {
          description: description.trim(),
          amount,
          currency,
          spentOn,
          category,
          method,
          vendor,
          note,
          clientId: clientId || null,
          projectId: projectId || null,
          recurring,
          recurringUntil: recurring === "none" ? null : recurringUntil || null,
          receiptPublicId: receipt,
        };
        return edit ? updateExpense({ ...data, id: edit.id }) : addExpense(data);
      },
      { success: edit ? "Expense updated" : "Expense added", onSuccess: () => setOpen(false) },
    );
  }

  const existingReceipt = edit?.receiptPublicId && !removeReceipt ? edit.receiptPublicId : null;
  const showReceipt = options?.receipts ?? false;
  const repeating = recurring !== "none";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>
            {edit && edit.recurring !== "none"
              ? "You are editing the repeating expense. Changes apply to every repeat, past and future."
              : "Money you spent. It comes off your available money and never changes what you earned."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
          {loadError ? <p className="text-sm text-destructive">Could not load clients and projects. You can still save without linking one.</p> : null}
          <FieldGroup>
            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel htmlFor="ex-description">What did you buy</FieldLabel>
              <Input
                id="ex-description"
                autoComplete="off"
                maxLength={160}
                placeholder="Figma subscription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={Boolean(errors.description)}
              />
              <FieldError errors={[errors.description ? { message: errors.description } : undefined]} />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.amount)}>
                <FieldLabel htmlFor="ex-amount">Amount</FieldLabel>
                <div className="flex gap-2">
                  <NativeSelect aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="w-24 shrink-0">
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    id="ex-amount"
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
              <Field data-invalid={Boolean(errors.spentOn)}>
                <FieldLabel htmlFor="ex-date">{repeating ? "First date" : "Date spent"}</FieldLabel>
                <Input id="ex-date" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} aria-invalid={Boolean(errors.spentOn)} />
                <FieldError errors={[errors.spentOn ? { message: errors.spentOn } : undefined]} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="ex-category">Category</FieldLabel>
              <NativeSelect id="ex-category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              aria-controls="ex-more"
              className="flex w-fit items-center gap-1.5 rounded-md py-1 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <ChevronDown className={`size-4 transition-transform duration-200 ${more ? "rotate-180" : ""}`} aria-hidden />
              {more ? "Fewer details" : "More details"}
              <span className="hidden font-normal text-muted-foreground sm:inline">payment method, vendor, client, repeat, receipt</span>
            </button>

            {more ? (
              <div id="ex-more" className="grid gap-4 rounded-xl border bg-muted/20 p-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="ex-method">Paid with</FieldLabel>
                    <NativeSelect id="ex-method" value={method} onChange={(e) => setMethod(e.target.value as ExpenseMethod)}>
                      {EXPENSE_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {EXPENSE_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ex-vendor">Vendor (optional)</FieldLabel>
                    <Input id="ex-vendor" autoComplete="off" maxLength={120} value={vendor} onChange={(e) => setVendor(e.target.value)} />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="ex-note">Note (optional)</FieldLabel>
                  <Textarea id="ex-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="ex-client">For client (optional)</FieldLabel>
                    <NativeSelect id="ex-client" value={clientId} onChange={(e) => chooseClient(e.target.value)}>
                      <option value="">No client</option>
                      {options?.clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ex-project">For project (optional)</FieldLabel>
                    <NativeSelect id="ex-project" value={projectId} onChange={(e) => chooseProject(e.target.value)}>
                      <option value="">No project</option>
                      {projectChoices.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="ex-repeat">Repeat</FieldLabel>
                    <NativeSelect id="ex-repeat" value={recurring} onChange={(e) => setRecurring(e.target.value as RecurringInterval)}>
                      {RECURRING_INTERVALS.map((r) => (
                        <option key={r} value={r}>
                          {RECURRING_LABELS[r]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  {repeating ? (
                    <Field data-invalid={Boolean(errors.recurringUntil)}>
                      <FieldLabel htmlFor="ex-until">Stop repeating after (optional)</FieldLabel>
                      <Input
                        id="ex-until"
                        type="date"
                        value={recurringUntil}
                        onChange={(e) => setRecurringUntil(e.target.value)}
                        aria-invalid={Boolean(errors.recurringUntil)}
                      />
                      <FieldError errors={[errors.recurringUntil ? { message: errors.recurringUntil } : undefined]} />
                    </Field>
                  ) : null}
                </div>
                {repeating ? (
                  <p className="text-xs text-muted-foreground" data-testid="repeat-help">
                    Repeats are worked out automatically from the first date up to today and counted as separate dated expenses. Only this one expense is saved, so edit or delete it here to change every repeat. Set a stop date to end the repeat.
                  </p>
                ) : null}

                {showReceipt ? (
                  <Field>
                    <FieldLabel htmlFor="ex-receipt">Receipt (optional)</FieldLabel>
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
                    <Input id="ex-receipt" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    <FieldDescription>Image or PDF, up to 10 MB.</FieldDescription>
                  </Field>
                ) : null}
              </div>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : edit ? "Save changes" : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
