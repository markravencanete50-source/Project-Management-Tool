import { Suspense } from "react";
import Link from "next/link";
import { Paperclip, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { DeleteStandaloneButton } from "@/components/payments/delete-standalone-button";
import { EditStandaloneButton } from "@/components/payments/edit-standalone-button";
import { LedgerFilterBar } from "@/components/payments/ledger-filters";
import { METHOD_LABELS } from "@/components/payments/labels";
import { RecordPaymentButton } from "@/components/payments/record-payment";
import { requireAdmin } from "@/lib/auth/session";
import { formatIsoDate } from "@/lib/dates";
import { fileUrl } from "@/lib/files";
import { convertMoney } from "@/lib/fx/convert";
import { sourceMix } from "@/lib/fx/overrides";
import { currenciesIn, formatMoney } from "@/lib/money";
import { filterLedger, ledgerMonths, ledgerTotals, parseFilters, type LedgerRow } from "@/lib/standalone-payments";
import { loadRateTable } from "@/server/data/fx";
import { getSettings } from "@/server/data/settings";
import { getLedger } from "@/server/data/standalone-payments";

export const metadata = { title: "Payments" };

function SourceBadge({ row }: { row: LedgerRow }) {
  if (row.source === "standalone") {
    return (
      <Badge variant="teal" dot>
        Payment only
      </Badge>
    );
  }
  return (
    <Link href={`/admin/projects/${row.projectId}?tab=payments`} className="inline-flex max-w-full rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
      <Badge variant="outline" className="max-w-full truncate hover:bg-muted">
        Project: {row.projectTitle}
      </Badge>
    </Link>
  );
}

function Actions({ row }: { row: LedgerRow }) {
  if (row.source === "project") {
    return (
      <Link href={`/admin/projects/${row.projectId}?tab=payments`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        Edit in project
      </Link>
    );
  }
  return (
    <div className="flex gap-2">
      <EditStandaloneButton
        payment={{
          id: row.id,
          clientId: row.clientId,
          payerName: row.clientId ? "" : row.who,
          note: row.note,
          currency: row.currency,
          amount: row.amount,
          paidOn: row.paidOn,
          method: row.method,
          receiptPublicId: row.receiptPublicId,
        }}
      />
      <DeleteStandaloneButton id={row.id} label={formatMoney(row.amount, row.currency)} />
    </div>
  );
}

function Receipt({ row }: { row: LedgerRow }) {
  return row.receiptPublicId ? (
    <a
      href={fileUrl(row.receiptPublicId)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      <Paperclip className="size-3.5" aria-hidden />
      Receipt
    </a>
  ) : null;
}

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireAdmin();
  const filters = parseFilters(await searchParams);
  const [ledger, settings] = await Promise.all([getLedger(), getSettings()]);
  const rows = filterLedger(ledger.rows, filters);
  const totals = ledgerTotals(rows);
  const currencies = currenciesIn(totals);
  const rates = currencies.some((c) => c !== "PHP") ? await loadRateTable(currencies, settings.fxOverrides) : null;
  const phpTotal = rates ? convertMoney(totals, rates) : currencies.length === 1 && currencies[0] === "PHP" ? (totals.PHP ?? 0) : null;
  const mix = rates ? sourceMix(rates) : "none";

  return (
    <>
      <PageHeader title="Payments" description="All money received, from projects and payments with no project." actions={<RecordPaymentButton />} />

      <div className="flex flex-col gap-5">
        <Suspense fallback={null}>
          <LedgerFilterBar filters={filters} months={ledgerMonths(ledger.rows)} clients={ledger.clients} />
        </Suspense>

        <Card>
          <CardContent className="flex flex-wrap items-baseline gap-x-8 gap-y-3" data-testid="payments-totals">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {rows.length} {rows.length === 1 ? "payment" : "payments"} shown
              </p>
              {currencies.length === 0 ? (
                <p className="text-lg font-semibold text-muted-foreground">Nothing received</p>
              ) : (
                <p className="flex flex-wrap gap-x-5 gap-y-1 text-lg font-semibold tabular-nums">
                  {currencies.map((c) => (
                    <span key={c}>{formatMoney(totals[c] ?? 0, c)}</span>
                  ))}
                </p>
              )}
            </div>
            {phpTotal !== null && !(currencies.length === 1 && currencies[0] === "PHP") ? (
              <div data-testid="payments-php-total">
                <p className="text-xs font-medium text-muted-foreground">
                  Total in PHP{mix === "manual" ? " (your rates)" : mix === "mixed" ? " (your rates and live rates)" : " (live rates)"}
                </p>
                <p className="text-lg font-semibold tabular-nums">{formatMoney(phpTotal, "PHP")}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Wallet />
              </EmptyMedia>
              <EmptyTitle>{ledger.rows.length === 0 ? "No payments yet" : "No payments match"}</EmptyTitle>
              <EmptyDescription>
                {ledger.rows.length === 0 ? "Use Record payment when money arrives." : "Try a different month, currency, client or source."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="md:overflow-x-auto md:rounded-xl md:border md:bg-card md:shadow-xs">
            <table className="hidden w-full min-w-[56rem] text-sm md:table">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">From</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Method</th>
                  <th className="px-4 py-2.5">Note</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody data-testid="payments-rows">
                {rows.map((r) => (
                  <tr key={`${r.source}-${r.id}`} className="border-b border-border/70 last:border-b-0 hover:bg-muted/40">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatIsoDate(r.paidOn)}</td>
                    <td className="px-4 py-3 font-medium">
                      {r.clientId ? (
                        <Link href={`/admin/clients/${r.clientId}`} className="underline-offset-4 hover:underline">
                          {r.who}
                        </Link>
                      ) : (
                        r.who
                      )}
                    </td>
                    <td className="max-w-56 px-4 py-3">
                      <SourceBadge row={r} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{METHOD_LABELS[r.method]}</Badge>
                    </td>
                    <td className="max-w-64 px-4 py-3">
                      <span className="block break-words">{r.note}</span>
                      <Receipt row={r} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums">{formatMoney(r.amount, r.currency)}</td>
                    <td className="px-4 py-3">
                      <Actions row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="stagger grid gap-3 md:hidden">
              {rows.map((r) => (
                <li key={`${r.source}-${r.id}`} className="flex flex-col gap-2.5 rounded-xl border bg-card p-4 shadow-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-lg font-semibold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
                    <span className="text-sm text-muted-foreground">{formatIsoDate(r.paidOn)}</span>
                  </div>
                  <p className="text-sm font-medium break-words">{r.who}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <SourceBadge row={r} />
                    <Badge variant="outline">{METHOD_LABELS[r.method]}</Badge>
                  </div>
                  {r.note ? <p className="text-sm break-words text-muted-foreground">{r.note}</p> : null}
                  <Receipt row={r} />
                  <Actions row={r} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
