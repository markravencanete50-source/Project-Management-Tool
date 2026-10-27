import "server-only";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { col } from "@/server/data/refs";
import { fromDoc, fromDocs } from "@/server/data/convert";
import type { Client, Project } from "@/lib/types";

export type ClientListItem = Client & { projectCount: number };

/** Admin: every client (archived included, the UI filters), with project counts. */
export async function listClients(): Promise<ClientListItem[]> {
  await requireAdmin();
  const [clientsSnap, projectsSnap] = await Promise.all([col.clients().get(), col.projects().get()]);
  const counts = new Map<string, number>();
  for (const p of fromDocs<Project>(projectsSnap)) {
    if (p.archivedAt) continue;
    counts.set(p.clientId, (counts.get(p.clientId) ?? 0) + 1);
  }
  return fromDocs<Client>(clientsSnap)
    .map((c) => ({ ...c, projectCount: counts.get(c.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClient(clientId: string): Promise<Client> {
  await requireAdmin();
  const snap = await col.clients().doc(clientId).get();
  if (!snap.exists) notFound();
  return fromDoc<Client>(snap);
}

export type ClientOption = Pick<Client, "id" | "name" | "company" | "defaultCurrency">;

/** Admin: non-archived clients for a select. */
export async function listClientOptions(): Promise<ClientOption[]> {
  await requireAdmin();
  const snap = await col.clients().get();
  return fromDocs<Client>(snap)
    .filter((c) => !c.archivedAt)
    .map(({ id, name, company, defaultCurrency }) => ({ id, name, company, defaultCurrency }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
