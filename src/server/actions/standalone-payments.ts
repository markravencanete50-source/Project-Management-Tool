"use server";

import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { deleteAsset, isStandaloneReceipt } from "@/lib/cloudinary";
import { formatMoney } from "@/lib/money";
import {
  addStandaloneSchema,
  deleteStandaloneSchema,
  updateStandaloneSchema,
  type AddStandaloneInput,
  type DeleteStandaloneInput,
  type UpdateStandaloneInput,
} from "@/lib/validation/standalone-payments";
import { run, UserError } from "@/server/action";
import { logActivity } from "@/server/activity";
import { col } from "@/server/data/refs";
import { receiptsEnabled } from "@/server/data/standalone-payments";
import type { ActionResult, Client, Project } from "@/lib/types";

function checkReceipt(receiptPublicId: string | null) {
  if (receiptPublicId && !isStandaloneReceipt(receiptPublicId)) throw new UserError("That receipt file is not valid");
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

async function clientNameOf(clientId: string | null): Promise<string | null> {
  if (!clientId) return null;
  const snap = await col.clients().doc(clientId).get();
  if (!snap.exists) throw new UserError("Client not found");
  return String((snap.data() as Pick<Client, "name">).name ?? "");
}

function refresh(clientId: string | null) {
  revalidatePath("/admin");
  revalidatePath("/admin/payments");
  if (clientId) revalidatePath(`/admin/clients/${clientId}`);
}

/** Record a payment that belongs to no project. Counts as earnings only. */
export async function addStandalonePayment(raw: AddStandaloneInput) {
  return run(async () => {
    await requireAdmin();
    const input = addStandaloneSchema.parse(raw);
    checkReceipt(input.receiptPublicId);
    const name = await clientNameOf(input.clientId);
    const ref = col.standalonePayments().doc();
    const batch = db().batch();
    batch.set(ref, {
      clientId: input.clientId,
      payerName: input.payerName,
      note: input.note,
      currency: input.currency,
      amount: input.amount,
      paidOn: input.paidOn,
      method: input.method,
      receiptPublicId: input.receiptPublicId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    logActivity(batch, {
      type: "standalone_payment.recorded",
      message: `Payment recorded (no project): ${formatMoney(input.amount, input.currency)} from ${name ?? input.payerName}`,
      actor: "admin",
      visibility: "internal",
      clientId: input.clientId,
    });
    await batch.commit();
    refresh(input.clientId);
    return { id: ref.id };
  });
}

export async function updateStandalonePayment(raw: UpdateStandaloneInput) {
  return run(async () => {
    await requireAdmin();
    const input = updateStandaloneSchema.parse(raw);
    checkReceipt(input.receiptPublicId);
    const name = await clientNameOf(input.clientId);
    const ref = col.standalonePayments().doc(input.id);
    const outcome = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Payment not found");
      const before = snap.data() as { receiptPublicId?: string | null; clientId?: string | null };
      tx.update(ref, {
        clientId: input.clientId,
        payerName: input.payerName,
        note: input.note,
        currency: input.currency,
        amount: input.amount,
        paidOn: input.paidOn,
        method: input.method,
        receiptPublicId: input.receiptPublicId,
        updatedAt: FieldValue.serverTimestamp(),
      });
      logActivity(tx, {
        type: "standalone_payment.updated",
        message: `Payment (no project) updated: ${formatMoney(input.amount, input.currency)} from ${name ?? input.payerName}`,
        actor: "admin",
        visibility: "internal",
        clientId: input.clientId,
      });
      return { previousReceipt: before.receiptPublicId ?? null, previousClient: before.clientId ?? null };
    });
    if (outcome.previousReceipt && outcome.previousReceipt !== input.receiptPublicId) await discardReceipt(outcome.previousReceipt);
    refresh(input.clientId);
    if (outcome.previousClient && outcome.previousClient !== input.clientId) refresh(outcome.previousClient);
  });
}

export async function deleteStandalonePayment(raw: DeleteStandaloneInput) {
  return run(async () => {
    await requireAdmin();
    const { id } = deleteStandaloneSchema.parse(raw);
    const ref = col.standalonePayments().doc(id);
    const outcome = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Payment not found");
      const data = snap.data() as { amount?: number; currency?: "GBP" | "USD" | "PHP"; receiptPublicId?: string | null; clientId?: string | null };
      tx.delete(ref);
      logActivity(tx, {
        type: "standalone_payment.deleted",
        message: `Payment (no project) removed: ${formatMoney(data.amount ?? 0, data.currency ?? "PHP")}`,
        actor: "admin",
        visibility: "internal",
        clientId: data.clientId ?? null,
      });
      return { receipt: data.receiptPublicId ?? null, clientId: data.clientId ?? null };
    });
    await discardReceipt(outcome.receipt);
    refresh(outcome.clientId);
  });
}

export type RecordPaymentOptions = {
  clients: { id: string; name: string; company: string; defaultCurrency: "GBP" | "USD" | "PHP" }[];
  projects: { id: string; title: string; clientId: string; currency: "GBP" | "USD" | "PHP" }[];
  receipts: boolean;
};

/** Everything the Record payment dialog needs, loaded when it opens. */
export async function getRecordPaymentOptions(): Promise<ActionResult<RecordPaymentOptions>> {
  return run(async () => {
    await requireAdmin();
    const [clientsSnap, projectsSnap] = await Promise.all([col.clients().get(), col.projects().get()]);
    const clients = clientsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Pick<Client, "name" | "company" | "defaultCurrency" | "archivedAt">) }))
      .filter((c) => !c.archivedAt)
      .map((c) => ({ id: c.id, name: c.name, company: c.company ?? "", defaultCurrency: c.defaultCurrency ?? "PHP" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const projects = projectsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Pick<Project, "title" | "clientId" | "currency" | "status" | "archivedAt">) }))
      .filter((p) => !p.archivedAt && p.status !== "cancelled")
      .map((p) => ({ id: p.id, title: p.title, clientId: p.clientId, currency: p.currency }))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { clients, projects, receipts: receiptsEnabled() };
  });
}
