"use server";

import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { appUrl } from "@/lib/env";
import { deleteAsset, isInFolder } from "@/lib/cloudinary";
import { formatIsoDate } from "@/lib/dates";
import { depositCovered, sumPayments } from "@/lib/finance";
import { sendPaymentRecorded } from "@/lib/email";
import { formatMoney } from "@/lib/money";
import {
  addPaymentSchema,
  deletePaymentSchema,
  saveScheduleSchema,
  updatePaymentSchema,
  type AddPaymentInput,
  type DeletePaymentInput,
  type SaveScheduleInput,
  type UpdatePaymentInput,
} from "@/lib/validation/payments";
import { run, UserError } from "@/server/action";
import { logActivity } from "@/server/activity";
import { markAccepted } from "@/server/accepted";
import { fromDoc, fromDocs } from "@/server/data/convert";
import { col } from "@/server/data/refs";
import { getSettings } from "@/server/data/settings";
import type { Client, Payment, Project, ScheduleLine } from "@/lib/types";

function checkReceipt(receiptPublicId: string | null, projectId: string) {
  if (receiptPublicId && !isInFolder(receiptPublicId, projectId, "receipts")) {
    throw new UserError("That receipt file is not valid for this project");
  }
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

export async function addPayment(raw: AddPaymentInput) {
  return run(async () => {
    await requireAdmin();
    const input = addPaymentSchema.parse(raw);
    checkReceipt(input.receiptPublicId, input.projectId);

    const settings = await getSettings();
    const projectRef = col.projects().doc(input.projectId);
    const paymentRef = col.payments(input.projectId).doc();

    const outcome = await db().runTransaction(async (tx) => {
      const [projectSnap, scheduleSnap, paymentsSnap] = await Promise.all([
        tx.get(projectRef),
        tx.get(col.schedule(input.projectId)),
        tx.get(col.payments(input.projectId)),
      ]);
      if (!projectSnap.exists) throw new UserError("Project not found");
      const project = fromDoc<Project>(projectSnap);
      const schedule = fromDocs<ScheduleLine>(scheduleSnap);
      const existing = fromDocs<Payment>(paymentsSnap);

      tx.set(paymentRef, {
        amount: input.amount,
        paidOn: input.paidOn,
        method: input.method,
        receiptPublicId: input.receiptPublicId,
        note: input.note,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const all = [...existing, { amount: input.amount }];
      let accepted = false;
      if (settings.acceptedRule === "deposit_paid" && depositCovered(schedule, all)) {
        accepted = markAccepted(tx, projectRef, project, "deposit_paid", "admin");
      }

      logActivity(tx, {
        type: "payment.recorded",
        message: `Payment recorded: ${formatMoney(input.amount, project.currency)}`,
        actor: "admin",
        visibility: "client",
        projectId: project.id,
        clientId: project.clientId,
      });

      return { project, accepted, pending: project.contractValue - sumPayments(all) };
    });

    // Email after commit. A failure here must never fail the recorded payment.
    try {
      const { project, accepted, pending } = outcome;
      const visibleToClient = project.status !== "draft" || accepted;
      const clientSnap = await col.clients().doc(project.clientId).get();
      if (clientSnap.exists && visibleToClient) {
        const client = fromDoc<Client>(clientSnap);
        if (client.email) {
          await sendPaymentRecorded({
            to: client.email,
            clientName: client.name,
            projectTitle: project.title,
            amount: formatMoney(input.amount, project.currency),
            paidOn: formatIsoDate(input.paidOn),
            pending: formatMoney(Math.max(0, pending), project.currency),
            url: appUrl(`/portal/projects/${project.id}`),
          });
        }
      }
    } catch (err) {
      console.error("Payment recorded email failed", err);
    }

    return { id: paymentRef.id };
  });
}

export async function updatePayment(raw: UpdatePaymentInput) {
  return run(async () => {
    await requireAdmin();
    const input = updatePaymentSchema.parse(raw);
    checkReceipt(input.receiptPublicId, input.projectId);

    const projectRef = col.projects().doc(input.projectId);
    const paymentRef = col.payments(input.projectId).doc(input.paymentId);

    const previousReceipt = await db().runTransaction(async (tx) => {
      const [projectSnap, paymentSnap] = await Promise.all([tx.get(projectRef), tx.get(paymentRef)]);
      if (!projectSnap.exists || !paymentSnap.exists) throw new UserError("Payment not found");
      const project = fromDoc<Project>(projectSnap);
      const before = fromDoc<Payment>(paymentSnap);

      // acceptedAt is deliberately never touched here.
      tx.update(paymentRef, {
        amount: input.amount,
        paidOn: input.paidOn,
        method: input.method,
        receiptPublicId: input.receiptPublicId,
        note: input.note,
        updatedAt: FieldValue.serverTimestamp(),
      });
      logActivity(tx, {
        type: "payment.updated",
        message: `Payment updated: ${formatMoney(input.amount, project.currency)}`,
        actor: "admin",
        visibility: "client",
        projectId: project.id,
        clientId: project.clientId,
      });
      return before.receiptPublicId;
    });

    if (previousReceipt && previousReceipt !== input.receiptPublicId) await discardReceipt(previousReceipt);
  });
}

export async function deletePayment(raw: DeletePaymentInput) {
  return run(async () => {
    await requireAdmin();
    const input = deletePaymentSchema.parse(raw);
    const projectRef = col.projects().doc(input.projectId);
    const paymentRef = col.payments(input.projectId).doc(input.paymentId);

    const receipt = await db().runTransaction(async (tx) => {
      const [projectSnap, paymentSnap] = await Promise.all([tx.get(projectRef), tx.get(paymentRef)]);
      if (!projectSnap.exists || !paymentSnap.exists) throw new UserError("Payment not found");
      const project = fromDoc<Project>(projectSnap);
      const payment = fromDoc<Payment>(paymentSnap);

      // acceptedAt is deliberately never cleared by deleting a payment.
      tx.delete(paymentRef);
      logActivity(tx, {
        type: "payment.deleted",
        message: `Payment removed: ${formatMoney(payment.amount, project.currency)}`,
        actor: "admin",
        visibility: "client",
        projectId: project.id,
        clientId: project.clientId,
      });
      return payment.receiptPublicId;
    });

    await discardReceipt(receipt);
  });
}

/** Replace the whole schedule and the contract value in one transaction. */
export async function saveSchedule(raw: SaveScheduleInput) {
  return run(async () => {
    await requireAdmin();
    const input = saveScheduleSchema.parse(raw);
    const projectRef = col.projects().doc(input.projectId);
    const scheduleCol = col.schedule(input.projectId);

    await db().runTransaction(async (tx) => {
      const [projectSnap, scheduleSnap] = await Promise.all([tx.get(projectRef), tx.get(scheduleCol)]);
      if (!projectSnap.exists) throw new UserError("Project not found");
      const project = fromDoc<Project>(projectSnap);
      const existingIds = new Set(scheduleSnap.docs.map((d) => d.id));
      const keptIds = new Set<string>();

      input.lines.forEach((line, index) => {
        const reuse = line.id && existingIds.has(line.id) ? line.id : null;
        const ref = reuse ? scheduleCol.doc(reuse) : scheduleCol.doc();
        keptIds.add(ref.id);
        tx.set(ref, {
          label: line.label,
          kind: line.kind,
          amountDue: line.amount,
          dueDate: line.dueDate,
          order: index,
        });
      });
      for (const id of existingIds) {
        if (!keptIds.has(id)) tx.delete(scheduleCol.doc(id));
      }

      tx.update(projectRef, { contractValue: input.contractValue, updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "schedule.updated",
        message: "Payment schedule updated",
        actor: "admin",
        visibility: "client",
        projectId: project.id,
        clientId: project.clientId,
      });
    });
  });
}
