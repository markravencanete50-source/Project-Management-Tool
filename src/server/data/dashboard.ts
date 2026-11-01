import "server-only";
import type { DocumentReference } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { col } from "@/server/data/refs";
import { loadRateTable } from "@/server/data/fx";
import { standaloneFromSnap } from "@/server/data/standalone-payments";
import { expensesFromSnap } from "@/server/data/expenses";
import { getSettings } from "@/server/data/settings";
import { fromDoc, fromDocs, projectsFromDocs, prospectsFromDocs } from "@/server/data/convert";
import { buildDashboardWithMoney, type DashboardWithMoney } from "@/components/dashboard/flow-calc";
import {
  type DashPayment,
  type DashProject,
  type DashProspect,
  type DashRevision,
  type DashScheduleLine,
  type DashTask,
  type DashTimeEntry,
} from "@/components/dashboard/calc";
import type { RangeSpec } from "@/lib/date-range";
import type { Currency } from "@/lib/money";
import type { Client, Payment, Revision, ScheduleLine, Task, TimeEntry } from "@/lib/types";

const projectIdOf = (ref: DocumentReference) => ref.parent.parent!.id;

/**
 * Everything the dashboard shows, computed on read. Uses unfiltered
 * collection-group scans of payments, schedule, revisions, time entries and tasks (no index needed).
 * The result carries both earnings views: `earningsSeries` (last 12 months) and
 * `weeklyEarningsSeries` (last 12 Monday-start weeks), each bucketed in Asia/Manila
 * by the payment's paidOn date, one series per currency.
 */
export async function getDashboardData(opts: { convert?: boolean; range?: RangeSpec } = {}): Promise<DashboardWithMoney> {
  await requireAdmin();
  const [projectsSnap, clientsSnap, prospectsSnap, paymentsSnap, scheduleSnap, revisionsSnap, entriesSnap, tasksSnap, standaloneSnap, expensesSnap] = await Promise.all([
    col.projects().get(),
    col.clients().get(),
    col.prospects().get(),
    db().collectionGroup("payments").get(),
    db().collectionGroup("schedule").get(),
    db().collectionGroup("revisions").get(),
    db().collectionGroup("timeEntries").get(),
    db().collectionGroup("tasks").get(),
    col.standalonePayments().get(),
    col.expenses().get(),
  ]);

  const projects: DashProject[] = projectsFromDocs(projectsSnap);
  const clients = fromDocs<Client>(clientsSnap).map((c) => ({ id: c.id, name: c.name }));
  const prospects: DashProspect[] = prospectsFromDocs(prospectsSnap);
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

  const timeEntries: DashTimeEntry[] = entriesSnap.docs.map((d) => {
    const data = d.data() as TimeEntry;
    return { projectId: projectIdOf(d.ref), date: data.date, quantityHundredths: data.quantityHundredths };
  });
  const tasks: DashTask[] = tasksSnap.docs.map((d) => {
    const data = fromDoc<Task>(d);
    return { id: d.id, projectId: projectIdOf(d.ref), title: data.title, price: data.price, status: data.status, order: data.order, doneAt: data.doneAt };
  });

  // Rates are only fetched for the PHP view, and only for currencies actually in use.
  // Manual rates from Settings are read fresh and applied by loadRateTable after the (cached) live fetch.
  const standalonePayments = standaloneFromSnap(standaloneSnap).map((s) => ({ amount: s.amount, paidOn: s.paidOn, currency: s.currency }));
  // Expenses and the opening balance feed only the money block (available money, income vs
  // expenses, spending by category); earnings and every other figure ignore them.
  const settings = await getSettings();
  const expenses = expensesFromSnap(expensesSnap);
  const opening = { balances: settings.openingBalances, date: settings.openingBalanceDate };
  const rates = opts.convert
    ? await loadRateTable(
        [
          ...new Set([
            ...projects.map((p) => p.currency),
            ...prospects.map((p) => p.currency),
            ...standalonePayments.map((s) => s.currency),
            ...expenses.map((e) => e.currency),
            ...(Object.keys(opening.balances) as Currency[]),
          ]),
        ],
        settings.fxOverrides,
      )
    : undefined;

  return buildDashboardWithMoney({ projects, clients, prospects, payments, standalonePayments, schedule, revisions, timeEntries, tasks, rates, expenses, opening, range: opts.range });
}
