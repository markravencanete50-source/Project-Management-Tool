import "server-only";
import { requireAdmin } from "@/lib/auth/session";
import { col } from "@/server/data/refs";
import { fromDocs } from "@/server/data/convert";
import { getAccessibleProject } from "@/server/data/access";
import type { Activity } from "@/lib/types";

/**
 * Activity for one project, newest first. The full list (internal entries
 * included) is admin only. The client view checks project access and keeps
 * only entries with visibility "client".
 */
export async function listProjectActivity(projectId: string, opts: { clientOnly: boolean }): Promise<Activity[]> {
  if (opts.clientOnly) {
    await getAccessibleProject(projectId);
  } else {
    await requireAdmin();
  }
  const snap = await col.activity().where("projectId", "==", projectId).get();
  return fromDocs<Activity>(snap)
    .filter((a) => !opts.clientOnly || a.visibility === "client")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Admin: activity for a client that is not tied to a project (client edits, archive). */
export async function listClientActivity(clientId: string): Promise<Activity[]> {
  await requireAdmin();
  const snap = await col.activity().where("clientId", "==", clientId).get();
  return fromDocs<Activity>(snap)
    .filter((a) => a.projectId === null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
