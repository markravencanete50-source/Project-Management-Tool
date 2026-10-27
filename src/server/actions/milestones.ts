"use server";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { run, UserError } from "@/server/action";
import { col } from "@/server/data/refs";
import { logActivity } from "@/server/activity";
import { weightsValid } from "@/lib/projects";
import { milestonesSchema } from "@/lib/validation/projects";
import type { ActionResult } from "@/lib/types";

/**
 * Replace the whole milestone list in one save: edits titles and weights,
 * reorders, adds new ones, removes missing ones. Done state of kept milestones
 * is preserved. Weights must sum to exactly 100.
 */
export async function saveMilestones(projectId: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const items = milestonesSchema.parse(input);
    if (!weightsValid(items.map((i) => i.weight))) {
      throw new UserError("Milestone weights must add up to exactly 100");
    }
    const projectRef = col.projects().doc(projectId);
    await db().runTransaction(async (tx) => {
      const [projectSnap, existing] = await Promise.all([tx.get(projectRef), tx.get(col.milestones(projectId))]);
      if (!projectSnap.exists) throw new UserError("Project not found");
      const existingIds = new Set(existing.docs.map((d) => d.id));
      const keptIds = new Set<string>();
      items.forEach((item, index) => {
        if (item.id && existingIds.has(item.id)) {
          keptIds.add(item.id);
          tx.update(col.milestones(projectId).doc(item.id), { title: item.title, weight: item.weight, order: index });
        } else {
          tx.set(col.milestones(projectId).doc(), {
            title: item.title,
            weight: item.weight,
            order: index,
            done: false,
            doneAt: null,
          });
        }
      });
      for (const doc of existing.docs) {
        if (!keptIds.has(doc.id)) tx.delete(doc.ref);
      }
      tx.update(projectRef, { updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "milestones.updated",
        message: `Milestones updated (${items.length} total)`,
        actor: "admin",
        visibility: "internal",
        projectId,
        clientId: String(projectSnap.data()?.clientId ?? ""),
      });
    });
    return undefined;
  });
}

/** Mark one milestone done or not done. Progress is computed on read, never stored. */
export async function toggleMilestone(projectId: string, milestoneId: string, done: boolean): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    if (typeof done !== "boolean") throw new UserError("Invalid request");
    const projectRef = col.projects().doc(projectId);
    const ref = col.milestones(projectId).doc(milestoneId);
    await db().runTransaction(async (tx) => {
      const [projectSnap, snap] = await Promise.all([tx.get(projectRef), tx.get(ref)]);
      if (!projectSnap.exists || !snap.exists) throw new UserError("Milestone not found");
      const current = snap.data();
      if (Boolean(current?.done) === done) return;
      tx.update(ref, { done, doneAt: done ? Timestamp.now() : null });
      tx.update(projectRef, { updatedAt: FieldValue.serverTimestamp() });
      const title = String(current?.title ?? "");
      logActivity(tx, {
        type: done ? "milestone.completed" : "milestone.reopened",
        message: done ? `Milestone completed: ${title}` : `Milestone reopened: ${title}`,
        actor: "admin",
        visibility: "client",
        projectId,
        clientId: String(projectSnap.data()?.clientId ?? ""),
      });
    });
    return undefined;
  });
}
