import { formatInTimeZone } from "date-fns-tz";
import { addDaysIso, addMonthsClamped, formatIsoDate, type IsoDate } from "@/lib/dates";

// Pure date range rules for the dashboard (Earnings and Income vs expenses): presets
// relative to today in Asia/Manila, custom ranges, the previous period of the same
// length, and daily, weekly (Monday start) and monthly buckets over any range, with
// partial first and last buckets. Manila has no daylight saving, and every date here is a
// calendar date string, so no time zone arithmetic is involved.

export const RANGE_PRESETS = [
  "this-month",
  "last-month",
  "last-4-weeks",
  "last-12-weeks",
  "last-3-months",
  "last-6-months",
  "last-12-months",
  "this-year",
  "last-year",
  "all-time",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export const DEFAULT_RANGE: RangePreset = "last-12-weeks";

export const RANGE_LABELS: Record<RangePreset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "last-4-weeks": "Last 4 weeks",
  "last-12-weeks": "Last 12 weeks",
  "last-3-months": "Last 3 months",
  "last-6-months": "Last 6 months",
  "last-12-months": "Last 12 months",
  "this-year": "This year",
  "last-year": "Last year",
  "all-time": "All time",
};

/** Most bars a chart will draw. A granularity that would need more is not offered. */
export const MAX_BUCKETS = 92;
/** The longest span a range may cover: 92 months, so monthly buckets always fit under the cap. */
export const MAX_MONTHS_SPAN = 92;

export type Granularity = "daily" | "weekly" | "monthly";
export const GRANULARITIES: Granularity[] = ["daily", "weekly", "monthly"];

/** What the URL asked for, checked for shape only. Semantic fixes (swapped, future) happen in resolveRange. */
export type RangeSpec = { preset: RangePreset } | { preset: "custom"; from: IsoDate; to: IsoDate };

export type DateRange = {
  preset: RangePreset | "custom";
  from: IsoDate;
  to: IsoDate;
  /** Calendar days from `from` to `to`, both included. */
  days: number;
};

const isIsoDate = (s: unknown): s is IsoDate => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const isPreset = (s: unknown): s is RangePreset => typeof s === "string" && (RANGE_PRESETS as readonly string[]).includes(s);

