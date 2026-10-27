"use server";

import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { deleteAsset, projectFolder, uploadBuffer } from "@/lib/cloudinary";
import { todayIso } from "@/lib/dates";
import { appUrl, env } from "@/lib/env";
import { db } from "@/lib/firebase/admin";
import { sortSchedule } from "@/lib/finance";
import { renderAgreementPdf } from "@/lib/pdf/agreement-document";
import { sha256Hex } from "@/lib/pdf/hash";
import { agreementValues, templateToBlocks } from "@/lib/pdf/merge";
import { createAgreementSchema, sendAgreementSchema } from "@/lib/validation/agreements";
import { logActivity } from "@/server/activity";
import { run, UserError } from "@/server/action";
import { issueClientLink } from "@/server/auth-helpers";
import { fromDoc, fromDocs } from "@/server/data/convert";
import { col } from "@/server/data/refs";
import { getSettings } from "@/server/data/settings";
import type { ActionResult, Agreement, AgreementSnapshot, Client, Project, ScheduleLine } from "@/lib/types";

/** Signed agreements are immutable. Every write path in this file calls this first. */
function assertNotSigned(agreement: Pick<Agreement, "status">): void {
  if (agreement.status === "signed") throw new UserError("A signed agreement cannot be changed.");
}

/** The newest version that is not void. This is the only version a client may sign. */
function latestNonVoid<T extends Pick<Agreement, "version" | "status">>(agreements: T[]): T | null {
  return agreements.filter((a) => a.status !== "void").sort((a, b) => b.version - a.version)[0] ?? null;
}

/**
 * Admin: create the next agreement version for a project from the settings
 * template, an immutable snapshot of the project, and a rendered PDF.
 * Older drafts and unsigned versions become void. A signed version is never
 * touched; creating a version after one is signed is a scope change and needs
 * confirmScopeChange.
 */
export async function createAgreement(projectId: string, options?: { confirmScopeChange?: boolean }): Promise<ActionResult<{ agreementId: string; version: number }>> {
  return run(async () => {
    await requireAdmin();
    const input = createAgreementSchema.parse({ projectId, confirmScopeChange: options?.confirmScopeChange });

    const projectSnap = await col.projects().doc(input.projectId).get();
    if (!projectSnap.exists) notFound();
    const project = fromDoc<Project>(projectSnap);
    if (project.archivedAt) throw new UserError("This project is archived.");
    if (!project.description.trim()) throw new UserError("Add a project description (the scope of work) before creating an agreement.");

    const clientSnap = await col.clients().doc(project.clientId).get();
    if (!clientSnap.exists) throw new UserError("The project's client was not found.");
    const client = fromDoc<Client>(clientSnap);

    const [scheduleSnap, existingSnap, settings] = await Promise.all([
      col.schedule(project.id).get(),
      col.agreements(project.id).get(),
      getSettings(),
    ]);
    const schedule = sortSchedule(fromDocs<ScheduleLine>(scheduleSnap));
    const scheduleTotal = schedule.reduce((sum, line) => sum + line.amountDue, 0);
    if (schedule.length > 0 && scheduleTotal !== project.contractValue) {
      throw new UserError("The payment schedule does not add up to the contract value. Fix it in the Payments tab first.");
    }

    const existing = fromDocs<Agreement>(existingSnap);
    if (existing.some((a) => a.status === "signed") && !input.confirmScopeChange) {
      throw new UserError("A signed agreement already exists. A new version is a scope change: confirm to continue.");
    }
    const version = existing.reduce((max, a) => Math.max(max, a.version), 0) + 1;

    const snapshot: AgreementSnapshot = {
      scope: project.description,
      price: project.contractValue,
      currency: project.currency,
      schedule: schedule.map((l) => ({ label: l.label, kind: l.kind, amountDue: l.amountDue, dueDate: l.dueDate })),
      revisionAllowance: project.revisionAllowance,
      timeline: { startDate: project.startDate, deadline: project.deadline },
    };

    const values = agreementValues({
      settings,
      fallbackBusinessEmail: env().ADMIN_EMAIL,
      client,
      projectTitle: project.title,
      snapshot,
      agreementDate: todayIso(),
    });
    const { blocks, missing } = templateToBlocks(settings.agreementTemplate, values);
    if (missing.length > 0) {
      throw new UserError(`The agreement template uses unknown placeholders: ${missing.map((m) => `{{${m}}}`).join(", ")}. Fix the template in Settings.`);
    }

    const pdf = await renderAgreementPdf({
      title: `Agreement: ${project.title}`,
      footerLabel: `${settings.businessName} and ${client.name} | ${project.title} | Version ${version}`,
      blocks,
    });
    const pdfHash = sha256Hex(pdf);
    const { storedId } = await uploadBuffer(pdf, {
      folder: projectFolder(project.id, "agreements"),
      resourceType: "raw",
      publicId: `v${version}-${randomBytes(6).toString("hex")}.pdf`,
    });

    const newRef = col.agreements(project.id).doc();
    try {
      await db().runTransaction(async (tx) => {
        const current = fromDocs<Agreement>(await tx.get(col.agreements(project.id)));
        const currentMax = current.reduce((max, a) => Math.max(max, a.version), 0);
        if (currentMax + 1 !== version) throw new UserError("Another version was created at the same time. Please try again.");
        if (current.some((a) => a.status === "signed") && !input.confirmScopeChange) {
          throw new UserError("A signed agreement already exists. A new version is a scope change: confirm to continue.");
        }

        const toVoid = current.filter((a) => a.status !== "signed" && a.status !== "void");
        for (const old of toVoid) {
          assertNotSigned(old);
          tx.update(col.agreements(project.id).doc(old.id), { status: "void" });
        }

        tx.set(newRef, {
          version,
          status: "draft",
          snapshot,
          pdfPublicId: storedId,
          pdfHash,
          signedPdfPublicId: null,
          signedPdfHash: null,
          signaturePublicId: null,
          sentAt: null,
          viewedAt: null,
          signedAt: null,
          signerName: null,
          signerEmail: null,
          signerIp: null,
          userAgent: null,
          createdAt: FieldValue.serverTimestamp(),
        });
        logActivity(tx, {
          type: "agreement.created",
          message:
            toVoid.length > 0
              ? `Agreement version ${version} created; ${toVoid.length} earlier unsigned version(s) voided`
              : `Agreement version ${version} created`,
          actor: "admin",
          visibility: "internal",
          projectId: project.id,
          clientId: project.clientId,
        });
      });
    } catch (err) {
      // The file was uploaded but never referenced: remove it.
      await deleteAsset(storedId).catch((e) => console.error("orphan agreement cleanup failed", e));
      throw err;
    }
    return { agreementId: newRef.id, version };
  });
}

