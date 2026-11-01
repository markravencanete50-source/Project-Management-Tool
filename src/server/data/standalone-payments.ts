import "server-only";
import { requireAdmin } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { normalizeStandalone, sortLedger, type LedgerRow } from "@/lib/standalone-payments";
import { col } from "@/server/data/refs";
import { fromDocs, projectsFromDocs } from "@/server/data/convert";
import { db } from "@/lib/firebase/admin";
import type { Client, Payment, StandalonePayment } from "@/lib/types";

/** Raw docs to normalised payments. Timestamps are already Dates after fromDocs. */
export function standaloneFromSnap(snap: FirebaseFirestore.QuerySnapshot): StandalonePayment[] {
  return fromDocs<Record<string, unknown> & { id: string; createdAt: Date; updatedAt: Date }>(snap).map((d) =>
    normalizeStandalone(d.id, d, d.createdAt instanceof Date ? d.createdAt : new Date(0), d.updatedAt instanceof Date ? d.updatedAt : new Date(0)),
  );
}

/** Admin: every payment-only entry, newest first. */
export async function listStandalonePayments(): Promise<StandalonePayment[]> {
  await requireAdmin();
  return sortLedger(standaloneFromSnap(await col.standalonePayments().get()));
}

/** Admin: one client's payment-only entries, newest first. */
export async function listStandaloneForClient(clientId: string): Promise<StandalonePayment[]> {
  await requireAdmin();
  const snap = await col.standalonePayments().where("clientId", "==", clientId).get();
  return sortLedger(standaloneFromSnap(snap));
}

export type Ledger = {
  rows: LedgerRow[];
  clients: { id: string; name: string }[];
};

/** Admin: ALL money received, project payments and payment-only entries, newest first. */
export async function getLedger(): Promise<Ledger> {
  await requireAdmin();
  const [projectsSnap, clientsSnap, paymentsSnap, standaloneSnap] = await Promise.all([
    col.projects().get(),
    col.clients().get(),
    db().collectionGroup("payments").get(),
    col.standalonePayments().get(),
  ]);
  const projects = new Map(projectsFromDocs(projectsSnap).map((p) => [p.id, p]));
  const clients = fromDocs<Client>(clientsSnap);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const rows: LedgerRow[] = [];
  for (const d of paymentsSnap.docs) {
    const projectId = d.ref.parent.parent!.id;
    const project = projects.get(projectId);
    if (!project) continue;
    const p = { ...(d.data() as Payment), id: d.id };
    const created = (d.data().createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
    rows.push({
      id: d.id,
      source: "project",
      projectId,
      projectTitle: project.title,
      clientId: project.clientId,
      who: clientName.get(project.clientId) ?? "Unknown client",
      currency: project.currency,
      amount: p.amount,
      paidOn: p.paidOn,
      method: p.method,
      note: p.note ?? "",
      receiptPublicId: p.receiptPublicId ?? null,
      createdAt: created,
    });
  }
  for (const s of standaloneFromSnap(standaloneSnap)) {
    rows.push({
      id: s.id,
      source: "standalone",
      projectId: null,
      projectTitle: null,
      clientId: s.clientId,
      who: s.clientId ? (clientName.get(s.clientId) ?? "Unknown client") : s.payerName || "Someone else",
      currency: s.currency,
      amount: s.amount,
      paidOn: s.paidOn,
      method: s.method,
      note: s.note,
      receiptPublicId: s.receiptPublicId,
      createdAt: s.createdAt,
    });
  }
  return {
    rows: sortLedger(rows),
    clients: clients.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** True when file storage (Cloudinary) is configured, so the receipt field may be shown. */
export function receiptsEnabled(): boolean {
  const e = env();
  return Boolean(e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET);
}
