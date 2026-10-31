import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTable, convertMinor, convertMoney, covers, rateOf, timeAgo, type RateTable } from "@/lib/fx/convert";
import { fetchQuote, getRateTable, resetFxMemory, FX_STALE_MAX_MS } from "@/lib/fx/provider";
import { buildDashboard, type DashboardInput } from "@/components/dashboard/calc";

const NOW = new Date("2026-10-27T04:00:00Z"); // 12:00 in Manila

type Responder = (url: string, init: RequestInit) => { status?: number; body?: unknown } | "throw";

/** A fetch that answers from a routing function and records every call. */
function fakeFetch(respond: Responder) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const r = respond(url, init ?? {});
    if (r === "throw") throw new Error("network down");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
  return { fetch: impl as unknown as typeof fetch, calls };
}

const wiseBody = (rate: number) => [{ rate, source: "USD", target: "PHP", time: "2026-10-27T03:50:00+0000" }];
const erBody = (rate: number) => ({ result: "success", rates: { PHP: rate }, time_last_update_unix: 1_790_000_000 });
const frankBody = (rate: number) => ({ base: "USD", date: "2026-10-26", rates: { PHP: rate } });

beforeEach(() => resetFxMemory());

describe("convertMinor", () => {
  it("multiplies by the rate and rounds to a centavo", () => {
    expect(convertMinor(10000, 56.2)).toBe(562000);
    expect(convertMinor(12345, 56.78)).toBe(Math.round(12345 * 56.78));
    expect(convertMinor(1, 56.5)).toBe(57);
    expect(convertMinor(0, 56.2)).toBe(0);
  });
  it("is the identity at a rate of exactly 1", () => {
    expect(convertMinor(123456789, 1)).toBe(123456789);
  });
  it("rounds half up even when float noise sits just under the half", () => {
    // 1 * 0.285 style products: 0.1 + 0.2 style error must not flip the half centavo.
    expect(convertMinor(5, 0.3)).toBe(2); // 1.5 -> 2
    expect(convertMinor(145, 0.1)).toBe(15); // 14.5 -> 15 (14.499999999999998 in floats)
  });
});

describe("convertMoney", () => {
  const table = buildTable([
    { currency: "USD", rate: 56.2, source: "stub", updatedAt: NOW.toISOString() },
    { currency: "GBP", rate: 72.5, source: "stub", updatedAt: NOW.toISOString() },
  ]);
  it("converts each currency bucket on its own and sums the rounded results", () => {
    // 100.01 USD -> 5620.562 -> 562056 centavos; 33.33 GBP -> 2416.425 -> 241643 (half up); PHP as is.
    expect(convertMoney({ USD: 10001, GBP: 3333, PHP: 777 }, table)).toBe(562056 + 241643 + 777);
  });
  it("is zero for an empty bucket and skips zero entries", () => {
    expect(convertMoney({}, table)).toBe(0);
    expect(convertMoney({ USD: 0 }, table)).toBe(0);
  });
  it("treats PHP to PHP as exactly 1 even with no quotes", () => {
    expect(rateOf({ quotes: [] }, "PHP")).toBe(1);
    expect(convertMoney({ PHP: 4242 }, { quotes: [] })).toBe(4242);
  });
  it("reports which currencies a table covers", () => {
    expect(covers(table, ["USD", "PHP", "GBP"])).toBe(true);
    expect(covers({ quotes: [] }, ["USD"])).toBe(false);
  });
});

