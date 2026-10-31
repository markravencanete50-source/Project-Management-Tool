// Pure dashboard aggregation. No server imports, so it can be unit tested and
// reused anywhere. Everything is computed on read from source documents.
import { formatInTimeZone } from "date-fns-tz";
import { addDaysIso, formatMonthKey, lastNMonths, monthKeyOf, monthKeyOfInstant, todayIso, type IsoDate, type MonthKey } from "@/lib/dates";
import { derivedBillLines, financeFor } from "@/lib/billing";
import { earningsByMonth } from "@/lib/finance";
import { convertMoney, DISPLAY_CURRENCY, type RateTable } from "@/lib/fx/convert";
import { addMoney, CURRENCIES, type Currency, type MoneyByCurrency } from "@/lib/money";
import { REVISION_WAITING_ON_ADMIN } from "@/lib/projects";
import type { Project, ProjectStatus, Prospect, RevisionStatus, ScheduleLine, Task, TimeEntry } from "@/lib/types";

export const WIN_RATE_DAYS = 90;
export const CHART_MONTHS = 12;
export const CHART_WEEKS = 12;

export type DashProject = Pick<
  Project,
  "id" | "clientId" | "title" | "status" | "currency" | "contractValue" | "acceptedAt" | "archivedAt"
> &
  // Absent on documents written before engagement kinds: those are fixed projects.
  Partial<Pick<Project, "kind" | "rate" | "rateUnit">>;
export type DashProspect = Pick<
  Prospect,
  "id" | "name" | "company" | "stage" | "estimatedValue" | "currency" | "nextFollowUp" | "closedAt" | "archivedAt"
> &
  // Absent on prospects written before engagement kinds: those are fixed.
  Partial<Pick<Prospect, "engagementKind">>;
export type DashPayment = { projectId: string; amount: number; paidOn: IsoDate };
export type DashScheduleLine = ScheduleLine & { projectId: string };
export type DashTimeEntry = Pick<TimeEntry, "date" | "quantityHundredths"> & { projectId: string };
export type DashTask = Pick<Task, "id" | "title" | "price" | "status" | "order" | "doneAt"> & { projectId: string };
export type DashRevision = { id: string; projectId: string; round: number; status: RevisionStatus };

export type DashboardInput = {
  /** Every project, archived included, so archiving never erases earnings history. */
  projects: DashProject[];
  clients: { id: string; name: string }[];
  prospects: DashProspect[];
  payments: DashPayment[];
  schedule: DashScheduleLine[];
  revisions: DashRevision[];
  /** Retainer time entries and task documents. Optional so fixed-only callers need not pass them. */
  timeEntries?: DashTimeEntry[];
  tasks?: DashTask[];
  /** Exchange rates to PHP. When given, the result also carries a converted PHP view. */
  rates?: RateTable | null;
  /** The caller tried to get rates and could not: the page shows the notice and original currencies. */
  ratesUnavailable?: boolean;
  now?: Date;
};

/** Week buckets are keyed by their Monday (a Manila calendar date). */
export type WeekKey = IsoDate;

export type Trend = "up" | "down" | "flat" | "new";
/** Current period against the one before it, plus window totals. Amounts are minor units (or counts). */
export type PeriodSummary = {
  current: number;
  previous: number;
  /** Fractional change (0.12 is +12%). Null when there is no previous value to compare with. */
  pct: number | null;
  trend: Trend;
  total: number;
  average: number;
  best: { label: string; amount: number } | null;
};

type PointLabels = {
  /** Compact label, same as axisLabel for weeks. */
  label: string;
  /** Label for the chart axis. */
  axisLabel: string;
  /** Full label for tooltips and screen readers. */
  longLabel: string;
};

export type EarningsPoint = PointLabels & { month: MonthKey; amount: number; cumulative: number };
export type EarningsSeries = { currency: Currency; points: EarningsPoint[]; summary: PeriodSummary };
export type WeeklyEarningsPoint = PointLabels & { week: WeekKey; amount: number; cumulative: number };
export type WeeklyEarningsSeries = { currency: Currency; points: WeeklyEarningsPoint[]; summary: PeriodSummary };
export type AcceptedPoint = PointLabels & { month: MonthKey; count: number };

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

/**
 * Everything the PHP view shows. Every figure is converted at the CURRENT rate,
 * including old payments (a display conversion, not the rate on the payment
 * day). Conversion happens per bucket (one currency in one period) and the
 * rounded buckets are summed, so a chart's bars add up to its totals.
 */
export type ConvertedDashboard = {
  rates: RateTable;
  earnedThisMonth: number;
  earnedThisYear: number;
  pendingBalance: number;
  pipelineValue: number;
  recurringBilledThisMonth: number;
  /** Zero or one series, in PHP. */
  earningsSeries: EarningsSeries[];
  weeklyEarningsSeries: WeeklyEarningsSeries[];
};

