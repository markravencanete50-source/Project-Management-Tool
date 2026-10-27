// Pure dashboard aggregation. No server imports, so it can be unit tested and
// reused anywhere. Everything is computed on read from source documents.
import { formatMonthKey, lastNMonths, monthKeyOfInstant, todayIso, type IsoDate, type MonthKey } from "@/lib/dates";
import { earningsByMonth, projectFinance } from "@/lib/finance";
import { addMoney, CURRENCIES, type Currency, type MoneyByCurrency } from "@/lib/money";
import { REVISION_WAITING_ON_ADMIN } from "@/lib/projects";
import type { Project, ProjectStatus, Prospect, RevisionStatus, ScheduleLine } from "@/lib/types";

export const WIN_RATE_DAYS = 90;
export const CHART_MONTHS = 12;

export type DashProject = Pick<
  Project,
  "id" | "clientId" | "title" | "status" | "currency" | "contractValue" | "acceptedAt" | "archivedAt"
>;
export type DashProspect = Pick<
  Prospect,
  "id" | "name" | "company" | "stage" | "estimatedValue" | "currency" | "nextFollowUp" | "closedAt" | "archivedAt"
>;
export type DashPayment = { projectId: string; amount: number; paidOn: IsoDate };
export type DashScheduleLine = ScheduleLine & { projectId: string };
export type DashRevision = { id: string; projectId: string; round: number; status: RevisionStatus };

export type DashboardInput = {
  /** Every project, archived included, so archiving never erases earnings history. */
  projects: DashProject[];
  clients: { id: string; name: string }[];
  prospects: DashProspect[];
  payments: DashPayment[];
  schedule: DashScheduleLine[];
  revisions: DashRevision[];
  now?: Date;
};

export type EarningsPoint = { month: MonthKey; label: string; amount: number };
export type EarningsSeries = { currency: Currency; points: EarningsPoint[] };
export type AcceptedPoint = { month: MonthKey; label: string; count: number };

export type OverdueItem = {
  lineId: string;
  projectId: string;
  projectTitle: string;
  clientName: string;
  label: string;
  outstanding: number;
  currency: Currency;
  dueDate: IsoDate;
};
export type FollowUpItem = { prospectId: string; name: string; company: string; nextFollowUp: IsoDate };
export type RevisionItem = {
  revisionId: string;
  projectId: string;
  projectTitle: string;
  clientName: string;
  round: number;
  status: RevisionStatus;
};

export type DashboardData = {
  today: IsoDate;
  earnedThisMonth: MoneyByCurrency;
  earnedThisYear: MoneyByCurrency;
  acceptedThisMonth: number;
  acceptedAllTime: number;
  activeProjects: number;
  pendingBalance: MoneyByCurrency;
  pipelineValue: MoneyByCurrency;
  winRate: { won: number; lost: number; rate: number | null };
  earningsSeries: EarningsSeries[];
  acceptedSeries: AcceptedPoint[];
  attention: { overdue: OverdueItem[]; followUps: FollowUpItem[]; revisions: RevisionItem[] };
};

const BALANCE_STATUSES: ProjectStatus[] = ["active", "on_hold"];
/** Projects whose unpaid, past-due lines are worth chasing. */
const CHASE_STATUSES: ProjectStatus[] = ["active", "on_hold", "completed"];

export function monthLabel(month: MonthKey): string {
  return formatMonthKey(month, "MMM yy");
}

/** Earnings per month for a window, one series per currency that has any payment in it. */
export function earningsSeries(
  payments: { amount: number; paidOn: IsoDate; currency: Currency }[],
  months: MonthKey[],
): EarningsSeries[] {
  const byMonth = earningsByMonth(payments);
  const out: EarningsSeries[] = [];
  for (const currency of CURRENCIES) {
    const points = months.map((month) => ({
      month,
      label: monthLabel(month),
      amount: byMonth.get(month)?.[currency] ?? 0,
    }));
    if (points.some((p) => p.amount !== 0)) out.push({ currency, points });
  }
  return out;
}

