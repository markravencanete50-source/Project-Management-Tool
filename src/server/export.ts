import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { BACKUP_FOLDER, listFolder } from "@/lib/cloudinary";
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
  })[];
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
  const [clients, prospects, projectsSnap, activity, settingsSnap] = await Promise.all([
    col.clients().get(),
    col.prospects().get(),
    col.projects().get(),
    col.activity().get(),
    col.settings().get(),
  ]);

  const projects = await Promise.all(
    projectsSnap.docs.map(async (doc) => {
      const [milestones, schedule, payments, agreements, revisions] = await Promise.all([
        col.milestones(doc.id).get(),
        col.schedule(doc.id).get(),
        col.payments(doc.id).get(),
        col.agreements(doc.id).get(),
        col.revisions(doc.id).get(),
      ]);
      return {
        ...(iso(doc.data()) as Record<string, unknown>),
        id: doc.id,
        milestones: rows(milestones),
        schedule: rows(schedule),
        payments: rows(payments),
        agreements: rows(agreements),
        revisions: rows(revisions),
      };
    }),
  );

  return {
    exportedAt: new Date().toISOString(),
    clients: rows(clients),
    prospects: rows(prospects),
    projects,
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
    "client_id",
    "client_name",
    "recorded_at",
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
        project.clientId,
        clientNames.get(String(project.clientId)) ?? "",
        payment.createdAt,
      ]
        .map(cell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Backups in Cloudinary, newest first. Admin only. */
export async function listBackups(): Promise<{ storedId: string; name: string; createdAt: string }[]> {
  await requireAdmin();
  const items = await listFolder(BACKUP_FOLDER, "raw");
  return items
    .map((i) => ({ ...i, name: i.storedId.split("/").pop() ?? i.storedId }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
