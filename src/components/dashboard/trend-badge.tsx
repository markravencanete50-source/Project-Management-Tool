import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import type { Trend } from "@/components/dashboard/calc";
import { cn } from "cn";

function formatPct(pct: number): string {
  const abs = Math.abs(pct) * 100;
  return `${abs >= 10 ? Math.round(abs) : abs.toFixed(1)}%`;
}

const STYLE: Record<Trend, string> = {
  up: "bg-success/12 text-success dark:bg-success/16",
  down: "bg-destructive/10 text-destructive dark:bg-destructive/18",
  flat: "bg-muted text-muted-foreground",
  new: "bg-info/12 text-info dark:bg-info/16",
};

/**
 * Change against the previous period: an arrow, a percentage and a plain-text
 * equivalent for screen readers. Colour is never the only signal (the arrow and
 * the sign repeat it).
 */
export function TrendBadge({
  trend,
  pct,
  versus,
  className,
}: {
  trend: Trend;
  pct: number | null;
  /** What it is compared with, e.g. "last month". */
  versus: string;
  className?: string;
}) {
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : trend === "new" ? Sparkles : Minus;
  const text =
    trend === "new" ? "New" : trend === "flat" ? "No change" : `${trend === "up" ? "+" : "-"}${formatPct(pct ?? 0)}`;
  const spoken =
    trend === "new"
      ? `New, nothing ${versus}`
      : trend === "flat"
        ? `No change versus ${versus}`
        : `${trend === "up" ? "Up" : "Down"} ${formatPct(pct ?? 0)} versus ${versus}`;
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center gap-0.5 rounded-full px-1.5 text-xs font-medium whitespace-nowrap tabular-nums",
        STYLE[trend],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span aria-hidden>{text}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}
