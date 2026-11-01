import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRateTable, resetFxMemory } from "@/lib/fx/provider";
import { convertMoney, rateOf, sourceLabel, type RateTable } from "@/lib/fx/convert";
import {
  normalizeFxOverrides,
  parseRateInput,
  resolveRateTable,
  sourceMix,
  unitsToInput,
  unitsToRate,
} from "@/lib/fx/overrides";
import { settingsSchema } from "@/lib/validation/settings";
import { fxLine, fxNote } from "@/components/dashboard/currency-view";
import type { Currency } from "@/lib/money";

const NOW = new Date("2026-10-27T04:00:00Z");
const erBody = (rate: number) => ({ result: "success", rates: { PHP: rate }, time_last_update_unix: 1_790_000_000 });

function fakeFetch(rates: Partial<Record<Currency, number>> | "fail") {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (rates === "fail") throw new Error("network down");
    const cur = /latest\/([A-Z]{3})/.exec(url)?.[1] as Currency | undefined;
    const rate = cur ? rates[cur] : undefined;
    if (!rate) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(erBody(rate)), { status: 200 });
  });
}
const liveLoader = (f: ReturnType<typeof fakeFetch>) => (cs: Currency[]): Promise<RateTable | null> =>
  getRateTable(cs, { fetch: f as unknown as typeof fetch, now: () => NOW });

beforeEach(() => resetFxMemory());

describe("resolveRateTable", () => {
  it("a manual rate beats the live rate", async () => {
    const f = fakeFetch({ USD: 56, GBP: 70 });
    const t = await resolveRateTable(["USD", "GBP"], { USD: 565000 }, liveLoader(f), NOW);
    expect(rateOf(t!, "USD")).toBe(56.5);
    expect(rateOf(t!, "GBP")).toBe(70);
    expect(t!.quotes.map((q) => q.source)).toEqual(["manual", "open.er-api.com"]);
    expect(sourceMix(t!)).toBe("mixed");
  });
  it("only asks the network about currencies without a manual rate", async () => {
    const f = fakeFetch({ GBP: 70 });
    await resolveRateTable(["USD", "GBP"], { USD: 565000 }, liveLoader(f), NOW);
    expect(f.mock.calls.every(([u]) => !String(u).includes("USD"))).toBe(true);
    expect(f).toHaveBeenCalled();
  });
  it("makes zero network calls when every needed currency has a manual rate", async () => {
    const f = fakeFetch("fail");
    const t = await resolveRateTable(["USD", "GBP", "PHP"], { USD: 560000, GBP: 720000 }, liveLoader(f), NOW);
    expect(f).not.toHaveBeenCalled();
    expect(sourceMix(t!)).toBe("manual");
    expect(t!.stale).toBe(false);
  });
  it("only needs overrides for the currencies in use", async () => {
    const f = fakeFetch("fail");
    const t = await resolveRateTable(["USD", "PHP"], { USD: 560000 }, liveLoader(f), NOW);
    expect(f).not.toHaveBeenCalled();
    expect(rateOf(t!, "USD")).toBe(56);
    expect(rateOf(t!, "PHP")).toBe(1);
  });
  it("converts normally when live rates fail but the needed currency has an override", async () => {
    const f = fakeFetch("fail");
    const t = await resolveRateTable(["USD"], { USD: 561234 }, liveLoader(f), NOW);
    expect(t).not.toBeNull();
    expect(convertMoney({ USD: 10000 }, t!)).toBe(Math.round(10000 * 56.1234));
  });
  it("is null when live fails for a currency without an override", async () => {
    const f = fakeFetch("fail");
    expect(await resolveRateTable(["USD", "GBP"], { USD: 560000 }, liveLoader(f), NOW)).toBeNull();
  });
  it("no overrides behaves like the live table", async () => {
    const f = fakeFetch({ USD: 56 });
    const t = await resolveRateTable(["USD"], {}, liveLoader(f), NOW);
    expect(sourceMix(t!)).toBe("live");
    expect(rateOf(t!, "USD")).toBe(56);
  });
  it("ignores manual quotes for the updated time and provider", async () => {
    const f = fakeFetch({ GBP: 70 });
    const t = await resolveRateTable(["USD", "GBP"], { USD: 560000 }, liveLoader(f), NOW);
    expect(t!.provider).toBe("market");
    expect(t!.updatedAt).toBe(new Date(1_790_000_000 * 1000).toISOString());
  });
});

