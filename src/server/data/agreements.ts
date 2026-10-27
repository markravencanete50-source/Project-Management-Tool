import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { logActivity } from "@/server/activity";
import { getAccessibleProject } from "@/server/data/access";
import { fromDoc, fromDocs } from "@/server/data/convert";
import { col } from "@/server/data/refs";
import type { Agreement, Project } from "@/lib/types";

/** What a client may see of an agreement: no IP, user agent or signature file. */
export type ClientAgreement = Omit<Agreement, "signerIp" | "userAgent" | "signaturePublicId">;

function toClientView(agreement: Agreement): ClientAgreement {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signerIp, userAgent, signaturePublicId, ...rest } = agreement;
  return rest;
}

/** Admin: every version of a project's agreement, newest first. */
export async function listAgreements(projectId: string): Promise<{ project: Project; agreements: Agreement[] }> {
  await requireAdmin();
  const projectSnap = await col.projects().doc(projectId).get();
  if (!projectSnap.exists) notFound();
  const agreements = fromDocs<Agreement>(await col.agreements(projectId).get()).sort((a, b) => b.version - a.version);
  return { project: fromDoc<Project>(projectSnap), agreements };
}

/**
 * Client view of a project's agreement: the newest version that has been sent
 * (drafts and void versions are never shown). Checks the project belongs to the
 * signed-in client. With markViewed, the first open of a "sent" version
 * records "viewed" (client sessions only).
 */
export async function getClientAgreement(
  projectId: string,
  opts: { markViewed?: boolean } = {},
): Promise<{ project: Project; agreement: ClientAgreement | null }> {
  const { session, project } = await getAccessibleProject(projectId);

  const all = fromDocs<Agreement>(await col.agreements(project.id).get());
  const visible = all
    .filter((a) => a.status === "sent" || a.status === "viewed" || a.status === "signed")
    .sort((a, b) => b.version - a.version);
  // Creating a draft voids older unsigned versions, so a sent version is never behind a newer draft.
  let agreement = visible[0] ?? null;

  if (agreement && opts.markViewed && session.role === "client" && agreement.status === "sent") {
    const ref = col.agreements(project.id).doc(agreement.id);
    const target = agreement;
    const updated = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.get("status") !== "sent") return false;
      tx.update(ref, { status: "viewed", viewedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "agreement.viewed",
        message: `Agreement version ${target.version} opened by the client`,
        actor: "client",
        visibility: "internal",
        projectId: project.id,
        clientId: project.clientId,
      });
      return true;
    });
    if (updated) {
      const fresh = await ref.get();
      agreement = fromDoc<Agreement>(fresh);
    }
  }

  return { project, agreement: agreement ? toClientView(agreement) : null };
}
