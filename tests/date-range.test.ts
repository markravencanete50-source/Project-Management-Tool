import { describe, expect, it } from "vitest";
import { buildRangeData, sumBuckets } from "@/components/dashboard/range-calc";
import type { MoneyEvent } from "@/lib/available-money";
import {
  allowedGranularities,
  bucketCount,
  buildBuckets,
  daysBetweenIso,
  defaultGranularity,
  earliestAllowed,
  eachDay,
  MAX_BUCKETS,
  parseRangeSpec,
  previousLabel,
  previousRange,
  rangeQuery,
  resolveRange,
  weekStartIso,
} from "@/lib/date-range";
import { buildTable } from "@/lib/fx/convert";

// Tuesday 27 Oct 2026 in Manila.
const TODAY = "2026-10-27";
const range = (preset: Parameters<typeof resolveRange>[0], earliest: string | null = null) => resolveRange(preset, TODAY, earliest);

describe("range parsing", () => {
  it("reads a preset and falls back to the default for anything else", () => {
    expect(parseRangeSpec({ range: "last-6-months" })).toEqual({ preset: "last-6-months" });
    expect(parseRangeSpec({})).toEqual({ preset: "last-12-weeks" });
    expect(parseRangeSpec({ range: "last-1-light-year" })).toEqual({ preset: "last-12-weeks" });
    expect(parseRangeSpec({ range: "custom" })).toEqual({ preset: "last-12-weeks" });
    expect(parseRangeSpec({ range: ["this-year", "all-time"] })).toEqual({ preset: "this-year" });
  });
  it("reads a custom range only when both dates are real", () => {
    expect(parseRangeSpec({ from: "2026-09-01", to: "2026-09-30" })).toEqual({ preset: "custom", from: "2026-09-01", to: "2026-09-30" });
    expect(parseRangeSpec({ from: "2026-09-01" })).toEqual({ preset: "last-12-weeks" });
    expect(parseRangeSpec({ from: "2026-02-30", to: "2026-03-01" })).toEqual({ preset: "last-12-weeks" });
    expect(parseRangeSpec({ from: "yesterday", to: "today" })).toEqual({ preset: "last-12-weeks" });
    expect(parseRangeSpec({ range: "this-year", from: "2026-09-01", to: "2026-09-30" }).preset).toBe("custom");
  });
  it("writes the URL query back, leaving the default preset out", () => {
    expect(rangeQuery({ preset: "last-12-weeks" })).toEqual({});
    expect(rangeQuery({ preset: "this-year" })).toEqual({ range: "this-year" });
    expect(rangeQuery({ preset: "custom", from: "2026-01-01", to: "2026-02-01" })).toEqual({ from: "2026-01-01", to: "2026-02-01" });
  });
});

