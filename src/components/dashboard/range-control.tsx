"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, LoaderCircle } from "lucide-react";
import type { DateRange as PickedRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeSelect } from "@/components/payments/native-select";
import { DEFAULT_RANGE, RANGE_LABELS, RANGE_PRESETS, type RangePreset } from "@/lib/date-range";
import { formatIsoDate, type IsoDate } from "@/lib/dates";

/** True from the md breakpoint up: the calendar shows two months there and one on a phone. */
function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(min-width: 768px)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const pad = (n: number) => String(n).padStart(2, "0");
/** A calendar pick (local midnight) as a plain date string. */
const isoOf = (d: Date): IsoDate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A plain date string as a local date, so the calendar shows the same day. */
const dateOf = (iso: IsoDate): Date => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/**
 * The date range of the dashboard Earnings and Income vs expenses sections.
 * Presets in a select (a native one, so it is a full-width picker on a phone), and "Custom" in
 * a popover with the calendar plus From and To fields. The choice lives in the URL
 * (?range=last-6-months, or ?from=YYYY-MM-DD&to=YYYY-MM-DD) and the server reads it, so
 * reloads and shared links keep it. Other parameters, such as ?view=, are kept.
 */
export function RangeControl({
  preset,
  from,
  to,
  today,
  earliest,
}: {
  preset: RangePreset | "custom";
  from: IsoDate;
  to: IsoDate;
  today: IsoDate;
  /** The first date a range may start on. */
  earliest: IsoDate;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<string>(from);
  const [draftTo, setDraftTo] = useState<string>(to);

  function go(next: Record<string, string | null>) {
    const qs = new URLSearchParams(params.toString());
    for (const key of ["range", "from", "to"]) qs.delete(key);
    for (const [key, value] of Object.entries(next)) if (value) qs.set(key, value);
    const text = qs.toString();
    startTransition(() => router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false }));
  }

  function openPicker(next: boolean) {
    if (next) {
      setDraftFrom(from);
      setDraftTo(to);
    }
    setOpen(next);
  }

  const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  const problem = !validDate(draftFrom) || !validDate(draftTo)
    ? "Pick a start and an end date."
    : draftTo < draftFrom
      ? "The end date must be on or after the start date."
      : draftTo > today
        ? "The end date cannot be after today."
        : draftFrom < earliest
          ? `The start date cannot be before ${formatIsoDate(earliest)}.`
          : null;

  const selected: PickedRange | undefined = validDate(draftFrom) ? { from: dateOf(draftFrom), to: validDate(draftTo) ? dateOf(draftTo) : undefined } : undefined;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-nowrap" data-testid="range-control">
      <NativeSelect
        aria-label="Date range"
        value={preset}
        onChange={(e) => {
          const value = e.target.value;
          if (value === "custom") openPicker(true);
          else go(value === DEFAULT_RANGE ? {} : { range: value });
        }}
        className="w-full sm:w-44"
        data-testid="range-select"
      >
        {RANGE_PRESETS.map((p) => (
          <option key={p} value={p}>
            {RANGE_LABELS[p]}
          </option>
        ))}
        <option value="custom">Custom range</option>
      </NativeSelect>

      <Popover open={open} onOpenChange={openPicker}>
        <PopoverTrigger
          render={
            <Button variant={preset === "custom" ? "secondary" : "outline"} data-testid="range-custom" aria-label={`Custom range, now ${formatIsoDate(from)} to ${formatIsoDate(to)}`}>
              <CalendarRange data-icon="inline-start" aria-hidden />
              <span className="tabular-nums">
                {formatIsoDate(from)} to {formatIsoDate(to)}
              </span>
            </Button>
          }
        />
        <PopoverContent align="end" className="w-auto max-w-[calc(100vw-1.5rem)] gap-3 p-3" data-testid="range-popover">
          <Calendar
            mode="range"
            selected={selected}
            numberOfMonths={wide ? 2 : 1}
            defaultMonth={addMonths(dateOf(validDate(draftTo) ? draftTo : to), wide ? -1 : 0)}
            onSelect={(picked) => {
              if (picked?.from) setDraftFrom(isoOf(picked.from));
              if (picked?.from) setDraftTo(isoOf(picked.to ?? picked.from));
            }}
            disabled={{ after: dateOf(today), before: dateOf(earliest) }}
            captionLayout="dropdown"
            startMonth={dateOf(earliest)}
            endMonth={dateOf(today)}
            weekStartsOn={1}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="range-from" className="text-xs">
                From
              </Label>
              <Input id="range-from" type="date" value={draftFrom} min={earliest} max={today} onChange={(e) => setDraftFrom(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="range-to" className="text-xs">
                To
              </Label>
              <Input id="range-to" type="date" value={draftTo} min={earliest} max={today} onChange={(e) => setDraftTo(e.target.value)} />
            </div>
          </div>
          <p className="min-h-4 text-xs text-warning" role="status">
            {problem ?? ""}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={problem !== null}
              data-testid="range-apply"
              onClick={() => {
                setOpen(false);
                go({ from: draftFrom, to: draftTo });
              }}
            >
              Apply range
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <span className="inline-flex h-4 w-4 items-center" role="status" aria-live="polite">
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
            <span className="sr-only">Updating the charts</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
