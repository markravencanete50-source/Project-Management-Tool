"use server";

import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { run, UserError } from "@/server/action";
import { col } from "@/server/data/refs";
import { logActivity } from "@/server/activity";
import { clientSchema } from "@/lib/validation/clients";
import type { ActionResult } from "@/lib/types";

/** Throws if another non-archived client already uses this email. */
async function assertEmailFree(tx: Transaction, email: string, exceptId?: string) {
  const snap = await tx.get(col.clients().where("email", "==", email));
  const clash = snap.docs.some((d) => d.id !== exceptId && !d.data().archivedAt);
  if (clash) throw new UserError("Another active client already uses this email address");
}

export async function createClient(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireAdmin();
    const data = clientSchema.parse(input);
    const ref = col.clients().doc();
    await db().runTransaction(async (tx) => {
      await assertEmailFree(tx, data.email);
      tx.set(ref, {
        ...data,
        authUid: null,
        archivedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      logActivity(tx, {
        type: "client.created",
        message: `Client created: ${data.name}`,
        actor: "admin",
        visibility: "internal",
        clientId: ref.id,
      });
    });
    return { id: ref.id };
  });
}

export async function updateClient(clientId: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const data = clientSchema.parse(input);
    const ref = col.clients().doc(clientId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Client not found");
      if (!snap.data()?.archivedAt) await assertEmailFree(tx, data.email, clientId);
      tx.update(ref, { ...data, updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "client.updated",
        message: `Client updated: ${data.name}`,
        actor: "admin",
        visibility: "internal",
        clientId,
      });
    });
    return undefined;
  });
}

export async function archiveClient(clientId: string): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const ref = col.clients().doc(clientId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Client not found");
      if (snap.data()?.archivedAt) return;
      tx.update(ref, { archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "client.archived",
        message: `Client archived: ${String(snap.data()?.name ?? "")}`,
        actor: "admin",
        visibility: "internal",
        clientId,
      });
    });
    return undefined;
  });
}

export async function unarchiveClient(clientId: string): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const ref = col.clients().doc(clientId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Client not found");
      const current = snap.data();
      if (!current?.archivedAt) return;
      await assertEmailFree(tx, String(current.email), clientId);
      tx.update(ref, { archivedAt: null, updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "client.unarchived",
        message: `Client restored: ${String(current.name ?? "")}`,
        actor: "admin",
        visibility: "internal",
        clientId,
      });
    });
    return undefined;
  });
}
