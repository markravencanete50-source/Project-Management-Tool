import "server-only";
import { requireAdmin } from "@/lib/auth/session";
import { getAccessibleProject } from "@/server/data/access";
import { col } from "@/server/data/refs";
import { fromDocs, projectFromDoc } from "@/server/data/convert";
import { notFound } from "next/navigation";
import { todayIso } from "@/lib/dates";
import { financeFor } from "@/lib/billing";
import type { BillLine, ProjectFinance } from "@/lib/finance";
import type { Payment, Project, ScheduleLine, Task, TimeEntry } from "@/lib/types";

export type ProjectPayments = {
  project: Project;
  /** Stored schedule: fixed projects only. Empty for retainers and task projects. */
  schedule: ScheduleLine[];
  payments: Payment[];
  /** Time entries, newest first. Retainers only, empty otherwise. */
  entries: TimeEntry[];
  /** Tasks in display order. Task projects only, empty otherwise. */
  tasks: Task[];
  /** Fixed: stored schedule against contract value. Others: derived bill lines against the billed total. */
  finance: ProjectFinance<BillLine>;
};

const EMPTY = Promise.resolve(null);

async function loadFor(project: Project): Promise<ProjectPayments> {
  const [scheduleSnap, paymentsSnap, entriesSnap, tasksSnap] = await Promise.all([
    project.kind === "fixed" ? col.schedule(project.id).get() : EMPTY,
    col.payments(project.id).get(),
    project.kind === "retainer" ? col.timeEntries(project.id).get() : EMPTY,
    project.kind === "tasks" ? col.tasks(project.id).get() : EMPTY,
  ]);
  const schedule = scheduleSnap ? fromDocs<ScheduleLine>(scheduleSnap) : [];
  const payments = fromDocs<Payment>(paymentsSnap).sort(
    (a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const entries = (entriesSnap ? fromDocs<TimeEntry>(entriesSnap) : []).sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const tasks = (tasksSnap ? fromDocs<Task>(tasksSnap) : []).sort((a, b) => a.order - b.order);
  const finance = financeFor({ project, schedule, entries, tasks, payments, today: todayIso() });
  return { project, schedule, payments, entries, tasks, finance };
}

/** Admin only: a project's schedule, payments and computed finance. */
export async function getAdminProjectPayments(projectId: string): Promise<ProjectPayments> {
  await requireAdmin();
  const snap = await col.projects().doc(projectId).get();
  if (!snap.exists) notFound();
  return loadFor(projectFromDoc(snap));
}

/** Admin, or the owning client for a non-draft project. */
export async function getPortalProjectPayments(projectId: string): Promise<ProjectPayments> {
  const { project } = await getAccessibleProject(projectId);
  return loadFor(project);
}
