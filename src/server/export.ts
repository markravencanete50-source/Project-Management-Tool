import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { BACKUP_FOLDER, listFolder } from "@/lib/cloudinary";
import { entryAmount, fromHundredths } from "@/lib/billing";
import { todayIso } from "@/lib/dates";
import { expenseLines, normalizeExpense } from "@/lib/expenses";
import { fromMinor } from "@/lib/money";
import { col } from "@/server/data/refs";

// Full-data export used by the admin download and the nightly backup.
// exportAll() does NOT check a session itself: its only callers are route
// handlers that authenticate first (admin session, or the cron secret).

type Row = Record<string, unknown> & { id: string };

export type ExportData = {
  exportedAt: string;
  clients: Row[];
  prospects: Row[];
  projects: (Row & {
    milestones: Row[];
    schedule: Row[];
    payments: Row[];
    agreements: Row[];
    revisions: Row[];
    timeEntries: Row[];
    tasks: Row[];
  })[];
  /** Payment-only entries (collection standalonePayments), not attached to any project. */
  standalonePayments: Row[];
  /** Expenses (collection expenses). A recurring expense is one template row; its repeats are derived and not stored. */
  expenses: Row[];
  activity: Row[];
  settings: Record<string, unknown> | null;
};

/** Recursively turn Firestore Timestamps into ISO strings. */
function iso(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(iso);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, iso(v)]));
  }
  return value;
}

function rows(snap: FirebaseFirestore.QuerySnapshot): Row[] {
  return snap.docs.map((d) => ({ ...(iso(d.data()) as Record<string, unknown>), id: d.id }));
}

/** Every collection except loginTokens, with project subcollections nested. */
export async function exportAll(): Promise<ExportData> {
  const [clients, prospects, projectsSnap, activity, settingsSnap, standalone, expenses] = await Promise.all([
    col.clients().get(),
    col.prospects().get(),
    col.projects().get(),
    col.activity().get(),
    col.settings().get(),
    col.standalonePayments().get(),
    col.expenses().get(),
  ]);

  const projects = await Promise.all(
    projectsSnap.docs.map(async (doc) => {
      const [milestones, schedule, payments, agreements, revisions, timeEntries, tasks] = await Promise.all([
        col.milestones(doc.id).get(),
        col.schedule(doc.id).get(),
        col.payments(doc.id).get(),
        col.agreements(doc.id).get(),
        col.revisions(doc.id).get(),
        col.timeEntries(doc.id).get(),
        col.tasks(doc.id).get(),
      ]);
      return {
        ...(iso(doc.data()) as Record<string, unknown>),
        id: doc.id,
        milestones: rows(milestones),
        schedule: rows(schedule),
        payments: rows(payments),
        agreements: rows(agreements),
        revisions: rows(revisions),
        timeEntries: rows(timeEntries),
        tasks: rows(tasks),
      };
    }),
  );

  return {
    exportedAt: new Date().toISOString(),
    clients: rows(clients),
    prospects: rows(prospects),
    projects,
    standalonePayments: rows(standalone),
    expenses: rows(expenses),
    activity: rows(activity),
    settings: settingsSnap.exists ? (iso(settingsSnap.data()) as Record<string, unknown>) : null,
  };
}

/** Quote a CSV cell, and defuse spreadsheet formulas in user-entered text. */
function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * One flat CSV: every payment joined with its project title, client name and
 * currency. Amounts are shown as decimals plus the stored minor units.
 */
