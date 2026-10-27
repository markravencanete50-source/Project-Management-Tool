import "server-only";
import { getAccessibleProject } from "@/server/data/access";
import { col } from "@/server/data/refs";
import { fromDocs } from "@/server/data/convert";
import { countedRevisions, MAX_CLIENT_PENDING_REVISIONS, REVISION_WAITING_ON_ADMIN } from "@/lib/projects";
import type { Currency } from "@/lib/money";
import type { Project, Revision } from "@/lib/types";

export type ProjectRevisions = {
  role: "admin" | "client";
  project: Pick<Project, "id" | "title" | "status" | "currency" | "revisionAllowance">;
  /** Newest round first. */
  revisions: Revision[];
  counted: number;
  allowance: number;
  currency: Currency;
  /** Revisions waiting on the admin (awaiting_quote or requested). */
  waitingOnAdmin: number;
  /** Null when the client may request a revision, otherwise why not. */
  requestBlockedReason: string | null;
};

/** Revisions for one project. Admin, or the owning client; anything else is a 404. */
export async function getProjectRevisions(projectId: string): Promise<ProjectRevisions> {
  const { session, project } = await getAccessibleProject(projectId);
  const snap = await col.revisions(projectId).get();
  const revisions = fromDocs<Revision>(snap).sort((a, b) => b.round - a.round || b.requestedAt.getTime() - a.requestedAt.getTime());
  const waitingOnAdmin = revisions.filter((r) => REVISION_WAITING_ON_ADMIN.includes(r.status)).length;

  let requestBlockedReason: string | null = null;
  if (session.role !== "client") {
    requestBlockedReason = "Only the client can request revisions.";
  } else if (project.status !== "active" && project.status !== "on_hold") {
    requestBlockedReason = "Revisions can be requested once the project is active.";
  } else if (waitingOnAdmin >= MAX_CLIENT_PENDING_REVISIONS) {
    requestBlockedReason = `You already have ${MAX_CLIENT_PENDING_REVISIONS} requests waiting. You can send another once work starts on one of them.`;
  }

  return {
    role: session.role,
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      currency: project.currency,
      revisionAllowance: project.revisionAllowance,
    },
    revisions,
    counted: countedRevisions(revisions),
    allowance: project.revisionAllowance,
    currency: project.currency,
    waitingOnAdmin,
    requestBlockedReason,
  };
}
