import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { DEFAULT_AGREEMENT_TEMPLATE } from "@/lib/pdf/default-template";
import { agreementValues, describeSchedule, formatAmountPlain, mergeTemplate, templateToBlocks } from "@/lib/pdf/merge";
import { renderAgreementPdf } from "@/lib/pdf/agreement-document";
import { appendSignaturePages } from "@/lib/pdf/signed-pdf";
import { sha256Hex } from "@/lib/pdf/hash";
import { winAnsiSafe } from "@/lib/pdf/text";
import { safeNextPath, signBodySchema } from "@/lib/validation/agreements";
import type { AgreementSnapshot } from "@/lib/types";

const snapshot: AgreementSnapshot = {
  scope: "1. Home page\n2. Contact form\n- Blog",
  price: 150000,
  currency: "PHP",
  schedule: [
    { label: "Final", kind: "final", amountDue: 100000, dueDate: "2026-12-01" },
    { label: "Deposit", kind: "deposit", amountDue: 50000, dueDate: "2026-11-01" },
  ],
  revisionAllowance: 2,
  timeline: { startDate: "2026-11-02", deadline: null },
};

const values = agreementValues({
  settings: { businessName: "Mark Raven", businessEmail: "" },
  fallbackBusinessEmail: "mark@example.com",
  client: { name: "Ana Reyes", company: "", email: "ana@example.com" },
  projectTitle: "Company website",
  snapshot,
  agreementDate: "2026-10-27",
});

describe("mergeTemplate", () => {
  it("fills placeholders, with optional spaces and repeats", () => {
    const r = mergeTemplate("Hi {{ name }}, {{name}}!", { name: "Ana" });
    expect(r.text).toBe("Hi Ana, Ana!");
    expect(r.missing).toEqual([]);
  });

  it("keeps unknown placeholders visible and lists them once", () => {
    const r = mergeTemplate("{{a}} {{b}} {{a}}", { a: "x" });
    expect(r.text).toBe("x [missing: b] x");
    expect(r.missing).toEqual(["b"]);
  });

  it("does not resolve inherited object keys", () => {
    const r = mergeTemplate("{{constructor}} {{toString}}", {});
    expect(r.text).toBe("[missing: constructor] [missing: toString]");
  });

  it("does not expand placeholders inside inserted values", () => {
    const r = mergeTemplate("{{scope}}", { scope: "Build {{secret}}" });
    expect(r.text).toBe("Build {{secret}}");
    expect(r.missing).toEqual([]);
  });

  it("accepts an empty value without calling it missing", () => {
    expect(mergeTemplate("[{{x}}]", { x: "" })).toEqual({ text: "[]", missing: [] });
  });
});

describe("default template", () => {
  it("resolves every placeholder from the standard values", () => {
    const { missing } = templateToBlocks(DEFAULT_AGREEMENT_TEMPLATE, values);
    expect(missing).toEqual([]);
  });

  it("covers the required sections and has no em dashes", () => {
    for (const title of [
      "Parties",
      "Scope of Work",
      "Timeline",
      "Fees and Payment Schedule",
      "Revisions",
      "Client Responsibilities",
      "Intellectual Property",
      "Confidentiality",
      "Termination",
      "Limitation of Liability",
      "Electronic Signature",
      "Governing Law",
    ]) {
      expect(DEFAULT_AGREEMENT_TEMPLATE).toMatch(new RegExp(`^\\d+\\. ${title}$`, "m"));
    }
    expect(DEFAULT_AGREEMENT_TEMPLATE).not.toContain("—");
  });

  it("uses template lines, not inserted scope text, for headings", () => {
    const { blocks } = templateToBlocks(DEFAULT_AGREEMENT_TEMPLATE, values);
    const headings = blocks.filter((b) => b.kind === "heading").map((b) => b.text);
    expect(headings).toHaveLength(12);
    expect(headings).not.toContain("1. Home page");
    expect(blocks[0]).toEqual({ kind: "title", text: "WEB DEVELOPMENT SERVICE AGREEMENT" });
    expect(blocks.some((b) => b.kind === "paragraph" && b.text === "1. Home page")).toBe(true);
    expect(blocks.some((b) => b.kind === "bullet" && b.text === "Blog")).toBe(true);
  });
});