describe("buildTable and timeAgo", () => {
  it("is a wise table only when every quote is from Wise, and uses the oldest time", () => {
    const wise = buildTable([
      { currency: "USD", rate: 56, source: "wise", updatedAt: "2026-10-27T03:00:00.000Z" },
      { currency: "GBP", rate: 72, source: "wise", updatedAt: "2026-10-27T02:00:00.000Z" },
    ]);
    expect(wise.provider).toBe("wise");
    expect(wise.updatedAt).toBe("2026-10-27T02:00:00.000Z");
    const mixed = buildTable([
      { currency: "USD", rate: 56, source: "wise", updatedAt: "2026-10-27T03:00:00.000Z" },
      { currency: "GBP", rate: 72, source: "frankfurter", updatedAt: "2026-10-27T03:00:00.000Z" },
    ]);
    expect(mixed.provider).toBe("market");
  });
  it("words elapsed time", () => {
    const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
    expect(timeAgo(at(20_000), NOW)).toBe("just now");
    expect(timeAgo(at(60_000), NOW)).toBe("1 minute ago");
    expect(timeAgo(at(12 * 60_000), NOW)).toBe("12 minutes ago");
    expect(timeAgo(at(3 * 3_600_000), NOW)).toBe("3 hours ago");
    expect(timeAgo(at(72 * 3_600_000), NOW)).toBe("3 days ago");
  });
});

