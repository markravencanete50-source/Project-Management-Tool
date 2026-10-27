import { formatIsoDate, type IsoDate } from "@/lib/dates";
import { sortSchedule } from "@/lib/finance";
import type { Currency } from "@/lib/money";
import type { AgreementSnapshot, Client, ScheduleKind, Settings } from "@/lib/types";

// Pure template merge. No server-only code, so it is unit tested directly.

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Where the template has no jurisdiction of its own. Edit the template to change it. */
export const DEFAULT_GOVERNING_LAW = "the Republic of the Philippines";

export type AgreementBlock = {
  kind: "title" | "heading" | "paragraph" | "bullet" | "spacer";
  text: string;
};

export type MergeResult = { text: string; missing: string[] };

/**
 * Replace {{name}} placeholders. Values are inserted in a single pass, so a
 * value that itself contains "{{x}}" is never expanded. Unknown names stay
 * visible as [missing: name] and are listed in `missing`.
 */
export function mergeTemplate(template: string, values: Record<string, string>): MergeResult {
  const missing: string[] = [];
  const text = template.replace(PLACEHOLDER, (_match, name: string) => {
    if (Object.hasOwn(values, name)) return values[name];
    if (!missing.includes(name)) missing.push(name);
    return `[missing: ${name}]`;
  });
  return { text, missing };
}

/** Lines such as "1. Parties" (decided from the template, never from inserted values). */
const HEADING = /^\d{1,2}\.\s+[A-Za-z][^{}]{0,70}$/;

function isHeadingLine(line: string): boolean {
  return HEADING.test(line) && !/[.:;,]$/.test(line);
}

/**
 * Merge a template into layout blocks for the PDF. Heading and title detection
 * looks at the template line only, so a scope text containing "1. Home page"
 * can never turn into a section heading.
 */
export function templateToBlocks(template: string, values: Record<string, string>): { blocks: AgreementBlock[]; missing: string[] } {
  const blocks: AgreementBlock[] = [];
  const missing: string[] = [];
  const lines = template.replace(/\r\n?/g, "\n").split("\n");
  let titleDone = false;

  const pushSpacer = () => {
    const last = blocks[blocks.length - 1];
    if (blocks.length > 0 && last.kind !== "spacer") blocks.push({ kind: "spacer", text: "" });
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim() === "") {
      pushSpacer();
      continue;
    }
    const merged = mergeTemplate(line, values);
    for (const name of merged.missing) if (!missing.includes(name)) missing.push(name);

    if (!titleDone) {
      titleDone = true;
      if (!/[a-z]/.test(line) && !line.includes("{{")) {
        blocks.push({ kind: "title", text: merged.text.trim() });
        continue;
      }
    }

    if (isHeadingLine(line.trim())) {
      pushSpacer();
      blocks.push({ kind: "heading", text: merged.text.trim() });
      continue;
    }

    // Inserted values can span several lines (scope, payment schedule).
    for (const sub of merged.text.replace(/\r\n?/g, "\n").split("\n")) {
      const trimmed = sub.trim();
      if (trimmed === "") {
        pushSpacer();
      } else if (/^[-*]\s+/.test(trimmed)) {
        blocks.push({ kind: "bullet", text: trimmed.replace(/^[-*]\s+/, "") });
      } else {
        blocks.push({ kind: "paragraph", text: trimmed });
      }
    }
  }
  while (blocks.length > 0 && blocks[blocks.length - 1].kind === "spacer") blocks.pop();
  return { blocks, missing };
}

/**
 * Amount as plain ASCII text ("GBP 1,500.00"). The PDF uses the built-in
 * Helvetica font, which has no peso sign, so currency symbols are avoided.
 */
export function formatAmountPlain(minor: number, currency: Currency): string {
  const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  return `${currency} ${number}`;
}

const KIND_LABEL: Record<ScheduleKind, string> = {
  deposit: "Deposit",
  milestone: "Milestone",
  final: "Final payment",
  change_order: "Change order",
};

export function describeSchedule(snapshot: Pick<AgreementSnapshot, "schedule" | "currency" | "price">): string {
  if (snapshot.schedule.length === 0) {
    return `- The full fee of ${formatAmountPlain(snapshot.price, snapshot.currency)} is payable as agreed in writing between the Parties.`;
  }
  const withOrder = snapshot.schedule.map((line, order) => ({ ...line, order }));
  return sortSchedule(withOrder)
    .map(
      (line) =>
        `- ${line.label} (${KIND_LABEL[line.kind]}): ${formatAmountPlain(line.amountDue, snapshot.currency)}, due ${formatIsoDate(line.dueDate)}`,
    )
    .join("\n");
}

export type AgreementValueInput = {
  settings: Pick<Settings, "businessName" | "businessEmail">;
  /** Used when settings.businessEmail is empty. */
  fallbackBusinessEmail: string;
  client: Pick<Client, "name" | "company" | "email">;
  projectTitle: string;
  snapshot: AgreementSnapshot;
  agreementDate: IsoDate;
  governingLaw?: string;
};

/** Every placeholder the default template may use. */
export function agreementValues(input: AgreementValueInput): Record<string, string> {
  const { settings, client, snapshot } = input;
  return {
    businessName: settings.businessName,
    businessEmail: settings.businessEmail || input.fallbackBusinessEmail,
    clientName: client.name,
    clientCompany: client.company || client.name,
    clientEmail: client.email,
    projectTitle: input.projectTitle,
    scope: snapshot.scope,
    price: formatAmountPlain(snapshot.price, snapshot.currency),
    currency: snapshot.currency,
    paymentSchedule: describeSchedule(snapshot),
    revisionAllowance: String(snapshot.revisionAllowance),
    startDate: snapshot.timeline.startDate ? formatIsoDate(snapshot.timeline.startDate) : "a date to be agreed",
    deadline: snapshot.timeline.deadline ? formatIsoDate(snapshot.timeline.deadline) : "a date to be agreed",
    agreementDate: formatIsoDate(input.agreementDate),
    governingLaw: input.governingLaw ?? DEFAULT_GOVERNING_LAW,
  };
}
