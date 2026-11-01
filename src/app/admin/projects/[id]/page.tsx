import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { DetailGrid, DetailItem } from "@/components/common/detail";
import { InitialsAvatar } from "@/components/common/initials-avatar";
import { KindBadge } from "@/components/common/kind-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityList } from "@/components/activity/activity-list";
import { MilestoneChecklist } from "@/components/projects-core/milestone-checklist";
import { MilestoneEditor } from "@/components/projects-core/milestone-editor";
import { ProgressBar } from "@/components/projects-core/progress-bar";
import { ProjectArchiveButton, ProjectStatusControl } from "@/components/projects-core/project-controls";
import { ProjectEditDialog } from "@/components/projects-core/project-edit-dialog";
import { ProjectStatusBadge } from "@/components/projects-core/project-status-badge";
import { ProjectTabs } from "@/components/projects-core/project-tabs";
import { tabsFor, type ProjectTab } from "@/components/projects-core/tab-values";
import { PaymentsTab } from "@/components/projects/payments-tab";
import { AgreementTab } from "@/components/projects/agreement-tab";
import { RevisionsTab } from "@/components/projects/revisions-tab";
import { TimeLogTab } from "@/components/projects/time-log-tab";
import { TasksTab } from "@/components/projects/tasks-tab";
import { entryAmount, formatQuantity, fromHundredths, retainerMonths, taskTotals, UNIT_LABELS } from "@/lib/billing";
import { formatInstant, formatIsoDate, monthKeyOf, todayIso } from "@/lib/dates";
import { formatMoney, fromMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getProjectDetail } from "@/server/data/projects";
import { getAdminProjectPayments } from "@/server/data/payments";
import { listProjectActivity } from "@/server/data/activity";
import { isFlatUnit, type ProjectKind, type RateUnit } from "@/lib/types";
import { PeriodsTab } from "@/components/projects/periods-tab";
import { expectedMonthly } from "@/lib/engagement";

export const metadata = { title: "Project" };

function parseTab(value: string | string[] | undefined, kind: ProjectKind, unit: RateUnit | null): ProjectTab {
  const v = Array.isArray(value) ? value[0] : value;
  return tabsFor(kind, unit).find((t) => t.value === v)?.value ?? "overview";
}

