"use server";

import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { deleteAsset, isExpenseReceipt } from "@/lib/cloudinary";
import { formatMoney, type Currency } from "@/lib/money";
import {
  addExpenseSchema,
  deleteExpenseSchema,
  updateExpenseSchema,
  type AddExpenseInput,
  type DeleteExpenseInput,
  type UpdateExpenseInput,
} from "@/lib/validation/expenses";
import { run, UserError } from "@/server/action";
import { logActivity } from "@/server/activity";
import { col } from "@/server/data/refs";
import { receiptsEnabled } from "@/server/data/standalone-payments";
import type { ActionResult, Client, Project } from "@/lib/types";

function checkReceipt(receiptPublicId: string | null) {
  if (receiptPublicId && !isExpenseReceipt(receiptPublicId)) throw new UserError("That receipt file is not valid");
}

/** Best effort: remove an orphaned receipt file. Never fails the action. */
async function discardReceipt(storedId: string | null | undefined) {
  if (!storedId) return;
  try {
    await deleteAsset(storedId);
  } catch (err) {
    console.error("Could not delete receipt asset", err);
  }
}

/**
 * Check the optional links. A project must exist, and when a client is chosen too it must
 * belong to that client. A project with no client picks up the project's client.
 */
async function resolveLinks(clientId: string | null, projectId: string | null): Promise<{ clientId: string | null; projectId: string | null }> {
  let resolvedClient = clientId;
  if (clientId) {
    const snap = await col.clients().doc(clientId).get();
    if (!snap.exists) throw new UserError("Client not found");
  }
  if (projectId) {
    const snap = await col.projects().doc(projectId).get();
    if (!snap.exists) throw new UserError("Project not found");
    const owner = (snap.data() as Pick<Project, "clientId">).clientId;
    if (clientId && owner !== clientId) throw new UserError("That project belongs to a different client");
    resolvedClient = clientId ?? owner ?? null;
  }
  return { clientId: resolvedClient, projectId };
}

function refresh(...clientIds: (string | null | undefined)[]) {
  revalidatePath("/admin");
  revalidatePath("/admin/expenses");
  for (const id of new Set(clientIds)) if (id) revalidatePath(`/admin/clients/${id}`);
}

function body(input: ReturnType<typeof addExpenseSchema.parse>, links: { clientId: string | null; projectId: string | null }) {
  return {
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    spentOn: input.spentOn,
    category: input.category,
    method: input.method,
    vendor: input.vendor,
    note: input.note,
    clientId: links.clientId,
    projectId: links.projectId,
    recurring: input.recurring,
    // The stop date only means something for a repeating expense.
    recurringUntil: input.recurring === "none" ? null : input.recurringUntil,
    receiptPublicId: input.receiptPublicId,
  };
}

const summary = (input: { amount: number; currency: Currency; description: string }) =>
  `${formatMoney(input.amount, input.currency)} on ${input.description}`;

/** Record money spent. Counts against available money and never touches earnings or balances. */
export async function addExpense(raw: AddExpenseInput) {
  return run(async () => {
    await requireAdmin();
    const input = addExpenseSchema.parse(raw);
    checkReceipt(input.receiptPublicId);
    const links = await resolveLinks(input.clientId, input.projectId);
    const ref = col.expenses().doc();
    const batch = db().batch();
    batch.set(ref, { ...body(input, links), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    logActivity(batch, {
      type: "expense.recorded",
      message: `Expense recorded: ${summary(input)}`,
      actor: "admin",
      visibility: "internal",
      clientId: links.clientId,
      projectId: links.projectId,
    });
    await batch.commit();
    refresh(links.clientId);
    return { id: ref.id };
  });
}

export async function updateExpense(raw: UpdateExpenseInput) {
  return run(async () => {
    await requireAdmin();
    const input = updateExpenseSchema.parse(raw);
    checkReceipt(input.receiptPublicId);
    const links = await resolveLinks(input.clientId, input.projectId);
    const ref = col.expenses().doc(input.id);
    const outcome = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Expense not found");
      const before = snap.data() as { receiptPublicId?: string | null; clientId?: string | null };
      tx.update(ref, { ...body(input, links), updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "expense.updated",
        message: `Expense updated: ${summary(input)}`,
        actor: "admin",
        visibility: "internal",
        clientId: links.clientId,
        projectId: links.projectId,
      });
      return { previousReceipt: before.receiptPublicId ?? null, previousClient: before.clientId ?? null };
    });
    if (outcome.previousReceipt && outcome.previousReceipt !== input.receiptPublicId) await discardReceipt(outcome.previousReceipt);
    refresh(links.clientId, outcome.previousClient);
  });
}

export async function deleteExpense(raw: DeleteExpenseInput) {
  return run(async () => {
    await requireAdmin();
    const { id } = deleteExpenseSchema.parse(raw);
    const ref = col.expenses().doc(id);
    const outcome = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Expense not found");
      const data = snap.data() as {
        amount?: number;
        currency?: Currency;
        description?: string;
        receiptPublicId?: string | null;
        clientId?: string | null;
        projectId?: string | null;
      };
      tx.delete(ref);
      logActivity(tx, {
        type: "expense.deleted",
        message: `Expense removed: ${summary({ amount: data.amount ?? 0, currency: data.currency ?? "PHP", description: data.description ?? "expense" })}`,
        actor: "admin",
        visibility: "internal",
        clientId: data.clientId ?? null,
        projectId: data.projectId ?? null,
      });
      return { receipt: data.receiptPublicId ?? null, clientId: data.clientId ?? null };
    });
    await discardReceipt(outcome.receipt);
    refresh(outcome.clientId);
  });
}

export type ExpenseOptions = {
  clients: { id: string; name: string; company: string }[];
  projects: { id: string; title: string; clientId: string }[];
  receipts: boolean;
};

/** Everything the Add expense dialog needs, loaded when it opens. */
export async function getExpenseOptions(): Promise<ActionResult<ExpenseOptions>> {
  return run(async () => {
    await requireAdmin();
    const [clientsSnap, projectsSnap] = await Promise.all([col.clients().get(), col.projects().get()]);
    const clients = clientsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Pick<Client, "name" | "company" | "archivedAt">) }))
      .filter((c) => !c.archivedAt)
      .map((c) => ({ id: c.id, name: c.name, company: c.company ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const projects = projectsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Pick<Project, "title" | "clientId" | "archivedAt">) }))
      .filter((p) => !p.archivedAt)
      .map((p) => ({ id: p.id, title: p.title, clientId: p.clientId }))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { clients, projects, receipts: receiptsEnabled() };
  });
}
