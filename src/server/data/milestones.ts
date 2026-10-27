import "server-only";
import { col } from "@/server/data/refs";
import { fromDocs } from "@/server/data/convert";
import { getAccessibleProject } from "@/server/data/access";
import type { Milestone } from "@/lib/types";

/** Milestones in display order. Admin, or the owning client for an accessible project. */
export async function listMilestones(projectId: string): Promise<Milestone[]> {
  await getAccessibleProject(projectId);
  const snap = await col.milestones(projectId).get();
  return fromDocs<Milestone>(snap).sort((a, b) => a.order - b.order);
}
