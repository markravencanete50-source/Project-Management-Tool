"use server";

import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { run, UserError } from "@/server/action";
import { col } from "@/server/data/refs";
import { logActivity } from "@/server/activity";
import { newProjectFields } from "@/lib/engagement";
import { endDateForStatus } from "@/lib/billing";
import { todayIso } from "@/lib/dates";
import {
  projectCreateSchema,
  projectStatusSchema,
  projectUpdateSchema,
  retainerUpdateSchema,
  tasksUpdateSchema,
  type ProjectCreateOutput,
} from "@/lib/validation/projects";
import { isFlatUnit, type ActionResult } from "@/lib/types";

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireAdmin();
    const data = projectCreateSchema.parse(input) as ProjectCreateOutput;
    const ref = col.projects().doc();
    await db().runTransaction(async (tx) => {
      const clientSnap = await tx.get(col.clients().doc(data.clientId));
      if (!clientSnap.exists) throw new UserError("Client not found");
      if (clientSnap.data()?.archivedAt) throw new UserError("That client is archived");
      // Fixed projects start as drafts. Retainers and task projects have no
      // agreement step: they start active and are accepted on their start date.
      tx.set(ref, {
        ...newProjectFields(data),
        archivedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      logActivity(tx, {
        type: "project.created",
        message: `${data.kind === "fixed" ? "Project" : data.kind === "retainer" ? "Retainer" : "Task project"} created: ${data.title}`,
        actor: "admin",
        visibility: "internal",
        projectId: ref.id,
        clientId: data.clientId,
      });
    });
    return { id: ref.id };
  });
}

export async function updateProject(projectId: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const ref = col.projects().doc(projectId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Project not found");
      // The editable fields depend on the engagement kind (missing kind is fixed).
      const kind = (snap.data()?.kind as string | undefined) ?? "fixed";
      const data =
        kind === "retainer"
          ? retainerUpdateSchema.parse(input)
          : kind === "tasks"
            ? tasksUpdateSchema.parse(input)
            : projectUpdateSchema.parse(input);
      const extra: Record<string, unknown> = {};
      if (kind === "retainer" && "endDate" in data && data.endDate !== undefined) {
        // An end date the owner typed or changed is theirs: it is never auto-cleared.
        const unchanged = (snap.data()?.endDate ?? null) === data.endDate;
        extra.endDateAuto = unchanged ? Boolean(snap.data()?.endDateAuto) : false;
      }
      tx.update(ref, { ...data, ...extra, updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "project.updated",
        message: `Project details updated: ${data.title}`,
        actor: "admin",
        visibility: "internal",
        projectId,
        clientId: String(snap.data()?.clientId ?? ""),
      });
    });
    return undefined;
  });
}

/** Manual status change. draft and agreement_sent are set by other flows only. */
export async function changeProjectStatus(projectId: string, status: unknown): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const next = projectStatusSchema.parse(status);
    const ref = col.projects().doc(projectId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Project not found");
      const current = snap.data();
      if (current?.status === next) return;
      // Flat (week/month) retainers stop billing when put on hold or completed.
      const endFields =
        current?.kind === "retainer" && isFlatUnit(current.rateUnit)
          ? endDateForStatus(next, { endDate: current.endDate ?? null, endDateAuto: Boolean(current.endDateAuto) }, todayIso())
          : null;
      tx.update(ref, { status: next, ...(endFields ?? {}), updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "project.status",
        message: `Status changed from ${String(current?.status)} to ${next}`,
        actor: "admin",
        visibility: "internal",
        projectId,
        clientId: String(current?.clientId ?? ""),
      });
    });
    return undefined;
  });
}

async function setArchived(projectId: string, archived: boolean) {
  await requireAdmin();
  const ref = col.projects().doc(projectId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new UserError("Project not found");
    const current = snap.data();
    if (Boolean(current?.archivedAt) === archived) return;
    tx.update(ref, {
      archivedAt: archived ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    logActivity(tx, {
      type: archived ? "project.archived" : "project.unarchived",
      message: archived ? "Project archived" : "Project restored from archive",
      actor: "admin",
      visibility: "internal",
      projectId,
      clientId: String(current?.clientId ?? ""),
    });
  });
}

export async function archiveProject(projectId: string): Promise<ActionResult> {
  return run(async () => {
    await setArchived(projectId, true);
    return undefined;
  });
}

export async function unarchiveProject(projectId: string): Promise<ActionResult> {
  return run(async () => {
    await setArchived(projectId, false);
    return undefined;
  });
}
