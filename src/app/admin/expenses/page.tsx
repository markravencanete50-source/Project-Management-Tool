import { Suspense } from "react";
import Link from "next/link";
import { Paperclip, Receipt, Repeat } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { CategoryBars } from "@/components/expenses/category-bars";
import { DeleteExpenseButton } from "@/components/expenses/delete-expense-button";
import { EditExpenseButton } from "@/components/expenses/edit-expense-button";
import { AddExpenseButton } from "@/components/expenses/expense-dialog";
import { ExpenseFilterBar } from "@/components/expenses/expense-filters";
import { CATEGORY_LABELS, EXPENSE_METHOD_LABELS, RECURRING_LABELS } from "@/components/expenses/labels";
import { requireAdmin } from "@/lib/auth/session";
import { formatIsoDate } from "@/lib/dates";
import {
  categoryBreakdowns,
  expenseMonths,
  expenseTotals,
  filterExpenseLines,
  parseExpenseFilters,
  templateOf,
  type ExpenseLine,
} from "@/lib/expenses";
import { fileUrl } from "@/lib/files";
import { convertMoney } from "@/lib/fx/convert";
import { sourceMix } from "@/lib/fx/overrides";
import { currenciesIn, formatMoney } from "@/lib/money";
import { loadRateTable } from "@/server/data/fx";
import { getExpenseLedger } from "@/server/data/expenses";
import { getSettings } from "@/server/data/settings";

export const metadata = { title: "Expenses" };

type Names = { clients: Map<string, string>; projects: Map<string, string> };

function Links({ line, names }: { line: ExpenseLine; names: Names }) {
  const client = line.clientId ? names.clients.get(line.clientId) : null;
  const project = line.projectId ? names.projects.get(line.projectId) : null;
  if (!client && !project) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {client ? (
        <Link href={`/admin/clients/${line.clientId}`} className="underline-offset-4 hover:text-foreground hover:underline">
          {client}
        </Link>
      ) : null}
      {project ? (
        <Link href={`/admin/projects/${line.projectId}`} className="underline-offset-4 hover:text-foreground hover:underline">
          {project}
        </Link>
      ) : null}
    </span>
  );
}

function RepeatBadges({ line }: { line: ExpenseLine }) {
  if (line.recurring === "none") return null;
  return (
    <>
      <Badge variant="teal">
        <Repeat aria-hidden />
        {RECURRING_LABELS[line.recurring]}
      </Badge>
      {line.derived ? (
        <Badge variant="violet" title="Added automatically from the repeating expense. It is not stored on its own.">
          Recurring
        </Badge>
      ) : null}
    </>
  );
}

