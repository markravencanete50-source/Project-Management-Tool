import "server-only";
import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { logActivity } from "@/server/activity";
import type { Project } from "@/lib/types";

/**
 * Mark a project accepted, once. Call inside the transaction that caused it
 * (agreement signed, or the payment that covered the deposit). Returns false if
 * the project was already accepted. Never un-accepts.
 */
export function markAccepted(
  tx: Transaction,
  projectRef: DocumentReference,
  project: Pick<Project, "acceptedAt" | "status" | "clientId">,
  reason: "signed" | "deposit_paid",
  actor: "admin" | "client",
): boolean {
  if (project.acceptedAt) return false;
  const status = project.status === "draft" || project.status === "agreement_sent" ? "active" : project.status;
  tx.update(projectRef, { acceptedAt: FieldValue.serverTimestamp(), status, updatedAt: FieldValue.serverTimestamp() });
  logActivity(tx, {
    type: "project.accepted",
    message: reason === "signed" ? "Project accepted: agreement signed" : "Project accepted: deposit paid",
    actor,
    visibility: "client",
    projectId: projectRef.id,
    clientId: project.clientId,
  });
  return true;
}
