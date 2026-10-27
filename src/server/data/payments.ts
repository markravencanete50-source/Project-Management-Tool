import "server-only";
import { requireAdmin } from "@/lib/auth/session";
import { getAccessibleProject } from "@/server/data/access";
import { col } from "@/server/data/refs";
import { fromDoc, fromDocs } from "@/server/data/convert";
import { notFound } from "next/navigation";
import { todayIso } from "@/lib/dates";
import { projectFinance, type ProjectFinance } from "@/lib/finance";
import type { Payment, Project, ScheduleLine } from "@/lib/types";

export type ProjectPayments = {
  project: Project;
  schedule: ScheduleLine[];
  payments: Payment[];
  finance: ProjectFinance;
};

async function loadFor(project: Project): Promise<ProjectPayments> {
  const [scheduleSnap, paymentsSnap] = await Promise.all([col.schedule(project.id).get(), col.payments(project.id).get()]);
  const schedule = fromDocs<ScheduleLine>(scheduleSnap);
  const payments = fromDocs<Payment>(paymentsSnap).sort(
    (a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const finance = projectFinance({ contractValue: project.contractValue, schedule, payments, today: todayIso() });
  return { project, schedule, payments, finance };
}

/** Admin only: a project's schedule, payments and computed finance. */
export async function getAdminProjectPayments(projectId: string): Promise<ProjectPayments> {
  await requireAdmin();
  const snap = await col.projects().doc(projectId).get();
  if (!snap.exists) notFound();
  return loadFor(fromDoc<Project>(snap));
}

/** Admin, or the owning client for a non-draft project. */
export async function getPortalProjectPayments(projectId: string): Promise<ProjectPayments> {
  const { project } = await getAccessibleProject(projectId);
  return loadFor(project);
}
