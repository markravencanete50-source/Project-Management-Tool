import { describe, expect, it } from "vitest";
import { estimatedValueLabel, newProjectFields, normalizeProspectEngagement, prospectProjectInput, valueSuffix } from "@/lib/engagement";
import { prospectInputSchema } from "@/lib/validation/prospects";
import { projectFromDoc, prospectFromDoc } from "@/server/data/convert";
import { tabsFor } from "@/components/projects-core/tab-values";
import type { DocumentSnapshot } from "firebase-admin/firestore";

// 2026-11-01 12:00 in Manila
const NOW = new Date("2026-11-01T04:00:00Z");

const snap = (data: Record<string, unknown>) => ({ id: "doc1", data: () => data }) as unknown as DocumentSnapshot;

describe("new project fields by kind", () => {
  const base = { clientId: "c1", title: "Work", description: "d", currency: "USD" as const, startDate: null, deadline: null };

  it("fixed stays a draft with no acceptance and keeps its contract fields", () => {
    expect(newProjectFields({ ...base, kind: "fixed", contractValue: 250000, revisionAllowance: 2 }, NOW)).toEqual({
      clientId: "c1",
      title: "Work",
      description: "d",
      currency: "USD",
      status: "draft",
      kind: "fixed",
      startDate: null,
      deadline: null,
      acceptedAt: null,
      contractValue: 250000,
      rate: 0,
      rateUnit: null,
      revisionAllowance: 2,
    });
  });
  it("retainer starts active, accepted at its start date, with rate and unit and no contract value", () => {
    const f = newProjectFields({ ...base, kind: "retainer", rate: 5000, rateUnit: "day", startDate: "2026-10-15" }, NOW);
    expect(f).toMatchObject({ status: "active", kind: "retainer", startDate: "2026-10-15", contractValue: 0, rate: 5000, rateUnit: "day", revisionAllowance: 0 });
    // Start of 15 Oct in Manila is 14 Oct 16:00 UTC.
    expect(f.acceptedAt?.toISOString()).toBe("2026-10-14T16:00:00.000Z");
  });
  it("retainer and tasks default the start date to today in Manila", () => {
    const r = newProjectFields({ ...base, kind: "retainer", rate: 100, rateUnit: "hour" }, NOW);
    expect(r.startDate).toBe("2026-11-01");
    expect(r.acceptedAt?.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    const t = newProjectFields({ ...base, kind: "tasks" }, NOW);
    expect(t).toMatchObject({ status: "active", kind: "tasks", startDate: "2026-11-01", rate: 0, rateUnit: null, contractValue: 0 });
  });
});

describe("kind defaults for old documents", () => {
  it("a project with no kind is fixed with no rate", () => {
    const p = projectFromDoc(snap({ clientId: "c", title: "Old", contractValue: 5000, status: "active" }));
    expect(p).toMatchObject({ id: "doc1", kind: "fixed", rate: 0, rateUnit: null, contractValue: 5000 });
  });
  it("a project with a kind keeps its fields", () => {
    const p = projectFromDoc(snap({ kind: "retainer", rate: 4000, rateUnit: "day", contractValue: 0 }));
    expect(p).toMatchObject({ kind: "retainer", rate: 4000, rateUnit: "day" });
  });
  it("a prospect with no kind is a fixed prospect", () => {
    const p = prospectFromDoc(snap({ name: "Old", estimatedValue: 900, currency: "GBP" }));
    expect(p).toMatchObject({ engagementKind: "fixed", rate: 0, rateUnit: null, estimatedValue: 900 });
    expect(normalizeProspectEngagement({})).toEqual({ engagementKind: "fixed", rate: 0, rateUnit: null });
  });
  it("only retainer prospects keep a rate", () => {
    expect(normalizeProspectEngagement({ engagementKind: "tasks", rate: 500, rateUnit: "day" })).toEqual({ engagementKind: "tasks", rate: 0, rateUnit: null });
    expect(normalizeProspectEngagement({ engagementKind: "retainer", rate: 500, rateUnit: "day" })).toEqual({ engagementKind: "retainer", rate: 500, rateUnit: "day" });
    expect(normalizeProspectEngagement({ engagementKind: "retainer" })).toEqual({ engagementKind: "retainer", rate: 0, rateUnit: "hour" });
  });
  it("project tabs depend on the kind, and fixed keeps its original five", () => {
    expect(tabsFor("fixed").map((t) => t.value)).toEqual(["overview", "payments", "agreement", "revisions", "activity"]);
    expect(tabsFor("retainer").map((t) => t.value)).toEqual(["overview", "time", "payments", "activity"]);
    expect(tabsFor("tasks").map((t) => t.value)).toEqual(["overview", "tasks", "payments", "activity"]);
  });
});

describe("converting a prospect creates a project of the same kind", () => {
  const prospect = { service: "  Monthly dev  ", currency: "GBP" as const, estimatedValue: 400000 };

  it("fixed: draft with the estimated value as contract value, exactly as before", () => {
    const input = prospectProjectInput({ ...prospect, engagementKind: "fixed", rate: 0, rateUnit: null }, "c9", 3);
    expect(newProjectFields(input, NOW)).toEqual({
      clientId: "c9",
      title: "Monthly dev",
      description: "",
      status: "draft",
      kind: "fixed",
      startDate: null,
      deadline: null,
      acceptedAt: null,
      currency: "GBP",
      contractValue: 400000,
      rate: 0,
      rateUnit: null,
      revisionAllowance: 3,
    });
  });
  it("retainer: active, rate unit and currency copied, accepted at the start date, no contract value", () => {
    const input = prospectProjectInput({ ...prospect, engagementKind: "retainer", rate: 6000, rateUnit: "day" }, "c9", 3);
    const f = newProjectFields(input, NOW);
    expect(f).toMatchObject({
      kind: "retainer",
      status: "active",
      currency: "GBP",
      rate: 6000,
      rateUnit: "day",
      contractValue: 0,
      revisionAllowance: 0,
      startDate: "2026-11-01",
    });
    expect(f.acceptedAt).toBeInstanceOf(Date);
  });
  it("tasks: active with no rate and no contract value", () => {
    const input = prospectProjectInput({ ...prospect, engagementKind: "tasks", rate: 0, rateUnit: null }, "c9", 3);
    expect(newProjectFields(input, NOW)).toMatchObject({ kind: "tasks", status: "active", rate: 0, rateUnit: null, contractValue: 0 });
  });
  it("falls back to a generic title", () => {
    const input = prospectProjectInput({ ...prospect, service: "   ", engagementKind: "tasks", rate: 0, rateUnit: null }, "c9", 3);
    expect(input.title).toBe("New project");
  });
});

describe("prospect form schema", () => {
  const base = {
    name: "Nina",
    company: "",
    email: "",
    source: "other",
    service: "",
    estimatedValue: "1500",
    currency: "USD",
    nextFollowUp: "",
    notes: "",
  };

  it("keeps a rate only for retainers", () => {
    const retainer = prospectInputSchema.parse({ ...base, engagementKind: "retainer", rateUnit: "hour", rate: "25" });
    expect(retainer).toMatchObject({ engagementKind: "retainer", rate: 2500, rateUnit: "hour", estimatedValue: 150000 });
    const fixed = prospectInputSchema.parse({ ...base, engagementKind: "fixed", rateUnit: "hour", rate: "25" });
    expect(fixed).toMatchObject({ engagementKind: "fixed", rate: 0, rateUnit: null });
  });
  it("requires a rate for a retainer prospect", () => {
    const r = prospectInputSchema.safeParse({ ...base, engagementKind: "retainer", rateUnit: "hour", rate: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["rate"]);
  });
});

describe("value labels", () => {
  it("monthly for retainers, project value otherwise", () => {
    expect(estimatedValueLabel("retainer")).toBe("Estimated monthly value");
    expect(estimatedValueLabel("fixed")).toBe("Estimated project value");
    expect(estimatedValueLabel("tasks")).toBe("Estimated project value");
    expect(valueSuffix("retainer")).toBe("/mo");
    expect(valueSuffix("fixed")).toBe("");
  });
});
