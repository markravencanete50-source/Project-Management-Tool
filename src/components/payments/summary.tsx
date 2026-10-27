import { Card, CardContent } from "@/components/ui/card";
import type { ProjectFinance } from "@/lib/finance";
import { formatMoney, type Currency } from "@/lib/money";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-lg font-semibold tabular-nums break-words ${tone === "danger" ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

/** Contract value, paid, pending (or overpaid) and overdue. Shared by admin and portal. */
export function PaymentSummary({
  contractValue,
  finance,
  currency,
  showOverdue = true,
}: {
  contractValue: number;
  finance: ProjectFinance;
  currency: Currency;
  showOverdue?: boolean;
}) {
  const pending =
    finance.pending < 0
      ? `Overpaid by ${formatMoney(-finance.pending, currency)}`
      : formatMoney(finance.pending, currency);
  return (
    <div className={`grid grid-cols-2 gap-3 ${showOverdue ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      <Stat label="Contract value" value={formatMoney(contractValue, currency)} />
      <Stat label="Paid" value={formatMoney(finance.paid, currency)} />
      <Stat label={finance.pending < 0 ? "Balance" : "Pending"} value={pending} />
      {showOverdue ? (
        <Stat
          label="Overdue"
          value={formatMoney(finance.overdueAmount, currency)}
          tone={finance.overdueAmount > 0 ? "danger" : undefined}
        />
      ) : null}
    </div>
  );
}