describe("agreement values", () => {
  it("formats money as plain ASCII and sorts the schedule by due date", () => {
    expect(formatAmountPlain(150050, "PHP")).toBe("PHP 1,500.50");
    expect(values.price).toBe("PHP 1,500.00");
    const lines = describeSchedule(snapshot).split("\n");
    expect(lines[0]).toContain("Deposit");
    expect(lines[1]).toContain("Final");
    expect(values.businessEmail).toBe("mark@example.com");
    expect(values.clientCompany).toBe("Ana Reyes");
    expect(values.deadline).toBe("a date to be agreed");
  });
});

describe("pdf generation", () => {
  it("renders a PDF and appends signature and audit pages", async () => {
    const { blocks } = templateToBlocks(DEFAULT_AGREEMENT_TEMPLATE, values);
    const original = await renderAgreementPdf({ title: "Agreement: Company website", footerLabel: "Test | Version 1", blocks });
    expect(original.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const originalPages = (await PDFDocument.load(original)).getPageCount();
    expect(originalPages).toBeGreaterThanOrEqual(2);

    // 1x1 transparent PNG
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const signed = await appendSignaturePages(original, {
      agreementId: "agr_123",
      version: 1,
      signerName: "Ana Reyes ₱ 中",
      signerEmail: "ana@example.com",
      signedAt: new Date("2026-10-27T10:00:00Z"),
      ip: "203.0.113.9",
      userAgent: "Mozilla/5.0 ".repeat(40) + "x".repeat(200),
      originalHash: sha256Hex(original),
      signaturePng: png,
      consentText: "I have read and agree to this agreement and consent to sign electronically.",
    });
    const doc = await PDFDocument.load(signed);
    expect(doc.getPageCount()).toBe(originalPages + 2);
    expect(sha256Hex(signed)).not.toBe(sha256Hex(original));
  });
});

describe("text and input safety", () => {
  it("replaces characters Helvetica cannot draw", () => {
    expect(winAnsiSafe("José ₱ 中\nline")).toBe("José ? ? line");
    expect(winAnsiSafe("“quoted”")).toBe("“quoted”");
  });

  it("only allows next paths inside the portal", () => {
    expect(safeNextPath("/portal")).toBe("/portal");
    expect(safeNextPath("/portal/projects/abc/agreement")).toBe("/portal/projects/abc/agreement");
    for (const bad of ["/admin", "//evil.com", "/portal//evil.com", "https://evil.com", "/portal\\evil", "portal", "", null, 5, "/portalx"]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });

  it("validates the sign request body", () => {
    const ok = {
      projectId: "p1",
      agreementId: "a1",
      version: 1,
      pdfHash: "a".repeat(64),
      signerName: "  Ana Reyes ",
      signatureDataUrl: "data:image/png;base64,AAAA",
      consent: true,
    };
    const parsed = signBodySchema.safeParse(ok);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.signerName).toBe("Ana Reyes");
    expect(signBodySchema.safeParse({ ...ok, consent: false }).success).toBe(false);
    expect(signBodySchema.safeParse({ ...ok, pdfHash: "xyz" }).success).toBe(false);
    expect(signBodySchema.safeParse({ ...ok, signatureDataUrl: "data:image/jpeg;base64,AAAA" }).success).toBe(false);
    expect(signBodySchema.safeParse({ ...ok, signerName: "A" }).success).toBe(false);
    expect(signBodySchema.safeParse({ ...ok, projectId: "../x" }).success).toBe(false);
  });
});
