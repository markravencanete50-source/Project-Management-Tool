import "server-only";
import { notFound } from "next/navigation";
import { requireAny, type Session } from "@/lib/auth/session";
import { col } from "@/server/data/refs";
import { fromDoc } from "@/server/data/convert";
import type { Project } from "@/lib/types";

/**
 * Load a project the current session may see: any project for the admin, only
 * the client's own non-draft, non-archived projects for a client. Anything else
 * is a 404, so clients cannot probe for other clients' ids.
 */
export async function getAccessibleProject(projectId: string): Promise<{ session: Session; project: Project }> {
  const session = await requireAny();
  const snap = await col.projects().doc(projectId).get();
  if (!snap.exists) notFound();
  const project = fromDoc<Project>(snap);
  if (session.role === "client") {
    if (project.clientId !== session.clientId || project.archivedAt || project.status === "draft") notFound();
  }
  return { session, project };
}

/** Same rule as getAccessibleProject, as a boolean, for route handlers. */
export function canAccessProject(session: Session, project: Pick<Project, "clientId" | "archivedAt" | "status">): boolean {
  if (session.role === "admin") return true;
  return project.clientId === session.clientId && !project.archivedAt && project.status !== "draft";
}