describe("fallback chain", () => {
  it("uses Wise when a token is set, sending it as a bearer header and never in the URL", async () => {
    const { fetch, calls } = fakeFetch((url) => (url.includes("wise.com") ? { body: wiseBody(56.31) } : { status: 500 }));
    const q = await fetchQuote("USD", { fetch, wiseToken: "SECRET-TOKEN", now: () => NOW });
    expect(q).toMatchObject({ currency: "USD", rate: 56.31, source: "wise", updatedAt: "2026-10-27T03:50:00.000Z" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.wise.com/v1/rates?source=USD&target=PHP");
    expect(calls[0].url).not.toContain("SECRET-TOKEN");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer SECRET-TOKEN");
    expect((calls[0].init as { next?: { revalidate?: number } }).next?.revalidate).toBe(3600);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });
  it("skips Wise entirely without a token and uses open.er-api.com", async () => {
    const { fetch, calls } = fakeFetch((url) => (url.includes("er-api") ? { body: erBody(56.4) } : { status: 500 }));
    const q = await fetchQuote("USD", { fetch, now: () => NOW });
    expect(q).toMatchObject({ rate: 56.4, source: "open.er-api.com" });
    expect(calls.map((c) => c.url)).toEqual(["https://open.er-api.com/v6/latest/USD"]);
  });
  it("falls back from a Wise 401 to the free source", async () => {
    const { fetch, calls } = fakeFetch((url) => (url.includes("wise.com") ? { status: 401, body: { error: "unauthorized" } } : { body: erBody(56.4) }));
    const q = await fetchQuote("USD", { fetch, wiseToken: "bad", now: () => NOW });
    expect(q?.source).toBe("open.er-api.com");
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(["api.wise.com", "open.er-api.com"]);
  });
  it("falls back to Frankfurter when the first two fail or time out", async () => {
    const { fetch } = fakeFetch((url) => (url.includes("frankfurter") ? { body: frankBody(56.1) } : "throw"));
    const q = await fetchQuote("GBP", { fetch, wiseToken: "t", now: () => NOW });
    expect(q).toMatchObject({ source: "frankfurter", rate: 56.1, updatedAt: "2026-10-26T00:00:00.000Z" });
  });
  it("rejects nonsense rates and error payloads", async () => {
    const { fetch } = fakeFetch((url) =>
      url.includes("wise") ? { body: [{ rate: -3 }] } : url.includes("er-api") ? { body: { result: "error" } } : { body: { rates: { PHP: "fifty" } } },
    );
    expect(await fetchQuote("USD", { fetch, wiseToken: "t", now: () => NOW })).toBeNull();
  });
  it("does not quote PHP", async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: {} }));
    expect(await fetchQuote("PHP", { fetch })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("getRateTable", () => {
  const ok = (url: string) => (url.includes("er-api") ? { body: erBody(url.includes("/GBP") ? 72.5 : 56.2) } : { status: 500 });

  it("returns a fresh table for the needed currencies and needs no network for PHP only", async () => {
    const { fetch } = fakeFetch(ok);
    const table = await getRateTable(["USD", "GBP", "PHP", "USD"], { fetch, now: () => NOW });
    expect(table?.quotes.map((q) => q.currency).sort()).toEqual(["GBP", "USD"]);
    expect(table).toMatchObject({ provider: "market", stale: false });
    const none = fakeFetch(ok);
    const phpOnly = await getRateTable(["PHP"], { fetch: none.fetch, now: () => NOW });
    expect(phpOnly?.quotes).toEqual([]);
    expect(none.calls).toHaveLength(0);
  });
  it("returns null, without throwing, when every source fails", async () => {
    const { fetch } = fakeFetch(() => "throw");
    expect(await getRateTable(["USD"], { fetch, now: () => NOW })).toBeNull();
  });
  it("returns null when only some currencies can be quoted and nothing is remembered", async () => {
    const { fetch } = fakeFetch((url) => (url.includes("/USD") ? { body: erBody(56.2) } : { status: 500 }));
    expect(await getRateTable(["USD", "GBP"], { fetch, now: () => NOW })).toBeNull();
  });
  it("reuses the last good rates, flagged stale, when sources fail within a day", async () => {
    const good = fakeFetch(ok);
    const first = await getRateTable(["USD", "GBP"], { fetch: good.fetch, now: () => NOW });
    expect(first?.stale).toBe(false);
    const down = fakeFetch(() => "throw");
    const later = new Date(NOW.getTime() + 2 * 3_600_000);
    const second = await getRateTable(["USD"], { fetch: down.fetch, now: () => later });
    expect(second).toMatchObject({ stale: true });
    expect(rateOf(second as RateTable, "USD")).toBe(56.2);
  });
  it("gives up on remembered rates once they are over a day old", async () => {
    await getRateTable(["USD"], { fetch: fakeFetch(ok).fetch, now: () => NOW });
    const down = fakeFetch(() => "throw");
    const muchLater = new Date(NOW.getTime() + FX_STALE_MAX_MS + 1000);
    expect(await getRateTable(["USD"], { fetch: down.fetch, now: () => muchLater })).toBeNull();
  });
  it("does not use remembered rates for a currency it never had", async () => {
    await getRateTable(["USD"], { fetch: fakeFetch(ok).fetch, now: () => NOW });
    const down = fakeFetch(() => "throw");
    expect(await getRateTable(["USD", "GBP"], { fetch: down.fetch, now: () => NOW })).toBeNull();
  });
});

describe("dashboard in PHP", () => {
  const rates = buildTable([
    { currency: "USD", rate: 56, source: "stub", updatedAt: NOW.toISOString() },
    { currency: "GBP", rate: 70, source: "stub", updatedAt: NOW.toISOString() },
  ]);
  const input = (over: Partial<DashboardInput> = {}): DashboardInput => ({
    projects: [
      { id: "p1", clientId: "c1", title: "US job", status: "active", currency: "USD", contractValue: 100000, acceptedAt: null, archivedAt: null },
      { id: "p2", clientId: "c1", title: "UK job", status: "active", currency: "GBP", contractValue: 50000, acceptedAt: null, archivedAt: null },
      { id: "p3", clientId: "c1", title: "PH job", status: "active", currency: "PHP", contractValue: 900000, acceptedAt: null, archivedAt: null },
    ],
    clients: [{ id: "c1", name: "Acme" }],
    prospects: [],
    payments: [
      { projectId: "p1", amount: 20000, paidOn: "2026-10-05" },
      { projectId: "p1", amount: 10000, paidOn: "2026-09-20" },
      { projectId: "p2", amount: 5000, paidOn: "2026-10-06" },
      { projectId: "p3", amount: 100000, paidOn: "2026-10-07" },
    ],
    schedule: [],
    revisions: [],
    now: NOW,
    ...over,
  });

  it("is absent without rates and does not change the original figures", () => {
    const data = buildDashboard(input());
    expect(data.converted).toBeNull();
    expect(data.fxUnavailable).toBe(false);
    expect(data.earnedThisMonth).toEqual({ USD: 20000, GBP: 5000, PHP: 100000 });
  });
  it("flags unavailable when rates were wanted but null", () => {
    expect(buildDashboard(input({ rates: null })).fxUnavailable).toBe(true);
  });
  it("converts KPIs bucket by bucket at the current rate", () => {
    const { converted } = buildDashboard(input({ rates }));
    expect(converted?.earnedThisMonth).toBe(20000 * 56 + 5000 * 70 + 100000);
    expect(converted?.earnedThisYear).toBe((20000 + 10000) * 56 + 5000 * 70 + 100000);
    // pending is contract value minus paid, per currency, then converted
    expect(converted?.pendingBalance).toBe((100000 - 30000) * 56 + (50000 - 5000) * 70 + (900000 - 100000));
  });
  it("builds a single PHP series whose bars add up to the total and whose last bar is this month", () => {
    const { converted } = buildDashboard(input({ rates }));
    expect(converted?.earningsSeries).toHaveLength(1);
    const series = converted!.earningsSeries[0];
    expect(series.currency).toBe("PHP");
    expect(series.points.at(-1)?.amount).toBe(converted!.earnedThisMonth);
    expect(series.summary.total).toBe(converted!.earnedThisYear + 0 /* all payments are this year */);
    expect(series.points.find((p) => p.month === "2026-09")?.amount).toBe(10000 * 56);
    expect(converted!.weeklyEarningsSeries).toHaveLength(1);
    expect(converted!.weeklyEarningsSeries[0].currency).toBe("PHP");
  });
  it("has no converted series when nothing was paid", () => {
    const { converted } = buildDashboard(input({ rates, payments: [] }));
    expect(converted?.earningsSeries).toEqual([]);
    expect(converted?.earnedThisMonth).toBe(0);
  });
  it("includes retainer billing and flags retainer prospects in the pipeline", () => {
    const data = buildDashboard(
      input({
        rates,
        projects: [
          { id: "r1", clientId: "c1", title: "Retainer", status: "active", currency: "USD", contractValue: 0, acceptedAt: new Date("2026-10-01T00:00:00Z"), archivedAt: null, kind: "retainer", rate: 5000, rateUnit: "hour" },
        ],
        payments: [],
        timeEntries: [
          { projectId: "r1", date: "2026-09-10", quantityHundredths: 1000 },
          { projectId: "r1", date: "2026-10-12", quantityHundredths: 500 },
        ],
        prospects: [
          { id: "pr1", name: "Rita", company: "", stage: "new", estimatedValue: 300000, currency: "USD", nextFollowUp: null, closedAt: null, archivedAt: null, engagementKind: "retainer" },
          { id: "pr2", name: "Fred", company: "", stage: "won", estimatedValue: 100, currency: "USD", nextFollowUp: null, closedAt: null, archivedAt: null },
        ],
      }),
    );
    // Sep (10h) is overdue, Oct (5h) is in progress: both are billed and unpaid.
    expect(data.pendingBalance).toEqual({ USD: 50000 + 25000 });
    expect(data.attention.overdue.map((o) => [o.label, o.outstanding])).toEqual([["Sep 2026", 50000]]);
    expect(data.recurringBilledThisMonth).toEqual({ USD: 25000 });
    expect(data.activeRetainers).toBe(1);
    expect(data.pipelineValue).toEqual({ USD: 300000 });
    expect(data.pipelineIncludesRetainers).toBe(true);
    expect(data.converted?.recurringBilledThisMonth).toBe(25000 * 56);
  });
  it("does not flag retainers in the pipeline when there are none", () => {
    expect(buildDashboard(input()).pipelineIncludesRetainers).toBe(false);
  });
});
