import "server-only";
import type { DocumentReference } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { col } from "@/server/data/refs";
import { fromDocs } from "@/server/data/convert";
import {
  buildDashboard,
  type DashboardData,
  type DashPayment,
  type DashProject,
  type DashProspect,
  type DashRevision,
  type DashScheduleLine,
} from "@/components/dashboard/calc";
import type { Client, Payment, Project, Prospect, Revision, ScheduleLine } from "@/lib/types";

const projectIdOf = (ref: DocumentReference) => ref.parent.parent!.id;

/**
 * Everything the dashboard shows, computed on read. Uses unfiltered
 * collection-group scans of payments, schedule and revisions (no index needed).
 */
export async function getDashboardData(): Promise<DashboardData> {
  await requireAdmin();
  const [projectsSnap, clientsSnap, prospectsSnap, paymentsSnap, scheduleSnap, revisionsSnap] = await Promise.all([
    col.projects().get(),
    col.clients().get(),
    col.prospects().get(),
    db().collectionGroup("payments").get(),
    db().collectionGroup("schedule").get(),
    db().collectionGroup("revisions").get(),
  ]);

  const projects: DashProject[] = fromDocs<Project>(projectsSnap);
  const clients = fromDocs<Client>(clientsSnap).map((c) => ({ id: c.id, name: c.name }));
  const prospects: DashProspect[] = fromDocs<Prospect>(prospectsSnap);
  const payments: DashPayment[] = paymentsSnap.docs.map((d) => ({
    projectId: projectIdOf(d.ref),
    amount: (d.data() as Payment).amount,
    paidOn: (d.data() as Payment).paidOn,
  }));
  const schedule: DashScheduleLine[] = scheduleSnap.docs.map((d) => {
    const data = d.data() as Omit<ScheduleLine, "id">;
    return { ...data, id: d.id, projectId: projectIdOf(d.ref) };
  });
  const revisions: DashRevision[] = revisionsSnap.docs.map((d) => {
    const data = d.data() as Pick<Revision, "round" | "status">;
    return { id: d.id, projectId: projectIdOf(d.ref), round: data.round, status: data.status };
  });

  return buildDashboard({ projects, clients, prospects, payments, schedule, revisions });
}