function Fact({ label, children, hint, tone }: { label: string; children: React.ReactNode; hint?: React.ReactNode; tone?: "danger" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 shadow-xs">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-lg leading-tight font-semibold tracking-tight break-words tabular-nums", tone === "danger" && "text-destructive")}>
        {children}
      </dd>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default async function ProjectDetailPage({ params, searchParams }: PageProps<"/admin/projects/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { project, client, milestones, progress, inRevision } = await getProjectDetail(id);
  const tabs = tabsFor(project.kind, project.rateUnit);
  const tab = parseTab(sp.tab, project.kind, project.rateUnit);
  const archived = Boolean(project.archivedAt);
  const open = project.status !== "completed" && project.status !== "cancelled";
  const overdue = Boolean(project.deadline) && (project.deadline as string) < todayIso() && open;

  return (
    <>
      <PageHeader
        title={project.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {client ? (
              <Link
                href={`/admin/clients/${client.id}`}
                className="inline-flex items-center gap-2 font-medium text-foreground underline-offset-4 hover:underline"
              >
                <InitialsAvatar name={client.company || client.name} className="size-6 text-[0.625rem]" />
                {client.name}
              </Link>
            ) : (
              <span>Unknown client</span>
            )}
            <KindBadge kind={project.kind} />
            <ProjectStatusBadge status={project.status} />
            {inRevision ? (
              <Badge variant="warning" dot>
                In revision
              </Badge>
            ) : null}
            {archived ? <Badge variant="outline">Archived</Badge> : null}
          </span>
        }
        actions={
          <>
            <ProjectStatusControl projectId={project.id} status={project.status} />
            <ProjectEditDialog
              projectId={project.id}
              kind={project.kind}
              currency={project.currency}
              initial={{
                title: project.title,
                description: project.description,
                revisionAllowance: String(project.revisionAllowance),
                rateUnit: project.rateUnit ?? "hour",
                rate: project.rate ? fromMinor(project.rate) : "",
                startDate: project.startDate ?? "",
                deadline: project.deadline ?? "",
                endDate: project.endDate ?? "",
                hoursPerDay: fromHundredths(project.hoursPerDay),
                daysPerMonth: fromHundredths(project.daysPerMonth),
              }}
            />
            <ProjectArchiveButton projectId={project.id} archived={archived} />
          </>
        }
      />

      <ProjectTabs value={tab} tabs={tabs}>
        {tab === "overview" && project.kind === "fixed" ? (
          <div className="flex flex-col gap-6">
            <dl className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Fact label="Contract value">{formatMoney(project.contractValue, project.currency)}</Fact>
              <Fact
                label="Deadline"
                tone={overdue ? "danger" : undefined}
                hint={overdue ? "Past deadline" : project.startDate ? `Started ${formatIsoDate(project.startDate)}` : undefined}
              >
                {project.deadline ? formatIsoDate(project.deadline) : "Not set"}
              </Fact>
              <Fact label="Accepted">{project.acceptedAt ? formatInstant(project.acceptedAt, "d MMM yyyy") : "Not yet"}</Fact>
              <Fact label="Revision rounds" hint="Included in the contract">
                {project.revisionAllowance}
              </Fact>
            </dl>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Progress</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <ProgressBar value={progress} />
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">Milestones</h3>
                    <MilestoneEditor
                      projectId={project.id}
                      milestones={milestones.map((m) => ({ id: m.id, title: m.title, weight: m.weight }))}
                    />
                  </div>
                  <MilestoneChecklist
                    projectId={project.id}
                    milestones={milestones.map((m) => ({ id: m.id, title: m.title, weight: m.weight, done: m.done, doneAt: m.doneAt }))}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <p className="text-sm break-words whitespace-pre-wrap">
                    {project.description || <span className="text-muted-foreground">No description.</span>}
                  </p>
                  <DetailGrid className="sm:grid-cols-1 xl:grid-cols-2">
                    <DetailItem label="Start date">{project.startDate ? formatIsoDate(project.startDate) : "Not set"}</DetailItem>
                    <DetailItem label="Deadline">{project.deadline ? formatIsoDate(project.deadline) : "Not set"}</DetailItem>
                    <DetailItem label="Currency">{project.currency}</DetailItem>
                    <DetailItem label="Included revision rounds">{project.revisionAllowance}</DetailItem>
                  </DetailGrid>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
        {tab === "overview" && project.kind !== "fixed" ? <DerivedOverview projectId={project.id} /> : null}
        {tab === "time" ? <TimeLogTab projectId={project.id} /> : null}
        {tab === "periods" ? <PeriodsTab projectId={project.id} /> : null}
        {tab === "tasks" ? <TasksTab projectId={project.id} /> : null}
        {tab === "payments" ? <PaymentsTab projectId={project.id} /> : null}
        {tab === "agreement" ? <AgreementTab projectId={project.id} /> : null}
        {tab === "revisions" ? <RevisionsTab projectId={project.id} /> : null}
        {tab === "activity" ? <ActivityTabContent projectId={project.id} /> : null}
      </ProjectTabs>
    </>
  );
}

/** Overview for retainers and task projects: billing facts instead of contract value and milestones. */
async function DerivedOverview({ projectId }: { projectId: string }) {
  const { project, entries, tasks, finance } = await getAdminProjectPayments(projectId);
  const { currency } = project;
  const pendingText = finance.pending < 0 ? `Overpaid by ${formatMoney(-finance.pending, currency)}` : formatMoney(finance.pending, currency);
  const today = todayIso();

  const details = (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm break-words whitespace-pre-wrap">
          {project.description || <span className="text-muted-foreground">No description.</span>}
        </p>
        <DetailGrid className="sm:grid-cols-1 xl:grid-cols-2">
          <DetailItem label="Start date">{project.startDate ? formatIsoDate(project.startDate) : "Not set"}</DetailItem>
          {project.kind === "retainer" ? (
            <DetailItem label="Last day of service">{project.endDate ? formatIsoDate(project.endDate) : "Ongoing"}</DetailItem>
          ) : (
            <DetailItem label="Deadline">{project.deadline ? formatIsoDate(project.deadline) : "Not set"}</DetailItem>
          )}
          <DetailItem label="Currency">{project.currency}</DetailItem>
          {project.kind === "retainer" && project.rateUnit ? (
            <DetailItem label="Rate">
              {formatMoney(project.rate, currency)} per {UNIT_LABELS[project.rateUnit].singular}
            </DetailItem>
          ) : (
            <DetailItem label="Billing">{project.rate > 0 ? `Per task, when done (default ${formatMoney(project.rate, currency)})` : "Per task, when done"}</DetailItem>
          )}
          {project.kind === "retainer" && project.rateUnit ? (
            <>
              <DetailItem label="Working schedule">
                {fromHundredths(project.hoursPerDay)} h/day, {fromHundredths(project.daysPerMonth)} days/month
              </DetailItem>
              <DetailItem label="Expected per month">
                {formatMoney(expectedMonthly(project.rateUnit, project.rate, project.hoursPerDay, project.daysPerMonth), currency)}
              </DetailItem>
            </>
          ) : null}
        </DetailGrid>
      </CardContent>
    </Card>
  );

  if (project.kind === "retainer" && isFlatUnit(project.rateUnit)) {
    const unit = project.rateUnit;
    const recentLines = [...finance.lines].reverse().slice(0, 5);
    const currentLine = finance.lines.find((l) => l.inProgress);
    return (
      <div className="flex flex-col gap-6">
        <dl className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Fact label="Rate" hint={`Billed automatically each ${unit}`}>
            {formatMoney(project.rate, currency)} <span className="text-sm font-normal text-muted-foreground">per {unit}</span>
          </Fact>
          <Fact label={`This ${unit}`} hint={currentLine ? "In progress, due on its last day" : "Billing has ended"}>
            {formatMoney(currentLine?.amountDue ?? 0, currency)}
          </Fact>
          <Fact label="Billed so far" hint={`Paid ${formatMoney(finance.paid, currency)}`}>
            {formatMoney(finance.scheduleTotal, currency)}
          </Fact>
          <Fact label={finance.pending < 0 ? "Balance" : "Pending"} tone={finance.overdueAmount > 0 ? "danger" : undefined} hint={finance.overdueAmount > 0 ? `${formatMoney(finance.overdueAmount, currency)} overdue` : undefined}>
            {pendingText}
          </Fact>
        </dl>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>Recent billing periods</CardTitle>
              <Button variant="outline" size="sm" render={<Link href={`/admin/projects/${project.id}?tab=periods`} />}>
                Open billing periods
              </Button>
            </CardHeader>
            <CardContent>
              {recentLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing billed yet. The first {unit} is billed from the start date, in full.</p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {recentLines.map((l) => (
                    <li key={l.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 font-medium">{l.label}</span>
                      <span className="shrink-0 tabular-nums">{formatMoney(l.amountDue, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {details}
        </div>
      </div>
    );
  }

  if (project.kind === "retainer" && project.rateUnit) {
    const unit = project.rateUnit;
    const months = retainerMonths(entries, project.rate);
    const current = months.find((m) => m.month === monthKeyOf(today));
    const recent = entries.slice(0, 5);
    return (
      <div className="flex flex-col gap-6">
        <dl className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Fact label="Rate" hint={`Billed per ${UNIT_LABELS[unit].singular}, monthly in arrears`}>
            {formatMoney(project.rate, currency)}
          </Fact>
          <Fact
            label="This month"
            hint={current ? `${formatQuantity(current.quantityHundredths, unit)}, in progress` : "Nothing logged yet"}
          >
            {formatMoney(current?.amount ?? 0, currency)}
          </Fact>
          <Fact label="Billed so far" hint={`Paid ${formatMoney(finance.paid, currency)}`}>
            {formatMoney(finance.scheduleTotal, currency)}
          </Fact>
          <Fact label={finance.pending < 0 ? "Balance" : "Pending"} tone={finance.overdueAmount > 0 ? "danger" : undefined} hint={finance.overdueAmount > 0 ? `${formatMoney(finance.overdueAmount, currency)} overdue` : undefined}>
            {pendingText}
          </Fact>
        </dl>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>Recent time</CardTitle>
              <Button variant="outline" size="sm" render={<Link href={`/admin/projects/${project.id}?tab=time`} />}>
                Open time log
              </Button>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No time logged yet. Use the Time log tab to add the first entry.</p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {recent.map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium tabular-nums">{formatQuantity(e.quantityHundredths, unit)}</span>
                        <span className="ml-2 text-muted-foreground">{formatIsoDate(e.date)}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{formatMoney(entryAmount(e.quantityHundredths, project.rate), currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {details}
        </div>
      </div>
    );
  }

  const totals = taskTotals(tasks);
  const percent = totals.total === 0 ? 0 : Math.round((totals.doneCount / totals.total) * 100);
  const next = tasks.filter((t) => t.status === "todo").slice(0, 5);
  return (
    <div className="flex flex-col gap-6">
      <dl className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact label="Tasks done" hint={`${totals.todoCount} still to do`}>
          {totals.doneCount} of {totals.total}
        </Fact>
        <Fact label="Owed" hint="Billed when marked done">
          {formatMoney(totals.doneValue, currency)}
        </Fact>
        <Fact label="Paid">{formatMoney(finance.paid, currency)}</Fact>
        <Fact label={finance.pending < 0 ? "Balance" : "Pending"} tone={finance.overdueAmount > 0 ? "danger" : undefined} hint={finance.overdueAmount > 0 ? `${formatMoney(finance.overdueAmount, currency)} overdue` : undefined}>
          {pendingText}
        </Fact>
      </dl>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Progress</CardTitle>
            <Button variant="outline" size="sm" render={<Link href={`/admin/projects/${project.id}?tab=tasks`} />}>
              Open tasks
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <ProgressBar value={percent} label={`${totals.doneCount} of ${totals.total} tasks done`} />
            <div>
              <h3 className="mb-2 text-sm font-medium">Next up</h3>
              {next.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {totals.total === 0 ? "No tasks yet. Add the first one in the Tasks tab." : "Every task is done."}
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {next.map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 break-words">{t.title}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">{formatMoney(t.price, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
        {details}
      </div>
    </div>
  );
}

async function ActivityTabContent({ projectId }: { projectId: string }) {
  const items = await listProjectActivity(projectId, { clientOnly: false });
  return <ActivityList items={items} showVisibility />;
}
