"use server";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { col } from "@/server/data/refs";
import { fromDoc, fromDocs } from "@/server/data/convert";
import { getSettings } from "@/server/data/settings";
import { logActivity } from "@/server/activity";
import { run, UserError } from "@/server/action";
import {
  moveStageSchema,
  prospectIdSchema,
  prospectInputSchema,
  type ProspectFormValues,
} from "@/lib/validation/prospects";
import type { ActionResult, Client, LostReason, Prospect, ProspectStage } from "@/lib/types";

const CLOSED: ProspectStage[] = ["won", "lost"];

export async function createProspect(input: ProspectFormValues): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireAdmin();
    const data = prospectInputSchema.parse(input);
    const ref = col.prospects().doc();
    await db().runTransaction(async (tx) => {
      tx.set(ref, {
        ...data,
        stage: "new",
        lostReason: null,
        convertedClientId: null,
        convertedProjectId: null,
        archivedAt: null,
        closedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      logActivity(tx, {
        type: "prospect_created",
        message: `Prospect added: ${data.name}`,
        actor: "admin",
        visibility: "internal",
        prospectId: ref.id,
      });
    });
    return { id: ref.id };
  });
}

export async function updateProspect(id: string, input: ProspectFormValues): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const prospectId = prospectIdSchema.parse(id);
    const data = prospectInputSchema.parse(input);
    const ref = col.prospects().doc(prospectId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Prospect not found");
      tx.update(ref, { ...data, updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "prospect_updated",
        message: `Prospect details updated: ${data.name}`,
        actor: "admin",
        visibility: "internal",
        prospectId,
      });
    });
    return undefined;
  });
}

export async function setProspectArchived(id: string, archived: boolean): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const prospectId = prospectIdSchema.parse(id);
    const ref = col.prospects().doc(prospectId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Prospect not found");
      tx.update(ref, {
        archivedAt: archived ? FieldValue.serverTimestamp() : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      logActivity(tx, {
        type: archived ? "prospect_archived" : "prospect_unarchived",
        message: `${archived ? "Archived" : "Restored"} prospect: ${snap.data()?.name ?? ""}`,
        actor: "admin",
        visibility: "internal",
        prospectId,
      });
    });
    return undefined;
  });
}

export async function moveStage(id: string, stage: ProspectStage, lostReason?: LostReason | null): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const parsed = moveStageSchema.parse({ id, stage, lostReason });
    const ref = col.prospects().doc(parsed.id);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("Prospect not found");
      const current = snap.data() as Pick<Prospect, "stage" | "name" | "lostReason">;
      if (current.stage === parsed.stage && (parsed.stage !== "lost" || current.lostReason === parsed.lostReason)) return;
      const update: Record<string, unknown> = { stage: parsed.stage, updatedAt: FieldValue.serverTimestamp() };
      if (CLOSED.includes(parsed.stage)) {
        // Won or lost: stamp the close time (a won/lost switch counts as a new close).
        update.closedAt = FieldValue.serverTimestamp();
        update.lostReason = parsed.stage === "lost" ? parsed.lostReason : null;
      } else {
        update.closedAt = null;
        update.lostReason = null;
      }
      tx.update(ref, update);
      logActivity(tx, {
        type: "prospect_stage_changed",
        message: `${current.name}: ${current.stage} to ${parsed.stage}${
          parsed.stage === "lost" ? ` (${parsed.lostReason})` : ""
        }`,
        actor: "admin",
        visibility: "internal",
        prospectId: parsed.id,
      });
    });
    return undefined;
  });
}

/** Turn a prospect into a client (existing or new) plus a draft project. Returns the project id. */
export async function convertProspect(id: string): Promise<ActionResult<{ projectId: string }>> {
  return run(async () => {
    await requireAdmin();
    const prospectId = prospectIdSchema.parse(id);
    const prospectRef = col.prospects().doc(prospectId);

    const first = await prospectRef.get();
    if (!first.exists) throw new UserError("Prospect not found");
    const email = String(first.data()?.email ?? "").trim().toLowerCase();
    if (!email) throw new UserError("Add an email address to this prospect before converting it");

    const settings = await getSettings();
    // Match before the transaction; the transaction re-reads the match.
    const existing = fromDocs<Client>(await col.clients().where("email", "==", email).get()).find((c) => !c.archivedAt);
    const newClientRef = col.clients().doc();
    const projectRef = col.projects().doc();

    const projectId = await db().runTransaction(async (tx) => {
      const pSnap = await tx.get(prospectRef);
      if (!pSnap.exists) throw new UserError("Prospect not found");
      const prospect = fromDoc<Prospect>(pSnap);
      if (prospect.convertedProjectId || prospect.convertedClientId) {
        throw new UserError("This prospect has already been converted");
      }
      if (prospect.archivedAt) throw new UserError("Restore this prospect before converting it");

      let clientId: string | null = null;
      if (existing) {
        const cSnap = await tx.get(col.clients().doc(existing.id));
        if (cSnap.exists && !cSnap.data()?.archivedAt && cSnap.data()?.email === email) clientId = cSnap.id;
      } else {
        const again = await tx.get(col.clients().where("email", "==", email));
        const hit = again.docs.find((d) => !d.data().archivedAt);
        if (hit) clientId = hit.id;
      }
      const clientCreated = !clientId;
      if (!clientId) {
        clientId = newClientRef.id;
        tx.set(newClientRef, {
          name: prospect.name,
          company: prospect.company,
          email,
          defaultCurrency: prospect.currency,
          notes: "",
          authUid: null,
          archivedAt: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      tx.set(projectRef, {
        clientId,
        title: prospect.service.trim() || "New project",
        description: "",
        status: "draft",
        startDate: null,
        deadline: null,
        acceptedAt: null,
        currency: prospect.currency,
        contractValue: prospect.estimatedValue,
        revisionAllowance: settings.defaultRevisionAllowance,
        archivedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const update: Record<string, unknown> = {
        convertedClientId: clientId,
        convertedProjectId: projectRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (prospect.stage !== "won") {
        update.stage = "won";
        update.closedAt = FieldValue.serverTimestamp();
        update.lostReason = null;
      }
      tx.update(prospectRef, update);

      logActivity(tx, {
        type: "prospect_converted",
        message: `${prospect.name} converted: ${clientCreated ? "new client created" : "existing client used"}, draft project created`,
        actor: "admin",
        visibility: "internal",
        prospectId,
        clientId,
        projectId: projectRef.id,
      });
      return projectRef.id;
    });
    return { projectId };
  });
}
