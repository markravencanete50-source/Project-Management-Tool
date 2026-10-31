"use server";

import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { formatQuantity } from "@/lib/billing";
import { formatIsoDate } from "@/lib/dates";
import {
  addTimeEntrySchema,
  deleteTimeEntrySchema,
  updateTimeEntrySchema,
  type AddTimeEntryInput,
  type DeleteTimeEntryInput,
  type UpdateTimeEntryInput,
} from "@/lib/validation/billing";
import { run, UserError } from "@/server/action";
import { logActivity } from "@/server/activity";
import { projectFromDoc } from "@/server/data/convert";
import { col } from "@/server/data/refs";
import type { Project, RateUnit } from "@/lib/types";

// Time entries belong to retainers. Entry values are derived on read from the
// project's rate, so editing the rate re-prices all of them. The activity
// entries are internal: the client sees the monthly summary, not each entry.

function retainerUnit(project: Project): RateUnit {
  if (project.kind !== "retainer" || !project.rateUnit) throw new UserError("Time can only be logged on a retainer");
  return project.rateUnit;
}

export async function addTimeEntry(raw: AddTimeEntryInput) {
  return run(async () => {
    await requireAdmin();
    const input = addTimeEntrySchema.parse(raw);
    const projectRef = col.projects().doc(input.projectId);
    const entryRef = col.timeEntries(input.projectId).doc();
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(projectRef);
      if (!snap.exists) throw new UserError("Project not found");
      const project = projectFromDoc(snap);
      const unit = retainerUnit(project);
      tx.set(entryRef, {
        date: input.date,
        quantityHundredths: input.quantity,
        note: input.note,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(projectRef, { updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "time.logged",
        message: `Time logged: ${formatQuantity(input.quantity, unit)} on ${formatIsoDate(input.date)}`,
        actor: "admin",
        visibility: "internal",
        projectId: project.id,
        clientId: project.clientId,
      });
    });
    return { id: entryRef.id };
  });
}

export async function updateTimeEntry(raw: UpdateTimeEntryInput) {
  return run(async () => {
    await requireAdmin();
    const input = updateTimeEntrySchema.parse(raw);
    const projectRef = col.projects().doc(input.projectId);
    const entryRef = col.timeEntries(input.projectId).doc(input.entryId);
    await db().runTransaction(async (tx) => {
      const [projectSnap, entrySnap] = await Promise.all([tx.get(projectRef), tx.get(entryRef)]);
      if (!projectSnap.exists || !entrySnap.exists) throw new UserError("Time entry not found");
      const project = projectFromDoc(projectSnap);
      const unit = retainerUnit(project);
      tx.update(entryRef, {
        date: input.date,
        quantityHundredths: input.quantity,
        note: input.note,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(projectRef, { updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "time.updated",
        message: `Time entry updated: ${formatQuantity(input.quantity, unit)} on ${formatIsoDate(input.date)}`,
        actor: "admin",
        visibility: "internal",
        projectId: project.id,
        clientId: project.clientId,
      });
    });
  });
}

export async function deleteTimeEntry(raw: DeleteTimeEntryInput) {
  return run(async () => {
    await requireAdmin();
    const input = deleteTimeEntrySchema.parse(raw);
    const projectRef = col.projects().doc(input.projectId);
    const entryRef = col.timeEntries(input.projectId).doc(input.entryId);
    await db().runTransaction(async (tx) => {
      const [projectSnap, entrySnap] = await Promise.all([tx.get(projectRef), tx.get(entryRef)]);
      if (!projectSnap.exists || !entrySnap.exists) throw new UserError("Time entry not found");
      const project = projectFromDoc(projectSnap);
      const unit = retainerUnit(project);
      const entry = entrySnap.data() as { date: string; quantityHundredths: number };
      tx.delete(entryRef);
      tx.update(projectRef, { updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "time.deleted",
        message: `Time entry removed: ${formatQuantity(entry.quantityHundredths, unit)} on ${formatIsoDate(entry.date)}`,
        actor: "admin",
        visibility: "internal",
        projectId: project.id,
        clientId: project.clientId,
      });
    });
  });
}
