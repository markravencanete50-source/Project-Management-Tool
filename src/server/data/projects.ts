import "server-only";
import { notFound } from "next/navigation";
import { requireAdmin, requireClient } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { col } from "@/server/data/refs";
import { fromDoc, fromDocs, projectFromDoc, projectsFromDocs } from "@/server/data/convert";
import { progress, REVISION_OPEN, taskProgress } from "@/lib/projects";
import type { Client, Milestone, Project, Revision, Task } from "@/lib/types";

export type ProjectListItem = {
  project: Project;
  clientName: string;
  /** Fixed: milestone progress. Tasks: percentage of tasks done. Retainers: 0 (not shown). */
  progress: number;
  /** Task projects only. */
  tasksDone: number;
  tasksTotal: number;
};

/** Progress for one project, by kind. Fixed projects read milestones exactly as before. */
async function progressFor(project: Project): Promise<{ progress: number; tasksDone: number; tasksTotal: number }> {
  if (project.kind === "tasks") {
    const tasks = fromDocs<Task>(await col.tasks(project.id).get());
    return { progress: taskProgress(tasks), tasksDone: tasks.filter((t) => t.status === "done").length, tasksTotal: tasks.length };
  }
  if (project.kind === "retainer") return { progress: 0, tasksDone: 0, tasksTotal: 0 };
  const snap = await col.milestones(project.id).get();
  return { progress: progress(fromDocs<Milestone>(snap)), tasksDone: 0, tasksTotal: 0 };
}

/**
 * Admin: every project (archived included, the UI filters) with client name and
 * progress. Milestones come from one unfiltered collection-group read (no index).
 */
export async function listProjects(): Promise<ProjectListItem[]> {
  await requireAdmin();
  const [projectsSnap, clientsSnap, milestonesSnap, tasksSnap] = await Promise.all([
    col.projects().get(),
    col.clients().get(),
    db().collectionGroup("milestones").get(),
    db().collectionGroup("tasks").get(),
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
  const tasksByProject = new Map<string, Task[]>();
  for (const doc of tasksSnap.docs) {
    const projectId = doc.ref.parent.parent?.id;
    if (!projectId) continue;
    const list = tasksByProject.get(projectId) ?? [];
    list.push(fromDoc<Task>(doc));
    tasksByProject.set(projectId, list);
  }
  return projectsFromDocs(projectsSnap)
    .map((project) => {
      const tasks = tasksByProject.get(project.id) ?? [];
      return {
        project,
        clientName: names.get(project.clientId) ?? "Unknown client",
        progress:
          project.kind === "tasks" ? taskProgress(tasks) : project.kind === "retainer" ? 0 : progress(byProject.get(project.id) ?? []),
        tasksDone: tasks.filter((t) => t.status === "done").length,
        tasksTotal: tasks.length,
      };
    })
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
  const project = projectFromDoc(snap);
  const fixed = project.kind === "fixed";
  const [clientSnap, milestonesSnap, revisionsSnap] = await Promise.all([
    col.clients().doc(project.clientId).get(),
    fixed ? col.milestones(projectId).get() : null,
    fixed ? col.revisions(projectId).get() : null,
  ]);
  const milestones = (milestonesSnap ? fromDocs<Milestone>(milestonesSnap) : []).sort((a, b) => a.order - b.order);
  const revisions = revisionsSnap ? fromDocs<Revision>(revisionsSnap) : [];
  return {
    project,
    client: clientSnap.exists ? fromDoc<Client>(clientSnap) : null,
    milestones,
    progress: progress(milestones),
    inRevision: revisions.some((r) => REVISION_OPEN.includes(r.status)),
  };
}

export type ClientProjectItem = { project: Project; progress: number; tasksDone: number; tasksTotal: number };

/** Admin: one client's projects, newest first. */
export async function listClientProjects(clientId: string): Promise<ClientProjectItem[]> {
  await requireAdmin();
  const snap = await col.projects().where("clientId", "==", clientId).get();
  const projects = projectsFromDocs(snap).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return Promise.all(projects.map(async (project) => ({ project, ...(await progressFor(project)) })));
}

/** Client: own non-draft, non-archived projects, newest first. */
export async function listPortalProjects(): Promise<ClientProjectItem[]> {
  const session = await requireClient();
  const snap = await col.projects().where("clientId", "==", session.clientId).get();
  const projects = projectsFromDocs(snap)
    .filter((p) => !p.archivedAt && p.status !== "draft")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return Promise.all(projects.map(async (project) => ({ project, ...(await progressFor(project)) })));
}
