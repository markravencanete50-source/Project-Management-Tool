import { CircleCheck, Clock, TriangleAlert, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedBar } from "@/components/motion/animated-bar";
import type { BillLine, ProjectFinance } from "@/lib/finance";
import { formatMoney, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "danger";

const TONE_TILE: Record<Tone, string> = {
  neutral: "",
  success: "",
  danger: "border-destructive/25 bg-destructive/5",
};
const TONE_VALUE: Record<Tone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  danger: "text-destructive",
};
const TONE_ICON: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/12 text-success",
  danger: "bg-destructive/10 text-destructive",
};

function Stat({ label, value, tone = "neutral", icon }: { label: string; value: string; tone?: Tone; icon: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs", TONE_TILE[tone])}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span aria-hidden="true" className={cn("grid size-6 shrink-0 place-items-center rounded-md [&>svg]:size-3.5", TONE_ICON[tone])}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("text-lg font-semibold tracking-tight tabular-nums break-words sm:text-xl", TONE_VALUE[tone])}>{value}</div>
    </div>
  );
}

/** Contract value, paid, pending (or overpaid) and overdue, with a paid progress bar. Shared by admin and portal. */
export function PaymentSummary({
  contractValue,
  finance,
  currency,
  showOverdue = true,
  totalLabel = "Contract value",
  basisLabel = "contract value",
}: {
  /** The contract value, or for retainers and task projects the total billed so far. */
  contractValue: number;
  finance: ProjectFinance<BillLine>;
  currency: Currency;
  showOverdue?: boolean;
  totalLabel?: string;
  basisLabel?: string;
}) {
  const pending =
    finance.pending < 0
      ? `Overpaid by ${formatMoney(-finance.pending, currency)}`
      : formatMoney(finance.pending, currency);
  const paidPct = contractValue > 0 ? Math.max(0, Math.min(100, Math.round((finance.paid / contractValue) * 100))) : 0;
  const hasOverdue = finance.overdueAmount > 0;

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className={cn("stagger grid grid-cols-2 gap-3 [--stagger:40ms]", showOverdue ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <Stat label={totalLabel} value={formatMoney(contractValue, currency)} icon={<Wallet />} />
        <Stat label="Paid" value={formatMoney(finance.paid, currency)} tone="success" icon={<CircleCheck />} />
        <Stat label={finance.pending < 0 ? "Balance" : "Pending"} value={pending} icon={<Clock />} />
        {showOverdue ? (
          <Stat
            label="Overdue"
            value={formatMoney(finance.overdueAmount, currency)}
            tone={hasOverdue ? "danger" : "neutral"}
            icon={<TriangleAlert />}
          />
        ) : null}
      </div>
      {contractValue > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-xl border bg-card px-4 py-3 shadow-xs">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium text-muted-foreground">Paid so far</span>
            <span className="font-medium tabular-nums">{paidPct}% of {basisLabel}</span>
          </div>
          <AnimatedBar value={paidPct} label={`Paid of ${basisLabel}`} barClassName="bg-success" />
        </div>
      ) : null}
    </div>
  );
}