describe("presets, relative to today in Manila", () => {
  const dates = (p: Parameters<typeof resolveRange>[0], earliest: string | null = null) => {
    const r = range(p, earliest);
    return [r.from, r.to];
  };
  it("resolves every preset", () => {
    expect(dates({ preset: "this-month" })).toEqual(["2026-10-01", "2026-10-27"]);
    expect(dates({ preset: "last-month" })).toEqual(["2026-09-01", "2026-09-30"]);
    expect(dates({ preset: "last-4-weeks" })).toEqual(["2026-10-05", "2026-10-27"]); // Monday of this week minus 3 weeks
    expect(dates({ preset: "last-12-weeks" })).toEqual(["2026-08-10", "2026-10-27"]);
    expect(dates({ preset: "last-3-months" })).toEqual(["2026-08-01", "2026-10-27"]);
    expect(dates({ preset: "last-6-months" })).toEqual(["2026-05-01", "2026-10-27"]);
    expect(dates({ preset: "last-12-months" })).toEqual(["2025-11-01", "2026-10-27"]);
    expect(dates({ preset: "this-year" })).toEqual(["2026-01-01", "2026-10-27"]);
    expect(dates({ preset: "last-year" })).toEqual(["2025-01-01", "2025-12-31"]);
  });
  it("all time starts at the first date on record, or this month when there is none", () => {
    expect(dates({ preset: "all-time" }, "2026-03-15")).toEqual(["2026-03-15", "2026-10-27"]);
    expect(dates({ preset: "all-time" })).toEqual(["2026-10-01", "2026-10-27"]);
    expect(dates({ preset: "all-time" }, "1999-01-01")[0]).toBe(earliestAllowed(TODAY));
  });
  it("counts days inclusively and the default 12 weeks match the old weekly view", () => {
    expect(range({ preset: "last-12-weeks" }).days).toBe(79);
    expect(buildBuckets(range({ preset: "last-12-weeks" }), "weekly", TODAY)).toHaveLength(12);
    expect(range({ preset: "this-month" }).days).toBe(27);
    expect(range({ preset: "last-month" }).days).toBe(30);
  });
  it("first of the year and month arithmetic survive a January today", () => {
    expect(resolveRange({ preset: "last-3-months" }, "2027-01-10").from).toBe("2026-11-01");
    expect(resolveRange({ preset: "last-month" }, "2027-01-10")).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
    expect(resolveRange({ preset: "last-year" }, "2027-01-10")).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("custom ranges are repaired, not refused", () => {
  it("keeps a valid range", () => {
    expect(range({ preset: "custom", from: "2026-09-10", to: "2026-10-05" })).toMatchObject({ preset: "custom", from: "2026-09-10", to: "2026-10-05", days: 26 });
  });
  it("puts swapped dates in order", () => {
    expect(range({ preset: "custom", from: "2026-10-05", to: "2026-09-10" })).toMatchObject({ from: "2026-09-10", to: "2026-10-05" });
  });
  it("an end after today becomes today, and a start after today falls back to the default", () => {
    expect(range({ preset: "custom", from: "2026-10-01", to: "2027-05-01" })).toMatchObject({ from: "2026-10-01", to: TODAY });
    const fallback = range({ preset: "custom", from: "2026-11-05", to: "2026-12-01" });
    expect(fallback).toMatchObject({ preset: "last-12-weeks", from: "2026-08-10", to: TODAY });
  });
  it("never starts before 92 months back", () => {
    const r = range({ preset: "custom", from: "1990-01-01", to: TODAY });
    expect(r.from).toBe("2019-03-01");
    expect(bucketCount(r, "monthly")).toBeLessThanOrEqual(MAX_BUCKETS);
  });
  it("a single day is a valid range", () => {
    expect(range({ preset: "custom", from: "2026-10-10", to: "2026-10-10" }).days).toBe(1);
  });
});

describe("previous period of the same length", () => {
  it("ends the day before the range starts", () => {
    expect(previousRange(range({ preset: "this-month" }))).toEqual({ from: "2026-09-04", to: "2026-09-30", days: 27 });
    expect(previousRange(range({ preset: "last-12-weeks" }))).toEqual({ from: "2026-05-23", to: "2026-08-09", days: 79 });
    expect(previousRange({ from: "2026-03-01", days: 1 })).toEqual({ from: "2026-02-28", to: "2026-02-28", days: 1 });
  });
  it("is the same length in days as the range", () => {
    for (const preset of ["last-month", "last-4-weeks", "this-year", "last-year"] as const) {
      const r = range({ preset });
      const p = previousRange(r);
      expect(daysBetweenIso(p.from, p.to) + 1).toBe(r.days);
      expect(daysBetweenIso(p.to, r.from)).toBe(1);
    }
  });
  it("labels", () => {
    expect(previousLabel({ preset: "last-12-weeks", days: 79 })).toBe("previous 12 weeks");
    expect(previousLabel({ preset: "last-6-months", days: 180 })).toBe("previous 6 months");
    expect(previousLabel({ preset: "custom", days: 26 })).toBe("previous 26 days");
    expect(previousLabel({ preset: "custom", days: 1 })).toBe("previous 1 day");
  });
});

describe("buckets", () => {
  it("Manila weeks start on Monday", () => {
    expect(weekStartIso("2026-10-25")).toBe("2026-10-19"); // Sunday belongs to the week before
    expect(weekStartIso("2026-10-26")).toBe("2026-10-26");
    expect(weekStartIso("2026-10-27")).toBe("2026-10-26");
    expect(weekStartIso("2028-02-29")).toBe("2028-02-28"); // leap day
  });
  it("daily: one bucket per day, zero fill by construction", () => {
    const buckets = buildBuckets({ from: "2026-10-01", to: "2026-10-05" }, "daily");
    expect(buckets.map((b) => b.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
    expect(buckets[0]).toMatchObject({ axisLabel: "1 Oct", longLabel: "Thu 1 Oct 2026", partial: false });
  });
  it("weekly: a range that starts mid-week and ends mid-week has partial first and last weeks", () => {
    const buckets = buildBuckets({ from: "2026-10-14", to: "2026-10-27" }, "weekly", TODAY);
    expect(buckets.map((b) => [b.key, b.start, b.end, b.partial])).toEqual([
      ["2026-10-12", "2026-10-14", "2026-10-18", true],
      ["2026-10-19", "2026-10-19", "2026-10-25", false],
      ["2026-10-26", "2026-10-26", "2026-10-27", true],
    ]);
    expect(buckets[0].longLabel).toBe("14 Oct to 18 Oct 2026 (partial week)");
    expect(buckets[1].longLabel).toBe("19 Oct to 25 Oct 2026");
    expect(buckets[2].longLabel).toBe("26 Oct to 27 Oct 2026 (week so far)");
  });
  it("weekly: a range that ends in the past labels its last week as partial, not as so far", () => {
    const buckets = buildBuckets({ from: "2026-09-01", to: "2026-09-30" }, "weekly", TODAY);
    expect(buckets.at(-1)!.longLabel).toBe("28 Sep to 30 Sep 2026 (partial week)");
    expect(buckets[0]).toMatchObject({ key: "2026-08-31", start: "2026-09-01", partial: true });
  });
  it("weekly across a year end names both years", () => {
    const [first] = buildBuckets({ from: "2026-12-29", to: "2027-01-10" }, "weekly", "2027-01-10");
    expect(first.longLabel).toBe("29 Dec 2026 to 3 Jan 2027 (partial week)");
  });
  it("monthly: calendar months, partial at the ends", () => {
    const buckets = buildBuckets({ from: "2026-09-15", to: "2026-10-27" }, "monthly", TODAY);
    expect(buckets.map((b) => [b.key, b.start, b.end, b.partial])).toEqual([
      ["2026-09", "2026-09-15", "2026-09-30", true],
      ["2026-10", "2026-10-01", "2026-10-27", true],
    ]);
    expect(buckets[0].longLabel).toBe("September 2026 (15 to 30 Sep)");
    expect(buckets[1].longLabel).toBe("October 2026 (month so far)");
  });
  it("monthly: a whole month is not partial, February in a leap year has 29 days", () => {
    const [feb] = buildBuckets({ from: "2028-02-01", to: "2028-02-29" }, "monthly", "2028-03-05");
    expect(feb).toMatchObject({ key: "2028-02", end: "2028-02-29", partial: false, longLabel: "February 2028" });
  });
  it("monthly axis labels carry the year on the first bucket and on January", () => {
    const labels = buildBuckets({ from: "2026-11-01", to: "2027-02-10" }, "monthly", "2027-02-10").map((b) => b.axisLabel);
    expect(labels).toEqual(["Nov '26", "Dec", "Jan '27", "Feb"]);
  });
  it("the buckets cover every day of the range exactly once", () => {
    for (const grain of ["daily", "weekly", "monthly"] as const) {
      const r = range({ preset: "custom", from: "2026-01-17", to: "2026-10-09" });
      const buckets = buildBuckets(r, grain, TODAY);
      const covered = buckets.reduce((s, b) => s + daysBetweenIso(b.start, b.end) + 1, 0);
      expect(covered).toBe(r.days);
      expect(buckets).toHaveLength(bucketCount(r, grain));
    }
  });
  it("eachDay lists the dates", () => {
    expect(eachDay({ from: "2028-02-28", to: "2028-03-01" })).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });
});

describe("bar cap and default granularity", () => {
  it("up to 31 days is daily, up to 26 weeks weekly, longer monthly", () => {
    const d = (days: number) => ({ from: "2026-01-01", to: "2026-01-01", days });
    expect(defaultGranularity(d(1))).toBe("daily");
    expect(defaultGranularity(d(31))).toBe("daily");
    expect(defaultGranularity(d(32))).toBe("weekly");
    expect(defaultGranularity(d(182))).toBe("weekly");
    expect(defaultGranularity({ from: "2026-01-01", to: "2026-07-02", days: 183 })).toBe("monthly");
    expect(defaultGranularity(range({ preset: "last-12-weeks" }))).toBe("weekly");
    expect(defaultGranularity(range({ preset: "this-month" }))).toBe("daily");
    expect(defaultGranularity(range({ preset: "last-year" }))).toBe("monthly");
  });
  it("disables a granularity that would need more than 92 bars, and says why", () => {
    const year = allowedGranularities(range({ preset: "this-year" }));
    expect(year.daily).toMatchObject({ ok: false, count: 300 });
    expect(year.daily.reason).toContain("300 bars");
    expect(year.daily.reason).toContain("92");
    expect(year.weekly).toMatchObject({ ok: true, count: 44 });
    expect(year.monthly).toMatchObject({ ok: true, count: 10 });
    const month = allowedGranularities(range({ preset: "this-month" }));
    expect(month.daily.ok && month.weekly.ok && month.monthly.ok).toBe(true);
    const long = allowedGranularities(range({ preset: "custom", from: "2019-03-01", to: TODAY }));
    expect(long.daily.ok).toBe(false);
    expect(long.weekly.ok).toBe(false);
    expect(long.monthly).toMatchObject({ ok: true, count: 92 });
  });
  it("exactly 92 bars is allowed, 93 is not", () => {
    expect(allowedGranularities({ from: "2026-01-01", to: "2026-04-02", days: 92 }).daily.ok).toBe(true);
    expect(allowedGranularities({ from: "2026-01-01", to: "2026-04-03", days: 93 }).daily.ok).toBe(false);
  });
  it("the default is always a granularity that fits", () => {
    for (const preset of ["this-month", "last-month", "last-4-weeks", "last-12-weeks", "last-3-months", "last-6-months", "last-12-months", "this-year", "last-year"] as const) {
      const r = range({ preset });
      expect(allowedGranularities(r)[defaultGranularity(r)].ok).toBe(true);
    }
    const huge = range({ preset: "all-time" }, "1990-01-01");
    expect(allowedGranularities(huge)[defaultGranularity(huge)].ok).toBe(true);
  });
});

describe("range aggregation", () => {
  const rates = buildTable([
    { currency: "USD", rate: 56.37, source: "stub", updatedAt: "2026-10-27T00:00:00Z" },
    { currency: "GBP", rate: 71.93, source: "stub", updatedAt: "2026-10-27T00:00:00Z" },
  ]);
  const received: MoneyEvent[] = [
    { date: "2026-10-27", currency: "USD", amount: 12345 },
    { date: "2026-10-26", currency: "USD", amount: 123 },
    { date: "2026-10-18", currency: "USD", amount: 4567 },
    { date: "2026-10-14", currency: "GBP", amount: 999 }, // first, partial week
    { date: "2026-10-13", currency: "GBP", amount: 5000 }, // before the range
    { date: "2026-10-20", currency: "PHP", amount: 77777 },
    { date: "2026-09-20", currency: "USD", amount: 1000 }, // in the previous period
    { date: "2026-09-21", currency: "PHP", amount: 2000 },
  ];
  const spent: MoneyEvent[] = [
    { date: "2026-10-27", currency: "USD", amount: 1111 },
    { date: "2026-10-15", currency: "PHP", amount: 5555 },
    { date: "2026-09-25", currency: "PHP", amount: 300 },
  ];
  const r = resolveRange({ preset: "custom", from: "2026-10-14", to: "2026-10-27" }, TODAY);
  const data = buildRangeData({ received, spent, range: r, today: TODAY, rates });

  it("totals equal the sum of the buckets at every granularity, in the original currencies", () => {
    for (const grain of ["daily", "weekly", "monthly"] as const) {
      for (const series of data.earnings[grain]) {
        const sum = series.points.reduce((s, p) => s + p.amount, 0);
        expect(sum).toBe(series.summary.total);
        expect(series.points.at(-1)!.cumulative).toBe(series.summary.total);
        expect(series.summary.total).toBe(data.earned[series.currency]);
      }
    }
    expect(data.earned).toEqual({ USD: 12345 + 123 + 4567, GBP: 999, PHP: 77777 });
  });
  it("totals equal the sum of the buckets after PHP conversion, and the total does not depend on the bar size", () => {
    const totals = new Set<number>();
    for (const grain of ["daily", "weekly", "monthly"] as const) {
      const [php] = data.converted!.earnings[grain];
      expect(php.currency).toBe("PHP");
      expect(php.points.reduce((s, p) => s + p.amount, 0)).toBe(php.summary.total);
      totals.add(php.summary.total);
      const [flow] = data.converted!.flow[grain];
      expect(flow.points.reduce((s, p) => s + p.income, 0)).toBe(flow.totals.income);
      expect(flow.points.reduce((s, p) => s + p.expense, 0)).toBe(flow.totals.expense);
      expect(flow.totals.net).toBe(flow.totals.income - flow.totals.expense);
    }
    expect([...totals]).toHaveLength(1);
    expect([...totals][0]).toBe(data.converted!.earned);
  });
  it("leaves out money outside the range, and counts the partial first week from the range start", () => {
    const usdWeekly = data.earnings.weekly.find((s) => s.currency === "USD")!;
    expect(usdWeekly.points.map((p) => [p.key, p.amount, p.partial])).toEqual([
      ["2026-10-12", 4567, true], // Sunday 18 Oct belongs to the partial first week
      ["2026-10-19", 0, false],
      ["2026-10-26", 12345 + 123, true],
    ]);
    const gbp = data.earnings.weekly.find((s) => s.currency === "GBP")!;
    expect(gbp.points[0].amount).toBe(999); // the 13 Oct payment is before the range
    expect(gbp.summary.total).toBe(999);
  });
  it("compares against the previous period of the same length, and says New when it was zero", () => {
    expect(data.previous).toEqual({ from: "2026-09-30", to: "2026-10-13", days: 14 });
    // The previous 14 days (30 Sep to 13 Oct) hold only the 13 Oct GBP payment.
    const gbp = data.earnings.weekly.find((s) => s.currency === "GBP")!;
    expect(gbp.summary.previous).toBe(5000);
    expect(gbp.summary.trend).toBe("down");
    const usd = data.earnings.weekly.find((s) => s.currency === "USD")!;
    expect(usd.summary.previous).toBe(0);
    expect(usd.summary.trend).toBe("new");
    expect(usd.summary.pct).toBeNull();
    expect(data.previousLabel).toBe("previous 14 days");
  });
  it("average per bucket and best bucket", () => {
    const usd = data.earnings.weekly.find((s) => s.currency === "USD")!;
    expect(usd.summary.average).toBeCloseTo((12345 + 123 + 4567) / 3);
    expect(usd.summary.best).toEqual({ label: "26 Oct to 27 Oct 2026 (week so far)", amount: 12468 });
  });
  it("income vs expenses: spent, net, previous and best bucket by net", () => {
    const usd = data.flow.daily.find((s) => s.currency === "USD")!;
    expect(usd.totals).toEqual({ income: 17035, expense: 1111, net: 17035 - 1111 });
    expect(usd.points.find((p) => p.key === "2026-10-27")).toMatchObject({ income: 12345, expense: 1111, net: 11234 });
    const php = data.flow.weekly.find((s) => s.currency === "PHP")!;
    expect(php.totals).toEqual({ income: 77777, expense: 5555, net: 72222 });
    // 21 and 25 Sep are before the previous period (30 Sep to 13 Oct), so it holds no PHP at all.
    expect(php.previous).toEqual({ income: 0, expense: 0, net: 0 });
    expect(data.flow.daily.find((s) => s.currency === "GBP")!.previous).toEqual({ income: 5000, expense: 0, net: 5000 });
  });
  it("a negative net bucket is kept as a negative number", () => {
    const only = buildRangeData({ received: [], spent: [{ date: "2026-10-20", currency: "PHP", amount: 900 }], range: r, today: TODAY });
    const [php] = only.flow.weekly;
    expect(php.totals.net).toBe(-900);
    expect(php.points.find((p) => p.key === "2026-10-19")!.net).toBe(-900);
    expect(php.best).toEqual({ label: "19 Oct to 25 Oct 2026", amount: -900 });
    expect(only.earnings.weekly).toEqual([]);
  });
  it("expenses never change what was earned", () => {
    const without = buildRangeData({ received, spent: [], range: r, today: TODAY, rates });
    expect(without.earned).toEqual(data.earned);
    expect(without.earnings).toEqual(data.earnings);
    expect(without.converted!.earned).toBe(data.converted!.earned);
  });
  it("a granularity over the cap is left empty", () => {
    const big = buildRangeData({ received, spent, range: resolveRange({ preset: "this-year" }, TODAY), today: TODAY });
    expect(big.choices.daily.ok).toBe(false);
    expect(big.earnings.daily).toEqual([]);
    expect(big.flow.daily).toEqual([]);
    expect(big.earnings.weekly.length).toBeGreaterThan(0);
  });
  it("no activity in the range: no series, nothing divides by zero", () => {
    const none = buildRangeData({ received: [], spent: [], range: r, today: TODAY, rates });
    expect(none.earnings.weekly).toEqual([]);
    expect(none.flow.monthly).toEqual([]);
    expect(none.earned).toEqual({});
    expect(none.converted!.earned).toBe(0);
  });
  it("sumBuckets adds the days of each bucket", () => {
    const buckets = [
      { start: "2026-10-01", end: "2026-10-02" },
      { start: "2026-10-03", end: "2026-10-03" },
    ];
    expect(sumBuckets(buckets, "2026-10-01", [1, 2, 4])).toEqual([3, 4]);
  });
});
