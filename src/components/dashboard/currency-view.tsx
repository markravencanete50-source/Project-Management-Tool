"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/dashboard/segmented-control";
import { DASH_VIEW_COOKIE, type DashView } from "@/lib/dash-view";
import { SOURCE_NAMES, type RateSource } from "@/lib/fx/convert";

export type { DashView };

/**
 * "PHP total | Original currencies". The choice is the ?view= parameter and is
 * remembered in a cookie, which the server reads on the next visit, so the page
 * renders in the right mode on first paint with no flash.
 */
export function CurrencyViewToggle({ value }: { value: DashView }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic<DashView, DashView>(value, (_, next) => next);

  function change(next: DashView) {
    if (next === shown) return;
    document.cookie = `${DASH_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      setShown(next);
      router.replace(`${pathname}?view=${next}`, { scroll: false });
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

export type FxRateRow = { currency: string; rate: string; source: RateSource; updated: string };

/**
 * One line under the header saying how the PHP figures were made, with a
 * popover listing each rate used. States plainly that past payments use
 * today's rate.
 */
export function FxInfo({
  provider,
  updatedAgo,
  stale,
  rows,
}: {
  provider: "wise" | "market";
  updatedAgo: string | null;
  stale: boolean;
  rows: FxRateRow[];
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" role="status">
      <span>
        {rows.length === 0
          ? "Every project is in PHP, so nothing needed converting."
          : `Converted at ${provider === "wise" ? "Wise mid-market" : "market"} rates${updatedAgo ? `, updated ${updatedAgo}` : ""}${stale ? " (last known rates)" : ""}.`}
        {rows.length > 0 ? " Past payments use today's rate, not the rate on the day they arrived." : ""}
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
                    {SOURCE_NAMES[r.source]}, {r.updated}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Totals are a display conversion at the current rate, applied to all past payments. They change as rates change and
              are never stored.
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
