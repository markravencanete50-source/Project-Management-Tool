import "server-only";
import { notFound } from "next/navigation";
import { requireAdmin, requireClient } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { col } from "@/server/data/refs";
import { fromDoc, fromDocs } from "@/server/data/convert";
import { progress, REVISION_OPEN } from "@/lib/projects";
import type { Client, Milestone, Project, Revision } from "@/lib/types";

export type ProjectListItem = {
  project: Project;
  clientName: string;
  progress: number;
};

async function progressFor(projectId: string): Promise<number> {
  const snap = await col.milestones(projectId).get();
  return progress(fromDocs<Milestone>(snap));
}

/**
 * Admin: every project (archived included, the UI filters) with client name and
 * progress. Milestones come from one unfiltered collection-group read (no index).
 */
export async function listProjects(): Promise<ProjectListItem[]> {
  await requireAdmin();
  const [projectsSnap, clientsSnap, milestonesSnap] = await Promise.all([
    col.projects().get(),
    col.clients().get(),
    db().collectionGroup("milestones").get(),
  ]);
  const names = new Map(fromDocs<Client>(clientsSnap).map((c) => [c.id, c.name]));
  const byProject = new Map<string, Milestone[]>();
  for (const doc of milestonesSnap.docs) {
    const projectId = doc.ref.parent.parent?.id;
    if (!projectId) continue;
    const list = byProject.get(projectId) ?? [];
    list.push(fromDoc<Milestone>(doc));
    byProject.set(projectId, list);
  }
  return fromDocs<Project>(projectsSnap)
    .map((project) => ({
      project,
      clientName: names.get(project.clientId) ?? "Unknown client",
      progress: progress(byProject.get(project.id) ?? []),
    }))
    .sort((a, b) => b.project.createdAt.getTime() - a.project.createdAt.getTime());
}

export type ProjectDetail = {
  project: Project;
  client: Client | null;
  milestones: Milestone[];
  progress: number;
  inRevision: boolean;
};

export async function getProjectDetail(projectId: string): Promise<ProjectDetail> {
  await requireAdmin();
  const snap = await col.projects().doc(projectId).get();
  if (!snap.exists) notFound();
  const project = fromDoc<Project>(snap);
  const [clientSnap, milestonesSnap, revisionsSnap] = await Promise.all([
    col.clients().doc(project.clientId).get(),
    col.milestones(projectId).get(),
    col.revisions(projectId).get(),
  ]);
  const milestones = fromDocs<Milestone>(milestonesSnap).sort((a, b) => a.order - b.order);
  const revisions = fromDocs<Revision>(revisionsSnap);
  return {
    project,
    client: clientSnap.exists ? fromDoc<Client>(clientSnap) : null,
    milestones,
    progress: progress(milestones),
    inRevision: revisions.some((r) => REVISION_OPEN.includes(r.status)),
  };
}

export type ClientProjectItem = { project: Project; progress: number };

/** Admin: one client's projects, newest first. */
export async function listClientProjects(clientId: string): Promise<ClientProjectItem[]> {
  await requireAdmin();
  const snap = await col.projects().where("clientId", "==", clientId).get();
  const projects = fromDocs<Project>(snap).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return Promise.all(projects.map(async (project) => ({ project, progress: await progressFor(project.id) })));
}

/** Client: own non-draft, non-archived projects, newest first. */
export async function listPortalProjects(): Promise<ClientProjectItem[]> {
  const session = await requireClient();
  const snap = await col.projects().where("clientId", "==", session.clientId).get();
  const projects = fromDocs<Project>(snap)
    .filter((p) => !p.archivedAt && p.status !== "draft")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return Promise.all(projects.map(async (project) => ({ project, progress: await progressFor(project.id) })));
}
