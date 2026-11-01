"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/dashboard/segmented-control";
import { DASH_VIEW_COOKIE, type DashView } from "@/lib/dash-view";
import { type RateSource } from "@/lib/fx/convert";

export type { DashView };

/** The sentence under the dashboard header, by where the rates came from. */
export function fxLine(mix: "none" | "manual" | "mixed" | "live", provider: "wise" | "market", updatedAgo: string | null, stale: boolean): string {
  const live = provider === "wise" ? "Wise mid-market" : "market";
  const when = `${updatedAgo ? `, updated ${updatedAgo}` : ""}${stale ? " (last known rates)" : ""}`;
  if (mix === "manual") return "Converted at the rates you set in Settings.";
  if (mix === "mixed") return `Converted at your rates and ${live} rates${when}.`;
  return `Converted at ${live} rates${when}.`;
}

/** The honesty note about past payments, adapted to the rate source. */
export function fxNote(mix: "none" | "manual" | "mixed" | "live"): string {
  if (mix === "manual") return " The rate you set applies to all past payments, not the rate on the day they arrived.";
  if (mix === "mixed") return " Past payments use today's live rate, or the rate you set, not the rate on the day they arrived.";
  return " Past payments use today's rate, not the rate on the day they arrived.";
}

/**
 * "PHP total | Original currencies". The choice is the ?view= parameter and is
 * remembered in a cookie, which the server reads on the next visit, so the page
 * renders in the right mode on first paint with no flash.
 */
export function CurrencyViewToggle({ value }: { value: DashView }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic<DashView, DashView>(value, (_, next) => next);

  function change(next: DashView) {
    if (next === shown) return;
    document.cookie = `${DASH_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      setShown(next);
      // Keep the date range (?range= or ?from= and ?to=) when the view changes.
      const qs = new URLSearchParams(params.toString());
      qs.set("view", next);
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    });
  }

  return (
    <SegmentedControl<DashView>
      label="Show money as"
      value={shown}
      onChange={change}
      options={[
        { value: "php", label: "PHP total" },
        { value: "original", label: "Original currencies" },
      ]}
    />
  );
}

export type FxRateRow = { currency: string; rate: string; source: RateSource; sourceLabel: string; updated: string };

/**
 * One line under the header saying how the PHP figures were made, with a
 * popover listing each rate used. States plainly that past payments use
 * today's rate.
 */
export function FxInfo({
  provider,
  mix,
  updatedAgo,
  stale,
  rows,
}: {
  provider: "wise" | "market";
  mix: "none" | "manual" | "mixed" | "live";
  updatedAgo: string | null;
  stale: boolean;
  rows: FxRateRow[];
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" role="status">
      <span>
        {rows.length === 0
          ? "Every project is in PHP, so nothing needed converting."
          : fxLine(mix, provider, updatedAgo, stale)}
        {rows.length > 0 ? fxNote(mix) : ""}
      </span>
      {rows.length > 0 ? (
        <Popover>
          <PopoverTrigger
            aria-label="Show the exchange rates used"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium text-primary outline-none hover:bg-primary/8 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <Info className="size-3.5" aria-hidden />
            Rates used
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <p className="text-xs font-medium text-muted-foreground">Rates used for the PHP view</p>
            <ul className="grid gap-2">
              {rows.map((r) => (
                <li key={r.currency} className="flex items-baseline justify-between gap-3">
                  <span className="font-medium tabular-nums">
                    1 {r.currency} = {r.rate} PHP
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.source === "manual" ? `(${r.sourceLabel})` : `(${r.sourceLabel}, ${r.updated})`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {mix === "manual"
                ? "Totals are a display conversion at the rates you set in Settings, applied to all past payments. They change when you change a rate and are never stored."
                : "Totals are a display conversion at the current rate, applied to all past payments. They change as rates change and are never stored. A rate you set in Settings always wins over the live one."}
            </p>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

export function FxUnavailableNotice() {
  return (
    <p className="mb-5 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-sm text-foreground" role="status">
      Live rates unavailable, showing original currencies
    </p>
  );
}