export type DashboardData = {
  today: IsoDate;
  earnedThisMonth: MoneyByCurrency;
  earnedThisYear: MoneyByCurrency;
  acceptedThisMonth: number;
  acceptedAllTime: number;
  activeProjects: number;
  pendingBalance: MoneyByCurrency;
  /** Retainer bill lines due in the current Manila month (in progress included), per currency. */
  recurringBilledThisMonth: MoneyByCurrency;
  /** Live retainers that are active, for the card hint. */
  activeRetainers: number;
  pipelineValue: MoneyByCurrency;
  /** True when at least one open prospect is a retainer, whose value is monthly. */
  pipelineIncludesRetainers: boolean;
  /** The PHP view, or null when no rates were given. */
  converted: ConvertedDashboard | null;
  /** Rates were wanted but could not be fetched. */
  fxUnavailable: boolean;
  winRate: { won: number; lost: number; rate: number | null };
  /** Last 12 months per currency, oldest first. */
  earningsSeries: EarningsSeries[];
  /** Last 12 weeks (Monday start, Asia/Manila) for the same currencies, oldest first. */
  weeklyEarningsSeries: WeeklyEarningsSeries[];
  acceptedSeries: AcceptedPoint[];
  acceptedSummary: PeriodSummary;
  attention: { overdue: OverdueItem[]; followUps: FollowUpItem[]; revisions: RevisionItem[] };
};

const BALANCE_STATUSES: ProjectStatus[] = ["active", "on_hold"];
/** Projects whose unpaid, past-due lines are worth chasing. */
const CHASE_STATUSES: ProjectStatus[] = ["active", "on_hold", "completed"];

export function monthLabel(month: MonthKey): string {
  return formatMonthKey(month, "MMM yy");
}

/** "Oct" for most months, "Jan '27" for January and for the first bucket so the year is never lost. */
function monthAxisLabel(month: MonthKey, index: number): string {
  const short = formatMonthKey(month, "MMM");
  return month.endsWith("-01") || index === 0 ? `${short} '${month.slice(2, 4)}` : short;
}

// ---------------------------------------------------------------- weeks

/**
 * The Monday of the week containing a Manila calendar date. A payment's paidOn
 * is already a Manila date, so a payment dated Sunday belongs to the week that
 * ends that day and one dated Monday starts the next.
 */
export function weekStartOf(date: IsoDate): WeekKey {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  return addDaysIso(date, -((dow + 6) % 7));
}

/** Monday of the Manila week an instant falls in (Sunday 23:59 is the old week, Monday 00:00 the new one). */
export function weekStartOfInstant(instant: Date): WeekKey {
  return weekStartOf(todayIso(instant));
}

/** The last n week keys ending with the current Manila week, oldest first. */
export function lastNWeeks(n: number, now: Date = new Date()): WeekKey[] {
  const current = weekStartOfInstant(now);
  return Array.from({ length: n }, (_, i) => addDaysIso(current, -7 * (n - 1 - i)));
}

/** Payments grouped by the Monday of their paidOn week, per currency. Same rule as earningsByMonth. */
export function earningsByWeek(
  payments: { amount: number; paidOn: IsoDate; currency: Currency }[],
): Map<WeekKey, MoneyByCurrency> {
  const out = new Map<WeekKey, MoneyByCurrency>();
  for (const p of payments) {
    const key = weekStartOf(p.paidOn);
    addMoney(out.get(key) ?? out.set(key, {}).get(key)!, p.currency, p.amount);
  }
  return out;
}

function fmtDay(date: IsoDate, pattern: string): string {
  return formatInTimeZone(new Date(`${date}T12:00:00Z`), "UTC", pattern);
}

export function weekAxisLabel(week: WeekKey): string {
  return fmtDay(week, "d MMM");
}

/** "19 Oct to 25 Oct 2026", with the year on both ends when the week crosses New Year. */
export function weekLongLabel(week: WeekKey): string {
  const end = addDaysIso(week, 6);
  return week.slice(0, 4) === end.slice(0, 4)
    ? `${fmtDay(week, "d MMM")} to ${fmtDay(end, "d MMM yyyy")}`
    : `${fmtDay(week, "d MMM yyyy")} to ${fmtDay(end, "d MMM yyyy")}`;
}

/** Whole days from one calendar date to another (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// ------------------------------------------------------------- summaries

/** Change from `previous` to `current`. A jump from nothing is "new" rather than an infinite percentage. */
export function periodDelta(current: number, previous: number): { pct: number | null; trend: Trend } {
  if (previous === 0) return current === 0 ? { pct: null, trend: "flat" } : { pct: null, trend: "new" };
  const pct = (current - previous) / previous;
  if (Math.round(pct * 1000) === 0) return { pct, trend: "flat" };
  return { pct, trend: pct > 0 ? "up" : "down" };
}