describe("storage in 1/10000 PHP", () => {
  it("parses up to 4 decimals into integers without float drift", () => {
    expect(parseRateInput("56.1234")).toBe(561234);
    expect(parseRateInput("56")).toBe(560000);
    expect(parseRateInput("0.0001")).toBe(1);
    expect(parseRateInput("1,234.5")).toBe(12345000);
    expect(parseRateInput("1000000")).toBe(10_000_000_000);
    expect(parseRateInput("72.1")).toBe(721000);
  });
  it("rejects bad text", () => {
    for (const bad of ["", "abc", "0", "0.00001", "56.12345", "-5", "1000000.0001", "5e3", "1.2.3"]) {
      expect(parseRateInput(bad), bad).toBeNull();
    }
  });
  it("round trips and converts to a rate", () => {
    expect(unitsToInput(561234)).toBe("56.1234");
    expect(unitsToInput(560000)).toBe("56");
    expect(unitsToInput(565000)).toBe("56.5");
    expect(unitsToRate(561234)).toBe(56.1234);
  });
});

describe("normalizeFxOverrides", () => {
  it("treats old docs as no overrides", () => {
    expect(normalizeFxOverrides(undefined)).toEqual({});
    expect(normalizeFxOverrides(null)).toEqual({});
    expect(normalizeFxOverrides("x")).toEqual({});
  });
  it("keeps valid ints and drops junk", () => {
    expect(normalizeFxOverrides({ USD: 561234, GBP: 0, PHP: 5 })).toEqual({ USD: 561234 });
    expect(normalizeFxOverrides({ USD: 5.5, GBP: "7" })).toEqual({});
    expect(normalizeFxOverrides({ GBP: 20_000_000_000 })).toEqual({});
  });
});

describe("settings validation", () => {
  const base = {
    acceptedRule: "signed" as const,
    defaultRevisionAllowance: 2,
    businessName: "Mark",
    businessEmail: "",
    agreementTemplate: "x".repeat(30),
  };
  it("accepts null, absent and valid rates", () => {
    expect(settingsSchema.safeParse({ ...base, fxOverrides: {} }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, fxOverrides: { USD: null, GBP: 721000 } }).success).toBe(true);
  });
  it("rejects zero, negative, fractional, huge and NaN", () => {
    for (const bad of [0, -1, 1.5, 10_000_000_001, Number.NaN, "56"]) {
      expect(settingsSchema.safeParse({ ...base, fxOverrides: { USD: bad } }).success, String(bad)).toBe(false);
    }
  });
});

describe("source labels and dashboard wording", () => {
  it("labels sources", () => {
    expect(sourceLabel("manual")).toBe("your rate");
    expect(sourceLabel("wise")).toBe("Wise");
    expect(sourceLabel("open.er-api.com")).toBe("market");
  });
  it("words the info line by mix", () => {
    expect(fxLine("manual", "market", null, false)).toBe("Converted at the rates you set in Settings.");
    expect(fxLine("mixed", "wise", "5 minutes ago", false)).toBe("Converted at your rates and Wise mid-market rates, updated 5 minutes ago.");
    expect(fxLine("live", "market", "1 hour ago", false)).toBe("Converted at market rates, updated 1 hour ago.");
    expect(fxNote("manual")).toContain("rate you set applies to all past payments");
    expect(fxNote("live")).toContain("Past payments use today's rate");
  });
});