function ReceiptLink({ line }: { line: ExpenseLine }) {
  // A repeat is not a new purchase, so the receipt belongs to the first (stored) one only.
  return line.receiptPublicId && !line.derived ? (
    <a
      href={fileUrl(line.receiptPublicId)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      <Paperclip className="size-3.5" aria-hidden />
      Receipt
    </a>
  ) : null;
}

function Actions({ line }: { line: ExpenseLine }) {
  const repeating = line.recurring !== "none";
  return (
    <div className="flex gap-2">
      <EditExpenseButton expense={templateOf(line)} repeating={repeating} />
      <DeleteExpenseButton id={line.expenseId} label={formatMoney(line.amount, line.currency)} repeating={repeating} />
    </div>
  );
}

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  await requireAdmin();
  const filters = parseExpenseFilters(await searchParams);
  const [ledger, settings] = await Promise.all([getExpenseLedger(), getSettings()]);
  const rows = filterExpenseLines(ledger.lines, filters);
  const totals = expenseTotals(rows);
  const currencies = currenciesIn(totals);
  const rates = currencies.some((c) => c !== "PHP") ? await loadRateTable(currencies, settings.fxOverrides) : null;
  const phpTotal = rates ? convertMoney(totals, rates) : currencies.length === 1 && currencies[0] === "PHP" ? (totals.PHP ?? 0) : null;
  const mix = rates ? sourceMix(rates) : "none";
  // One PHP breakdown when the rates cover every currency in view, otherwise one per currency.
  const groups = categoryBreakdowns(rows, rates && currencies.length > 1 ? rates : null);
  const repeats = rows.filter((r) => r.derived).length;
  const names: Names = {
    clients: new Map(ledger.clients.map((c) => [c.id, c.name])),
    projects: new Map(ledger.projects.map((p) => [p.id, p.title])),
  };

  return (
    <>
      <PageHeader
        title="Expenses"
        description="What you spent, and what it comes off. Repeating expenses are added automatically."
        actions={<AddExpenseButton />}
      />

      <div className="flex flex-col gap-5">
        <Suspense fallback={null}>
          <ExpenseFilterBar filters={filters} months={expenseMonths(ledger.lines)} clients={ledger.clients} />
        </Suspense>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardContent className="flex flex-col gap-4" data-testid="expenses-totals">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {rows.length} {rows.length === 1 ? "expense" : "expenses"} shown
                  {repeats > 0 ? `, ${repeats} ${repeats === 1 ? "repeat" : "repeats"} included` : ""}
                </p>
                {currencies.length === 0 ? (
                  <p className="mt-1 text-lg font-semibold text-muted-foreground">Nothing spent</p>
                ) : (
                  <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-lg font-semibold tabular-nums">
                    {currencies.map((c) => (
                      <span key={c}>{formatMoney(totals[c] ?? 0, c)}</span>
                    ))}
                  </p>
                )}
              </div>
              {phpTotal !== null && !(currencies.length === 1 && currencies[0] === "PHP") ? (
                <div data-testid="expenses-php-total">
                  <p className="text-xs font-medium text-muted-foreground">
                    Total in PHP{mix === "manual" ? " (your rates)" : mix === "mixed" ? " (your rates and live rates)" : " (live rates)"}
                  </p>
                  <p className="text-lg font-semibold tabular-nums">{formatMoney(phpTotal, "PHP")}</p>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Spending is subtracted from your available money on the dashboard. Earnings are never reduced by it.
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>By category</CardTitle>
            </CardHeader>
            <CardContent>
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No spending in this view yet.</p>
              ) : (
                <CategoryBars groups={groups} label="Spending by category" />
              )}
            </CardContent>
          </Card>
        </div>

        {rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Receipt />
              </EmptyMedia>
              <EmptyTitle>{ledger.lines.length === 0 ? "No expenses yet" : "No expenses match"}</EmptyTitle>
              <EmptyDescription>
                {ledger.lines.length === 0
                  ? "Add what you bought and what you spent it on. It comes off your available money."
                  : "Try a different month, currency, category or client, or clear the search."}
              </EmptyDescription>
            </EmptyHeader>
            {ledger.lines.length === 0 ? (
              <EmptyContent>
                <AddExpenseButton />
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <div className="md:overflow-x-auto md:rounded-xl md:border md:bg-card md:shadow-xs">
            <table className="hidden w-full min-w-[56rem] text-sm md:table">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Expense</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Paid with</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody data-testid="expense-rows">
                {rows.map((r) => (
                  <tr key={r.key} data-testid="expense-row" className="border-b border-border/70 align-top last:border-b-0 hover:bg-muted/40">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatIsoDate(r.date)}</td>
                    <td className="max-w-80 px-4 py-3">
                      <span className="block font-medium break-words">{r.description}</span>
                      {r.vendor ? <span className="block text-xs text-muted-foreground break-words">{r.vendor}</span> : null}
                      {r.note ? <span className="mt-0.5 block text-sm break-words text-muted-foreground">{r.note}</span> : null}
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <RepeatBadges line={r} />
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Links line={r} names={names} />
                        <ReceiptLink line={r} />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{CATEGORY_LABELS[r.category]}</Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{EXPENSE_METHOD_LABELS[r.method]}</td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums">{formatMoney(r.amount, r.currency)}</td>
                    <td className="px-4 py-3">
                      <Actions line={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="stagger grid gap-3 md:hidden">
              {rows.map((r) => (
                <li key={r.key} data-testid="expense-row" className="flex flex-col gap-2.5 rounded-xl border bg-card p-4 shadow-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-lg font-semibold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
                    <span className="text-sm text-muted-foreground">{formatIsoDate(r.date)}</span>
                  </div>
                  <p className="text-sm font-medium break-words">{r.description}</p>
                  {r.vendor ? <p className="-mt-1.5 text-xs break-words text-muted-foreground">{r.vendor}</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{CATEGORY_LABELS[r.category]}</Badge>
                    <Badge variant="outline">{EXPENSE_METHOD_LABELS[r.method]}</Badge>
                    <RepeatBadges line={r} />
                  </div>
                  {r.note ? <p className="text-sm break-words text-muted-foreground">{r.note}</p> : null}
                  <Links line={r} names={names} />
                  <ReceiptLink line={r} />
                  <Actions line={r} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
