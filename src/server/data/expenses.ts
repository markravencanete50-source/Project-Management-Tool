import "server-only";
import { requireAdmin } from "@/lib/auth/session";
import { todayIso } from "@/lib/dates";
import { expenseLines, normalizeExpense, type ExpenseLine } from "@/lib/expenses";
import { col } from "@/server/data/refs";
import { fromDocs, projectsFromDocs } from "@/server/data/convert";
import type { Client, Expense } from "@/lib/types";

/** Raw docs to normalised expenses. Timestamps are already Dates after fromDocs. */
export function expensesFromSnap(snap: FirebaseFirestore.QuerySnapshot): Expense[] {
  return fromDocs<Record<string, unknown> & { id: string; createdAt: Date; updatedAt: Date }>(snap).map((d) =>
    normalizeExpense(d.id, d, d.createdAt instanceof Date ? d.createdAt : new Date(0), d.updatedAt instanceof Date ? d.updatedAt : new Date(0)),
  );
}

export type ExpenseLedger = {
  /** Stored expenses plus the repeats derived from recurring ones, newest first. */
  lines: ExpenseLine[];
  clients: { id: string; name: string }[];
  projects: { id: string; title: string }[];
};

/** Admin: every expense line (repeats included), with the client and project names for display. */
export async function getExpenseLedger(): Promise<ExpenseLedger> {
  await requireAdmin();
  const [expensesSnap, clientsSnap, projectsSnap] = await Promise.all([col.expenses().get(), col.clients().get(), col.projects().get()]);
  const clients = fromDocs<Client>(clientsSnap)
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const projects = projectsFromDocs(projectsSnap).map((p) => ({ id: p.id, title: p.title }));
  return { lines: expenseLines(expensesFromSnap(expensesSnap), todayIso()), clients, projects };
}

/** Admin: the expense lines linked to one client, newest first. */
export async function listExpenseLinesForClient(clientId: string): Promise<ExpenseLine[]> {
  await requireAdmin();
  const snap = await col.expenses().where("clientId", "==", clientId).get();
  return expenseLines(expensesFromSnap(snap), todayIso());
}