/**
 * Totals for a window of periods, oldest first. The last point is the current
 * (usually still partial) period and the one before it is what it is compared with.
 */
export function summarizePeriods(points: { amount: number; longLabel: string }[]): PeriodSummary {
  const current = points.at(-1)?.amount ?? 0;
  const previous = points.length > 1 ? points[points.length - 2].amount : 0;
  const total = points.reduce((sum, p) => sum + p.amount, 0);
  let best: PeriodSummary["best"] = null;
  for (const p of points) {
    if (p.amount > 0 && (best === null || p.amount >= best.amount)) best = { label: p.longLabel, amount: p.amount };
  }
  return {
    current,
    previous,
    ...periodDelta(current, previous),
    total,
    average: points.length ? total / points.length : 0,
    best,
  };
}

function runningTotals(amounts: number[]): number[] {
  let sum = 0;
  return amounts.map((a) => (sum += a));
}

function monthlyPoints(months: MonthKey[], amounts: number[]): EarningsPoint[] {
  const cumulative = runningTotals(amounts);
  return months.map((month, i) => ({
    month,
    label: monthLabel(month),
    axisLabel: monthAxisLabel(month, i),
    longLabel: formatMonthKey(month, "MMMM yyyy"),
    amount: amounts[i],
    cumulative: cumulative[i],
  }));
}

function weeklyPoints(weeks: WeekKey[], amounts: number[]): WeeklyEarningsPoint[] {
  const cumulative = runningTotals(amounts);
  return weeks.map((week, i) => ({
    week,
    label: weekAxisLabel(week),
    axisLabel: weekAxisLabel(week),
    longLabel: weekLongLabel(week),
    amount: amounts[i],
    cumulative: cumulative[i],
  }));
}

/**
 * Earnings per month for a window, one series per currency that has any payment in it.
 * `include` forces currencies in (zero filled) so two views of the same data show the same cards.
 */
export function earningsSeries(
  payments: { amount: number; paidOn: IsoDate; currency: Currency }[],
  months: MonthKey[],
  include: Currency[] = [],
): EarningsSeries[] {
  const byMonth = earningsByMonth(payments);
  const out: EarningsSeries[] = [];
  for (const currency of CURRENCIES) {
    const amounts = months.map((month) => byMonth.get(month)?.[currency] ?? 0);
    if (!amounts.some((a) => a !== 0) && !include.includes(currency)) continue;
    const points = monthlyPoints(months, amounts);
    out.push({ currency, points, summary: summarizePeriods(points) });
  }
  return out;
}

/** Earnings per Manila week (Monday start) for a window, one series per currency, zero filled. */
export function weeklyEarningsSeries(
  payments: { amount: number; paidOn: IsoDate; currency: Currency }[],
  weeks: WeekKey[],
  include: Currency[] = [],
): WeeklyEarningsSeries[] {
  const byWeek = earningsByWeek(payments);
  const out: WeeklyEarningsSeries[] = [];
  for (const currency of CURRENCIES) {
    const amounts = weeks.map((week) => byWeek.get(week)?.[currency] ?? 0);
    if (!amounts.some((a) => a !== 0) && !include.includes(currency)) continue;
    const points = weeklyPoints(weeks, amounts);
    out.push({ currency, points, summary: summarizePeriods(points) });
  }
  return out;
}

/**
 * The same monthly earnings as one PHP series. Each month's per-currency
 * bucket is converted and rounded on its own, then the buckets are summed.
 * No series is returned when every month is zero.
 */
export function convertedEarningsSeries(
  payments: { amount: number; paidOn: IsoDate; currency: Currency }[],
  months: MonthKey[],
  rates: RateTable,
): EarningsSeries[] {
  const byMonth = earningsByMonth(payments);
  const amounts = months.map((month) => convertMoney(byMonth.get(month) ?? {}, rates));
  if (!amounts.some((a) => a !== 0)) return [];
  const points = monthlyPoints(months, amounts);
  return [{ currency: DISPLAY_CURRENCY, points, summary: summarizePeriods(points) }];
}

/** Weekly twin of convertedEarningsSeries. */
export function convertedWeeklyEarningsSeries(
  payments: { amount: number; paidOn: IsoDate; currency: Currency }[],
  weeks: WeekKey[],
  rates: RateTable,
): WeeklyEarningsSeries[] {
  const byWeek = earningsByWeek(payments);
  const amounts = weeks.map((week) => convertMoney(byWeek.get(week) ?? {}, rates));
  if (!amounts.some((a) => a !== 0)) return [];
  const points = weeklyPoints(weeks, amounts);
  return [{ currency: DISPLAY_CURRENCY, points, summary: summarizePeriods(points) }];
}