/**
 * Admin: send a draft agreement to the client. Marks it sent, moves a draft
 * project to agreement_sent, and emails the client a sign-in link that lands on
 * the sign page. Calling it again on a sent or viewed version re-sends the email.
 */
export async function sendAgreement(projectId: string, agreementId: string): Promise<ActionResult> {
  return run<undefined>(async () => {
    await requireAdmin();
    const input = sendAgreementSchema.parse({ projectId, agreementId });

    const projectRef = col.projects().doc(input.projectId);
    const agreementRef = col.agreements(input.projectId).doc(input.agreementId);
    const [projectSnap, agreementSnap] = await Promise.all([projectRef.get(), agreementRef.get()]);
    if (!projectSnap.exists || !agreementSnap.exists) notFound();
    const project = fromDoc<Project>(projectSnap);
    if (project.archivedAt) throw new UserError("This project is archived.");

    const clientSnap = await col.clients().doc(project.clientId).get();
    if (!clientSnap.exists) throw new UserError("The project's client was not found.");
    const client = fromDoc<Client>(clientSnap);
    if (client.archivedAt) throw new UserError("The client is archived.");
    if (!client.email) throw new UserError("The client has no email address.");

    const preview = fromDoc<Agreement>(agreementSnap);
    assertNotSigned(preview);
    if (preview.status === "void") throw new UserError("This version was replaced by a newer one.");

    const all = fromDocs<Agreement>(await col.agreements(input.projectId).get());
    if (latestNonVoid(all)?.id !== preview.id) throw new UserError("Only the latest version can be sent.");

    await db().runTransaction(async (tx) => {
      const [freshAgreement, freshProject] = await Promise.all([tx.get(agreementRef), tx.get(projectRef)]);
      const current = fromDoc<Agreement>(freshAgreement);
      assertNotSigned(current);
      if (current.status === "void") throw new UserError("This version was replaced by a newer one.");

      if (current.status === "draft") {
        tx.update(agreementRef, { status: "sent", sentAt: FieldValue.serverTimestamp() });
        if (freshProject.get("status") === "draft") {
          tx.update(projectRef, { status: "agreement_sent", updatedAt: FieldValue.serverTimestamp() });
        }
      }
      logActivity(tx, {
        type: current.status === "draft" ? "agreement.sent" : "agreement.resent",
        message: current.status === "draft" ? `Agreement version ${current.version} sent for signature` : `Agreement version ${current.version} sent again`,
        actor: "admin",
        visibility: current.status === "draft" ? "client" : "internal",
        projectId: project.id,
        clientId: project.clientId,
      });
    });

    const signPath = `/portal/projects/${project.id}/agreement`;
    try {
      await issueClientLink(client, "agreement", signPath, project.title);
    } catch (err) {
      console.error("sendAgreement email failed", err);
      throw new UserError("The agreement was marked as sent, but the email could not be sent. Use Send again to retry.");
    }
    return undefined;
  });
}