/** Whole days from one date to another (positive when `to` is later). */
export function daysBetweenIso(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The Monday of the week containing a date. */
export function weekStartIso(date: IsoDate): IsoDate {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  return addDaysIso(date, -((dow + 6) % 7));
}

const firstOfMonth = (date: IsoDate): IsoDate => `${date.slice(0, 8)}01`;
const lastOfMonth = (date: IsoDate): IsoDate => addDaysIso(addMonthsClamped(firstOfMonth(date), 1), -1);

/**
 * Read ?range=<preset> or ?from=YYYY-MM-DD&to=YYYY-MM-DD. Anything missing or invalid falls
 * back to the default preset. A custom range needs both dates and wins over a preset.
 */
export function parseRangeSpec(sp: Record<string, string | string[] | undefined>): RangeSpec {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const from = one(sp.from);
  const to = one(sp.to);
  if (isIsoDate(from) && isIsoDate(to)) return { preset: "custom", from, to };
  const preset = one(sp.range);
  return { preset: isPreset(preset) ? preset : DEFAULT_RANGE };
}

/** The earliest date a range may start on: the first of the month 91 months back, so 92 months at most. */
export function earliestAllowed(today: IsoDate): IsoDate {
  return addMonthsClamped(firstOfMonth(today), -(MAX_MONTHS_SPAN - 1));
}

function presetDates(preset: RangePreset, today: IsoDate, earliest: IsoDate | null): { from: IsoDate; to: IsoDate } {
  const monthStart = firstOfMonth(today);
  const year = Number(today.slice(0, 4));
  switch (preset) {
    case "this-month":
      return { from: monthStart, to: today };
    case "last-month":
      return { from: addMonthsClamped(monthStart, -1), to: addDaysIso(monthStart, -1) };
    // N weeks: the current week (up to today) and the N - 1 before it, like the weekly view always was.
    case "last-4-weeks":
      return { from: addDaysIso(weekStartIso(today), -7 * 3), to: today };
    case "last-12-weeks":
      return { from: addDaysIso(weekStartIso(today), -7 * 11), to: today };
    // N months: the current month (up to today) and the N - 1 before it.
    case "last-3-months":
      return { from: addMonthsClamped(monthStart, -2), to: today };
    case "last-6-months":
      return { from: addMonthsClamped(monthStart, -5), to: today };
    case "last-12-months":
      return { from: addMonthsClamped(monthStart, -11), to: today };
    case "this-year":
      return { from: `${year}-01-01`, to: today };
    case "last-year":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case "all-time":
      return { from: earliest && earliest <= today ? earliest : monthStart, to: today };
  }
}

/**
 * Turn a spec into real dates, relative to `today` (Manila). A custom range is repaired rather
 * than refused: swapped dates are put in order, an end after today becomes today, and a start
 * after today falls back to the default. No range starts before earliestAllowed (92 months).
 * `earliest` is the first date with any data, used by "All time".
 */
export function resolveRange(spec: RangeSpec, today: IsoDate, earliest: IsoDate | null = null): DateRange {
  const floor = earliestAllowed(today);
  const finish = (preset: DateRange["preset"], from: IsoDate, to: IsoDate): DateRange => {
    const start = from < floor ? floor : from;
    const end = to < start ? start : to;
    return { preset, from: start, to: end, days: daysBetweenIso(start, end) + 1 };
  };
  if (spec.preset === "custom") {
    let { from, to } = spec;
    if (from > to) [from, to] = [to, from];
    if (from > today) {
      const d = presetDates(DEFAULT_RANGE, today, earliest);
      return finish(DEFAULT_RANGE, d.from, d.to);
    }
    if (to > today) to = today;
    return finish("custom", from, to);
  }
  const d = presetDates(spec.preset, today, earliest);
  return finish(spec.preset, d.from, d.to);
}

/** The period of the same length (in days) that ends the day before this one starts. */
export function previousRange(range: Pick<DateRange, "from" | "days">): { from: IsoDate; to: IsoDate; days: number } {
  const to = addDaysIso(range.from, -1);
  return { from: addDaysIso(to, -(range.days - 1)), to, days: range.days };
}

/** Wording for "vs previous ...". Presets with a natural length use it; the rest say how many days. */
export function previousLabel(range: Pick<DateRange, "preset" | "days">): string {
  switch (range.preset) {
    case "last-4-weeks":
      return "previous 4 weeks";
    case "last-12-weeks":
      return "previous 12 weeks";
    case "last-3-months":
      return "previous 3 months";
    case "last-6-months":
      return "previous 6 months";
    case "last-12-months":
      return "previous 12 months";
    default:
      return `previous ${range.days} ${range.days === 1 ? "day" : "days"}`;
  }
}

/** "1 Sep 2026 to 18 Nov 2026" */
export function rangeText(range: Pick<DateRange, "from" | "to">): string {
  return `${formatIsoDate(range.from)} to ${formatIsoDate(range.to)}`;
}

/** The URL query for a range: the default preset needs none. */
export function rangeQuery(spec: RangeSpec): Record<string, string> {
  if (spec.preset === "custom") return { from: spec.from, to: spec.to };
  return spec.preset === DEFAULT_RANGE ? {} : { range: spec.preset };
}

// ----------------------------------------------------------------- buckets

export type Bucket = {
  /** Daily: the date. Weekly: the Monday. Monthly: "YYYY-MM". */
  key: string;
  /** The first and last day of the bucket INSIDE the range (a partial bucket is trimmed). */
  start: IsoDate;
  end: IsoDate;
  /** True when the range cuts the bucket short at either end. */
  partial: boolean;
  axisLabel: string;
  longLabel: string;
};

const fmt = (date: IsoDate, pattern: string): string => formatInTimeZone(new Date(`${date}T12:00:00Z`), "UTC", pattern);

/** How many buckets a granularity needs over a range. */
export function bucketCount(range: Pick<DateRange, "from" | "to" | "days">, granularity: Granularity): number {
  if (granularity === "daily") return range.days;
  if (granularity === "weekly") return daysBetweenIso(weekStartIso(range.from), weekStartIso(range.to)) / 7 + 1;
  const [fy, fm] = range.from.split("-").map(Number);
  const [ty, tm] = range.to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

export type GranularityChoice = { ok: boolean; count: number; reason: string | null };

/** Which granularities fit under the bar cap, with the reason for those that do not. */
export function allowedGranularities(range: Pick<DateRange, "from" | "to" | "days">): Record<Granularity, GranularityChoice> {
  const out = {} as Record<Granularity, GranularityChoice>;
  for (const g of GRANULARITIES) {
    const count = bucketCount(range, g);
    const ok = count <= MAX_BUCKETS;
    out[g] = {
      ok,
      count,
      reason: ok ? null : `${g === "daily" ? "Daily" : g === "weekly" ? "Weekly" : "Monthly"} would need ${count} bars for this range. The most a chart shows is ${MAX_BUCKETS}, so choose a coarser view.`,
    };
  }
  return out;
}

/** Up to 31 days: daily. Up to 26 weeks: weekly. Longer: monthly. Falls back to the finest one that fits. */
export function defaultGranularity(range: Pick<DateRange, "from" | "to" | "days">): Granularity {
  const wanted: Granularity = range.days <= 31 ? "daily" : range.days <= 26 * 7 ? "weekly" : "monthly";
  const choices = allowedGranularities(range);
  if (choices[wanted].ok) return wanted;
  return (["weekly", "monthly", "daily"] as Granularity[]).find((g) => choices[g].ok) ?? "monthly";
}

/**
 * The buckets that cover a range, oldest first, trimmed to the range (a range that starts
 * mid-week has a partial first week). `today` only decides the wording "so far" for the last bucket.
 */
export function buildBuckets(range: Pick<DateRange, "from" | "to">, granularity: Granularity, today: IsoDate = range.to): Bucket[] {
  const out: Bucket[] = [];
  if (granularity === "daily") {
    for (let d = range.from; d <= range.to; d = addDaysIso(d, 1)) {
      out.push({ key: d, start: d, end: d, partial: false, axisLabel: fmt(d, "d MMM"), longLabel: fmt(d, "EEE d MMM yyyy") });
    }
    return out;
  }
  if (granularity === "weekly") {
    for (let monday = weekStartIso(range.from); monday <= range.to; monday = addDaysIso(monday, 7)) {
      const sunday = addDaysIso(monday, 6);
      const start = monday < range.from ? range.from : monday;
      const end = sunday > range.to ? range.to : sunday;
      const partial = start !== monday || end !== sunday;
      const span =
        start.slice(0, 4) === end.slice(0, 4) ? `${fmt(start, "d MMM")} to ${fmt(end, "d MMM yyyy")}` : `${fmt(start, "d MMM yyyy")} to ${fmt(end, "d MMM yyyy")}`;
      const note = !partial ? "" : end === today && end !== sunday ? " (week so far)" : " (partial week)";
      out.push({ key: monday, start, end, partial, axisLabel: fmt(start, "d MMM"), longLabel: `${span}${note}` });
    }
    return out;
  }
  let first = true;
  for (let month = firstOfMonth(range.from); month <= range.to; month = addMonthsClamped(month, 1)) {
    const last = lastOfMonth(month);
    const start = month < range.from ? range.from : month;
    const end = last > range.to ? range.to : last;
    const partial = start !== month || end !== last;
    const key = month.slice(0, 7);
    const short = fmt(month, "MMM");
    const axisLabel = key.endsWith("-01") || first ? `${short} '${key.slice(2, 4)}` : short;
    first = false;
    const note = !partial
      ? ""
      : end === today && end !== last && start === month
        ? " (month so far)"
        : ` (${start === end ? fmt(start, "d MMM") : `${fmt(start, "d")} to ${fmt(end, "d MMM")}`})`;
    out.push({ key, start, end, partial, axisLabel, longLabel: `${fmt(month, "MMMM yyyy")}${note}` });
  }
  return out;
}

/** Every date of a range, oldest first. */
export function eachDay(range: Pick<DateRange, "from" | "to">): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = range.from; d <= range.to; d = addDaysIso(d, 1)) out.push(d);
  return out;
}