export function acceptedSeries(acceptedAts: Date[], months: MonthKey[]): AcceptedPoint[] {
  const counts = new Map<MonthKey, number>();
  for (const d of acceptedAts) {
    const key = monthKeyOfInstant(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return months.map((month, i) => ({
    month,
    label: monthLabel(month),
    axisLabel: monthAxisLabel(month, i),
    longLabel: formatMonthKey(month, "MMMM yyyy"),
    count: counts.get(month) ?? 0,
  }));
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
  const weeks = lastNWeeks(CHART_WEEKS, now);

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

  const entriesBy = groupBy(input.timeEntries ?? [], (e) => e.projectId);
  const tasksBy = groupBy(input.tasks ?? [], (t) => t.projectId);

  const pendingBalance: MoneyByCurrency = {};
  const recurringBilledThisMonth: MoneyByCurrency = {};
  const overdue: OverdueItem[] = [];
  for (const project of live) {
    const kind = project.kind ?? "fixed";
    const finance = financeFor({
      project: { kind, contractValue: project.contractValue, rate: project.rate ?? 0, rateUnit: project.rateUnit ?? null },
      schedule: scheduleBy.get(project.id) ?? [],
      entries: entriesBy.get(project.id) ?? [],
      tasks: tasksBy.get(project.id) ?? [],
      payments: paymentsBy.get(project.id) ?? [],
      today,
    });
    // Fixed projects keep their original rule. Billed work on a retainer or task
    // project is owed even once the engagement has ended, so completed counts too.
    const balanceStatuses = kind === "fixed" ? BALANCE_STATUSES : [...BALANCE_STATUSES, "completed" as const];
    if (balanceStatuses.includes(project.status) && finance.pending > 0) {
      addMoney(pendingBalance, project.currency, finance.pending);
    }
    if (kind === "retainer" && project.status !== "cancelled") {
      const lines = derivedBillLines(
        { kind, rate: project.rate ?? 0, rateUnit: project.rateUnit ?? null },
        { entries: entriesBy.get(project.id) ?? [], tasks: [] },
        today,
      );
      for (const l of lines) if (monthKeyOf(l.dueDate) === thisMonth) addMoney(recurringBilledThisMonth, project.currency, l.amountDue);
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
  // A retainer prospect's estimatedValue is a monthly amount. It is summed like any other
  // value (unweighted), and the card says so when one is in the pipeline.
  const pipelineValue: MoneyByCurrency = {};
  for (const p of openProspects) addMoney(pipelineValue, p.currency, p.estimatedValue);
  const pipelineIncludesRetainers = openProspects.some((p) => p.engagementKind === "retainer" && p.estimatedValue > 0);

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

  const monthly = earningsSeries(taggedPayments, months);
  // The 12 week window sits inside the 12 month one, so the monthly list holds every currency.
  const weekly = weeklyEarningsSeries(taggedPayments, weeks, monthly.map((s) => s.currency));
  const accepted = acceptedSeries(acceptedAts, months);

  let converted: ConvertedDashboard | null = null;
  if (input.rates) {
    const rates = input.rates;
    // The year is the sum of its converted monthly buckets, so it equals the chart's running total.
    let earnedYear = 0;
    for (const [month, money] of byMonth) if (month.startsWith(thisYear)) earnedYear += convertMoney(money, rates);
    converted = {
      rates,
      earnedThisMonth: convertMoney(earnedThisMonth, rates),
      earnedThisYear: earnedYear,
      pendingBalance: convertMoney(pendingBalance, rates),
      pipelineValue: convertMoney(pipelineValue, rates),
      recurringBilledThisMonth: convertMoney(recurringBilledThisMonth, rates),
      earningsSeries: convertedEarningsSeries(taggedPayments, months, rates),
      weeklyEarningsSeries: convertedWeeklyEarningsSeries(taggedPayments, weeks, rates),
    };
  }

  return {
    today,
    earnedThisMonth,
    earnedThisYear,
    acceptedThisMonth,
    acceptedAllTime: acceptedAts.length,
    activeProjects: live.filter((p) => p.status === "active").length,
    pendingBalance,
    recurringBilledThisMonth,
    activeRetainers: live.filter((p) => p.kind === "retainer" && p.status === "active").length,
    pipelineValue,
    pipelineIncludesRetainers,
    converted,
    fxUnavailable: input.ratesUnavailable ?? (input.rates === null),
    winRate: winRate(input.prospects, now),
    earningsSeries: monthly,
    weeklyEarningsSeries: weekly,
    acceptedSeries: accepted,
    acceptedSummary: summarizePeriods(accepted.map((p) => ({ amount: p.count, longLabel: p.longLabel }))),
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