export function paymentsCsv(data: ExportData): string {
  const clientNames = new Map(data.clients.map((c) => [c.id, String(c.name ?? "")]));
  const header = [
    "payment_id",
    "paid_on",
    "amount",
    "amount_minor_units",
    "currency",
    "method",
    "note",
    "has_receipt",
    "project_id",
    "project_title",
    "project_kind",
    "client_id",
    "client_name",
    "recorded_at",
    "source",
  ];
  const lines = [header.join(",")];
  const payments = data.projects.flatMap((project) =>
    project.payments.map((payment) => ({ project, payment })),
  );
  payments.sort((a, b) => String(a.payment.paidOn ?? "").localeCompare(String(b.payment.paidOn ?? "")));
  for (const { project, payment } of payments) {
    const amount = Number(payment.amount ?? 0);
    lines.push(
      [
        payment.id,
        payment.paidOn,
        fromMinor(amount),
        amount,
        project.currency,
        payment.method,
        payment.note,
        payment.receiptPublicId ? "yes" : "no",
        project.id,
        project.title,
        project.kind ?? "fixed",
        project.clientId,
        clientNames.get(String(project.clientId)) ?? "",
        payment.createdAt,
        "project",
      ]
        .map(cell)
        .join(","),
    );
  }
  // Payment-only entries: project columns are empty and project_kind is "none".
  const standalone = [...data.standalonePayments].sort((a, b) => String(a.paidOn ?? "").localeCompare(String(b.paidOn ?? "")));
  for (const payment of standalone) {
    const amount = Number(payment.amount ?? 0);
    const clientId = payment.clientId ? String(payment.clientId) : "";
    lines.push(
      [
        payment.id,
        payment.paidOn,
        fromMinor(amount),
        amount,
        payment.currency,
        payment.method,
        payment.note,
        payment.receiptPublicId ? "yes" : "no",
        "",
        "",
        "none",
        clientId,
        clientId ? (clientNames.get(clientId) ?? "") : payment.payerName,
        payment.createdAt,
        "standalone",
      ]
        .map(cell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * Expenses as one flat CSV, newest first. Recurring expenses are expanded the same way the app
 * does on screen: the stored template is one row and every derived repeat up to today (Manila)
 * is its own row with derived = yes and row_type recurring_repeat. Derived rows are not stored.
 */
export function expensesCsv(data: ExportData, today: string = todayIso()): string {
  const clientNames = new Map(data.clients.map((c) => [c.id, String(c.name ?? "")]));
  const projectTitles = new Map(data.projects.map((p) => [p.id, String(p.title ?? "")]));
  const header = [
    "expense_id",
    "date",
    "description",
    "category",
    "vendor",
    "amount",
    "amount_minor_units",
    "currency",
    "method",
    "note",
    "client_id",
    "client_name",
    "project_id",
    "project_title",
    "recurring",
    "recurring_until",
    "row_type",
    "derived",
    "has_receipt",
    "recorded_at",
  ];
  const lines = [header.join(",")];
  const expenses = data.expenses.map((row) => {
    const created = typeof row.createdAt === "string" ? new Date(row.createdAt) : new Date(0);
    const updated = typeof row.updatedAt === "string" ? new Date(row.updatedAt) : created;
    return normalizeExpense(row.id, row, created, updated);
  });
  for (const line of expenseLines(expenses, today)) {
    lines.push(
      [
        line.expenseId,
        line.date,
        line.description,
        line.category,
        line.vendor,
        fromMinor(line.amount),
        line.amount,
        line.currency,
        line.method,
        line.note,
        line.clientId ?? "",
        line.clientId ? (clientNames.get(line.clientId) ?? "") : "",
        line.projectId ?? "",
        line.projectId ? (projectTitles.get(line.projectId) ?? "") : "",
        line.recurring,
        line.recurringUntil ?? "",
        line.derived ? "recurring_repeat" : line.recurring === "none" ? "expense" : "recurring_template",
        line.derived ? "yes" : "no",
        line.receiptPublicId ? "yes" : "no",
        line.createdAt.getTime() === 0 ? "" : line.createdAt.toISOString(),
      ]
        .map(cell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * Retainer time entries as one flat CSV, with the rate and each entry's value.
 * Entry value is round(quantity * rate / 100), the same rule the app bills with.
 */
export function timeEntriesCsv(data: ExportData): string {
  const clientNames = new Map(data.clients.map((c) => [c.id, String(c.name ?? "")]));
  const header = [
    "entry_id",
    "date",
    "quantity",
    "unit",
    "rate",
    "rate_minor_units",
    "amount",
    "amount_minor_units",
    "currency",
    "note",
    "project_id",
    "project_title",
    "client_name",
  ];
  const lines = [header.join(",")];
  const entries = data.projects
    .filter((p) => p.kind === "retainer")
    .flatMap((project) => project.timeEntries.map((entry) => ({ project, entry })));
  entries.sort((a, b) => String(a.entry.date ?? "").localeCompare(String(b.entry.date ?? "")));
  for (const { project, entry } of entries) {
    const hundredths = Number(entry.quantityHundredths ?? 0);
    const rate = Number(project.rate ?? 0);
    const amount = entryAmount(hundredths, rate);
    lines.push(
      [
        entry.id,
        entry.date,
        fromHundredths(hundredths),
        project.rateUnit ?? "",
        fromMinor(rate),
        rate,
        fromMinor(amount),
        amount,
        project.currency,
        entry.note,
        project.id,
        project.title,
        clientNames.get(String(project.clientId)) ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Priced tasks as one flat CSV. */
export function tasksCsv(data: ExportData): string {
  const clientNames = new Map(data.clients.map((c) => [c.id, String(c.name ?? "")]));
  const header = ["task_id", "title", "status", "price", "price_minor_units", "currency", "done_at", "project_id", "project_title", "client_name"];
  const lines = [header.join(",")];
  const tasks = data.projects
    .filter((p) => p.kind === "tasks")
    .flatMap((project) => project.tasks.map((task) => ({ project, task })));
  tasks.sort((a, b) => String(a.project.title).localeCompare(String(b.project.title)) || Number(a.task.order ?? 0) - Number(b.task.order ?? 0));
  for (const { project, task } of tasks) {
    const price = Number(task.price ?? 0);
    lines.push(
      [task.id, task.title, task.status, fromMinor(price), price, project.currency, task.doneAt, project.id, project.title, clientNames.get(String(project.clientId)) ?? ""]
        .map(cell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Backups in Cloudinary, newest first. Admin only. */
export async function listBackups(): Promise<{ storedId: string; name: string; createdAt: string }[]> {
  await requireAdmin();
  const items = await listFolder(BACKUP_FOLDER, "raw");
  return items
    .map((i) => ({ ...i, name: i.storedId.split("/").pop() ?? i.storedId }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
