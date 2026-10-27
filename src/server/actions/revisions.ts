"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireClient } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { isInFolder } from "@/lib/cloudinary";
import { appUrl } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { todayIso } from "@/lib/dates";
import { isBillableRound, MAX_CLIENT_PENDING_REVISIONS, nextRevisionRound, REVISION_WAITING_ON_ADMIN } from "@/lib/projects";
import { sendChangeOrderAwaitingApproval, sendRevisionUpdate } from "@/lib/email";
import { getAccessibleProject } from "@/server/data/access";
import { col } from "@/server/data/refs";
import { fromDoc, fromDocs } from "@/server/data/convert";
import { logActivity } from "@/server/activity";
import { run, UserError } from "@/server/action";
import {
  decideChangeOrderSchema,
  requestRevisionSchema,
  setQuoteSchema,
  setRevisionStatusSchema,
} from "@/lib/validation/revisions";
import type { Client, Project, Revision, RevisionStatus } from "@/lib/types";

function refresh(projectId: string) {
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

/** Email the project's client, never failing the action if email breaks. */
async function emailClient(project: Pick<Project, "clientId">, send: (client: Client) => Promise<void>) {
  try {
    const snap = await col.clients().doc(project.clientId).get();
    if (!snap.exists) return;
    await send(fromDoc<Client>(snap));
  } catch (err) {
    console.error("[revisions] email failed", err);
  }
}

/**
 * Client requests a revision. The round, billable flag and status are decided
 * on the server inside one transaction so two quick requests cannot slip past
 * the allowance or the limit of pending requests.
 */
export async function requestRevision(projectId: string, notes: string, attachmentIds: string[]) {
  return run(async () => {
    const input = requestRevisionSchema.parse({ projectId, notes, attachmentIds });
    const session = await requireClient();
    const { project } = await getAccessibleProject(input.projectId);
    if (project.clientId !== session.clientId) throw new UserError("Not found");

    const attachments = [...new Set(input.attachmentIds)];
    for (const id of attachments) {
      if (!isInFolder(id, input.projectId, "revisions")) throw new UserError("One of the attachments is not valid");
    }

    const projectRef = col.projects().doc(input.projectId);
    const revisionsRef = col.revisions(input.projectId);
    const newRef = revisionsRef.doc();

    const result = await db().runTransaction(async (tx) => {
      const [projectSnap, revisionsSnap] = await Promise.all([tx.get(projectRef), tx.get(revisionsRef)]);
      const current = fromDoc<Project>(projectSnap);
      if (current.status !== "active" && current.status !== "on_hold") {
        throw new UserError("Revisions can be requested once the project is active");
      }
      const revisions = fromDocs<Revision>(revisionsSnap);
      const waiting = revisions.filter((r) => REVISION_WAITING_ON_ADMIN.includes(r.status)).length;
      if (waiting >= MAX_CLIENT_PENDING_REVISIONS) {
        throw new UserError(`You already have ${MAX_CLIENT_PENDING_REVISIONS} requests waiting. Please wait until work starts on one.`);
      }

      const round = nextRevisionRound(revisions);
      const billable = isBillableRound(round, current.revisionAllowance);
      const status: RevisionStatus = billable ? "awaiting_quote" : "requested";

      tx.set(newRef, {
        round,
        notes: input.notes,
        attachmentPublicIds: attachments,
        status,
        billable,
        price: null,
        changeOrderDecidedAt: null,
        requestedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      logActivity(tx, {
        type: "revision.requested",
        message: billable
          ? `Revision ${round} requested (beyond the included rounds, a quote will follow)`
          : `Revision ${round} requested`,
        actor: "client",
        visibility: "client",
        projectId: input.projectId,
        clientId: current.clientId,
      });
      return { round, billable };
    });

    refresh(input.projectId);
    return result;
  });
}

/** Admin quotes an extra (billable) revision: awaiting_quote to awaiting_approval. */
export async function setQuote(projectId: string, revisionId: string, price: string) {
  return run(async () => {
    const input = setQuoteSchema.parse({ projectId, revisionId, price });
    await requireAdmin();
    const { project } = await getAccessibleProject(input.projectId);

    const revisionRef = col.revisions(input.projectId).doc(input.revisionId);
    const round = await db().runTransaction(async (tx) => {
      const snap = await tx.get(revisionRef);
      if (!snap.exists) throw new UserError("Revision not found");
      const revision = fromDoc<Revision>(snap);
      if (revision.status !== "awaiting_quote") throw new UserError("This revision is not waiting for a quote");

      tx.update(revisionRef, { status: "awaiting_approval", price: input.price, updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "revision.quoted",
        message: `Quote for revision ${revision.round}: ${formatMoney(input.price, project.currency)}, awaiting your approval`,
        actor: "admin",
        visibility: "client",
        projectId: input.projectId,
        clientId: project.clientId,
      });
      return revision.round;
    });

    await emailClient(project, (client) =>
      sendChangeOrderAwaitingApproval({
        to: client.email,
        projectTitle: project.title,
        round,
        price: formatMoney(input.price, project.currency),
        url: appUrl(`/portal/projects/${project.id}`),
      }),
    );
    refresh(input.projectId);
  });
}

/**
 * Client decides a change order. Approve: the revision becomes "requested", a
 * change_order schedule line is added due today and the contract value goes up
 * by the price, all in one transaction. Decline: the revision is cancelled and
 * no longer counts toward the allowance.
 */
export async function decideChangeOrder(projectId: string, revisionId: string, approve: boolean) {
  return run(async () => {
    const input = decideChangeOrderSchema.parse({ projectId, revisionId, approve });
    const session = await requireClient();
    const { project } = await getAccessibleProject(input.projectId);
    if (project.clientId !== session.clientId) throw new UserError("Not found");

    const projectRef = col.projects().doc(input.projectId);
    const revisionRef = col.revisions(input.projectId).doc(input.revisionId);
    const scheduleRef = col.schedule(input.projectId);

    await db().runTransaction(async (tx) => {
      const [revisionSnap, scheduleSnap] = await Promise.all([tx.get(revisionRef), tx.get(scheduleRef)]);
      if (!revisionSnap.exists) throw new UserError("Revision not found");
      const revision = fromDoc<Revision>(revisionSnap);
      if (revision.status !== "awaiting_approval" || revision.price === null) {
        throw new UserError("This change order is not waiting for your decision");
      }

      if (input.approve) {
        const maxOrder = scheduleSnap.docs.reduce((max, d) => Math.max(max, Number(d.data().order ?? 0)), -1);
        tx.update(revisionRef, {
          status: "requested",
          changeOrderDecidedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(scheduleRef.doc(), {
          label: `Change order: revision ${revision.round}`,
          kind: "change_order",
          amountDue: revision.price,
          dueDate: todayIso(),
          order: maxOrder + 1,
        });
        tx.update(projectRef, { contractValue: FieldValue.increment(revision.price), updatedAt: FieldValue.serverTimestamp() });
        logActivity(tx, {
          type: "revision.change_order_approved",
          message: `Change order approved for revision ${revision.round}: ${formatMoney(revision.price, project.currency)} added to the contract`,
          actor: "client",
          visibility: "client",
          projectId: input.projectId,
          clientId: project.clientId,
        });
      } else {
        tx.update(revisionRef, {
          status: "cancelled",
          changeOrderDecidedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        logActivity(tx, {
          type: "revision.change_order_declined",
          message: `Change order declined for revision ${revision.round}`,
          actor: "client",
          visibility: "client",
          projectId: input.projectId,
          clientId: project.clientId,
        });
      }
    });

    refresh(input.projectId);
  });
}

/** Allowed moves per role. Admin can also cancel anything that is not approved or already cancelled. */
const ADMIN_MOVES: Partial<Record<RevisionStatus, RevisionStatus>> = {
  requested: "in_progress",
  in_progress: "delivered",
};

const STATUS_VERB: Record<string, string> = {
  in_progress: "is in progress",
  delivered: "has been delivered",
  approved: "was approved",
  cancelled: "was cancelled",
};

/**
 * Move a revision along: admin requested to in_progress to delivered, client
 * approves delivered work, admin can cancel anything not yet approved.
 */
export async function setRevisionStatus(projectId: string, revisionId: string, status: "in_progress" | "delivered" | "approved" | "cancelled") {
  return run(async () => {
    const input = setRevisionStatusSchema.parse({ projectId, revisionId, status });
    const { session, project } = await getAccessibleProject(input.projectId);
    if (session.role === "client" && project.clientId !== session.clientId) throw new UserError("Not found");

    const revisionRef = col.revisions(input.projectId).doc(input.revisionId);
    const round = await db().runTransaction(async (tx) => {
      const snap = await tx.get(revisionRef);
      if (!snap.exists) throw new UserError("Revision not found");
      const revision = fromDoc<Revision>(snap);

      let allowed: boolean;
      if (session.role === "admin") {
        allowed =
          input.status === "cancelled"
            ? revision.status !== "approved" && revision.status !== "cancelled"
            : input.status !== "approved" && ADMIN_MOVES[revision.status] === input.status;
      } else {
        allowed = input.status === "approved" && revision.status === "delivered";
      }
      if (!allowed) throw new UserError("That change is not allowed for this revision");

      tx.update(revisionRef, { status: input.status, updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: `revision.${input.status}`,
        message: `Revision ${revision.round} ${STATUS_VERB[input.status]}`,
        actor: session.role === "admin" ? "admin" : "client",
        visibility: "client",
        projectId: input.projectId,
        clientId: project.clientId,
      });
      return revision.round;
    });

    // The client already knows about changes they made themselves.
    if (session.role === "admin") {
      await emailClient(project, (client) =>
        sendRevisionUpdate({
          to: client.email,
          projectTitle: project.title,
          round,
          status: input.status,
          url: appUrl(`/portal/projects/${project.id}`),
        }),
      );
    }
    refresh(input.projectId);
  });
}