export function acceptedSeries(acceptedAts: Date[], months: MonthKey[]): AcceptedPoint[] {
  const counts = new Map<MonthKey, number>();
  for (const d of acceptedAts) {
    const key = monthKeyOfInstant(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return months.map((month) => ({ month, label: monthLabel(month), count: counts.get(month) ?? 0 }));
}

/** won / (won + lost) among prospects closed in the last `days` days. Null when none closed. */
export function winRate(
  prospects: Pick<Prospect, "stage" | "closedAt">[],
  now: Date,
  days = WIN_RATE_DAYS,
): { won: number; lost: number; rate: number | null } {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  let won = 0;
  let lost = 0;
  for (const p of prospects) {
    if (!p.closedAt || p.closedAt.getTime() < since || p.closedAt.getTime() > now.getTime()) continue;
    if (p.stage === "won") won++;
    else if (p.stage === "lost") lost++;
  }
  const closed = won + lost;
  return { won, lost, rate: closed === 0 ? null : won / closed };
}

export function buildDashboard(input: DashboardInput): DashboardData {
  const now = input.now ?? new Date();
  const today = todayIso(now);
  const thisMonth = monthKeyOfInstant(now);
  const thisYear = thisMonth.slice(0, 4);
  const months = lastNMonths(CHART_MONTHS, now);

  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const clientName = new Map(input.clients.map((c) => [c.id, c.name]));
  const live = input.projects.filter((p) => !p.archivedAt);

  // Earnings use every project's payments, tagged with the project's currency.
  const taggedPayments = input.payments.flatMap((p) => {
    const project = projectById.get(p.projectId);
    return project ? [{ amount: p.amount, paidOn: p.paidOn, currency: project.currency }] : [];
  });
  const byMonth = earningsByMonth(taggedPayments);
  const earnedThisMonth: MoneyByCurrency = { ...(byMonth.get(thisMonth) ?? {}) };
  const earnedThisYear: MoneyByCurrency = {};
  for (const [month, money] of byMonth) {
    if (!month.startsWith(thisYear)) continue;
    for (const c of CURRENCIES) if (money[c] !== undefined) addMoney(earnedThisYear, c, money[c] ?? 0);
  }

  const acceptedAts = input.projects.flatMap((p) => (p.acceptedAt ? [p.acceptedAt] : []));
  const acceptedThisMonth = acceptedAts.filter((d) => monthKeyOfInstant(d) === thisMonth).length;

  // Per project finance, grouped by project once.
  const paymentsBy = groupBy(input.payments, (p) => p.projectId);
  const scheduleBy = groupBy(input.schedule, (l) => l.projectId);

  const pendingBalance: MoneyByCurrency = {};
  const overdue: OverdueItem[] = [];
  for (const project of live) {
    const finance = projectFinance({
      contractValue: project.contractValue,
      schedule: scheduleBy.get(project.id) ?? [],
      payments: paymentsBy.get(project.id) ?? [],
      today,
    });
    if (BALANCE_STATUSES.includes(project.status) && finance.pending > 0) {
      addMoney(pendingBalance, project.currency, finance.pending);
    }
    if (CHASE_STATUSES.includes(project.status)) {
      for (const line of finance.overdueLines) {
        overdue.push({
          lineId: line.id,
          projectId: project.id,
          projectTitle: project.title,
          clientName: clientName.get(project.clientId) ?? "Unknown client",
          label: line.label,
          outstanding: line.outstanding,
          currency: project.currency,
          dueDate: line.dueDate,
        });
      }
    }
  }
  overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const openProspects = input.prospects.filter((p) => !p.archivedAt && p.stage !== "won" && p.stage !== "lost");
  const pipelineValue: MoneyByCurrency = {};
  for (const p of openProspects) addMoney(pipelineValue, p.currency, p.estimatedValue);

  const followUps: FollowUpItem[] = openProspects
    .flatMap((p) => (p.nextFollowUp && p.nextFollowUp <= today ? [{ prospectId: p.id, name: p.name, company: p.company, nextFollowUp: p.nextFollowUp }] : []))
    .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));

  const liveIds = new Set(live.map((p) => p.id));
  const revisions: RevisionItem[] = input.revisions
    .filter((r) => liveIds.has(r.projectId) && REVISION_WAITING_ON_ADMIN.includes(r.status))
    .map((r) => {
      const project = projectById.get(r.projectId)!;
      return {
        revisionId: r.id,
        projectId: r.projectId,
        projectTitle: project.title,
        clientName: clientName.get(project.clientId) ?? "Unknown client",
        round: r.round,
        status: r.status,
      };
    })
    .sort((a, b) => a.projectTitle.localeCompare(b.projectTitle) || a.round - b.round);

  return {
    today,
    earnedThisMonth,
    earnedThisYear,
    acceptedThisMonth,
    acceptedAllTime: acceptedAts.length,
    activeProjects: live.filter((p) => p.status === "active").length,
    pendingBalance,
    pipelineValue,
    winRate: winRate(input.prospects, now),
    earningsSeries: earningsSeries(taggedPayments, months),
    acceptedSeries: acceptedSeries(acceptedAts, months),
    attention: { overdue, followUps, revisions },
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
