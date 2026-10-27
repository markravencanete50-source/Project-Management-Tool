import "server-only";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { col } from "@/server/data/refs";
import { fromDoc, fromDocs } from "@/server/data/convert";
import type { Activity, Prospect } from "@/lib/types";

/** All prospects, newest first. Archived ones are included; callers filter. */
export async function listProspects(): Promise<Prospect[]> {
  await requireAdmin();
  const snap = await col.prospects().get();
  return fromDocs<Prospect>(snap).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getProspect(id: string): Promise<Prospect> {
  await requireAdmin();
  const snap = await col.prospects().doc(id).get();
  if (!snap.exists) notFound();
  return fromDoc<Prospect>(snap);
}

/** Activity for one prospect, newest first (sorted in memory). */
export async function getProspectActivity(prospectId: string): Promise<Activity[]> {
  await requireAdmin();
  const snap = await col.activity().where("prospectId", "==", prospectId).get();
  return fromDocs<Activity>(snap).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Names for the client and project a prospect was converted into. */
export async function getConvertedLinks(
  prospect: Pick<Prospect, "convertedClientId" | "convertedProjectId">,
): Promise<{ clientName: string | null; projectTitle: string | null }> {
  await requireAdmin();
  const [client, project] = await Promise.all([
    prospect.convertedClientId ? col.clients().doc(prospect.convertedClientId).get() : null,
    prospect.convertedProjectId ? col.projects().doc(prospect.convertedProjectId).get() : null,
  ]);
  return {
    clientName: client?.exists ? ((client.data()?.name as string | undefined) ?? null) : null,
    projectTitle: project?.exists ? ((project.data()?.title as string | undefined) ?? null) : null,
  };
}
