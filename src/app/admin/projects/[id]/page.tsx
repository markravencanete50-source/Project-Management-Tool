import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { DetailGrid, DetailItem } from "@/components/common/detail";
import { InitialsAvatar } from "@/components/common/initials-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityList } from "@/components/activity/activity-list";
import { MilestoneChecklist } from "@/components/projects-core/milestone-checklist";
import { MilestoneEditor } from "@/components/projects-core/milestone-editor";
import { ProgressBar } from "@/components/projects-core/progress-bar";
import { ProjectArchiveButton, ProjectStatusControl } from "@/components/projects-core/project-controls";
import { ProjectEditDialog } from "@/components/projects-core/project-edit-dialog";
import { ProjectStatusBadge } from "@/components/projects-core/project-status-badge";
import { ProjectTabs } from "@/components/projects-core/project-tabs";
import { PROJECT_TABS, type ProjectTab } from "@/components/projects-core/tab-values";
import { PaymentsTab } from "@/components/projects/payments-tab";
import { AgreementTab } from "@/components/projects/agreement-tab";
import { RevisionsTab } from "@/components/projects/revisions-tab";
import { formatInstant, formatIsoDate, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getProjectDetail } from "@/server/data/projects";
import { listProjectActivity } from "@/server/data/activity";

export const metadata = { title: "Project" };

function parseTab(value: string | string[] | undefined): ProjectTab {
  const v = Array.isArray(value) ? value[0] : value;
  return PROJECT_TABS.find((t) => t.value === v)?.value ?? "overview";
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
  const tab = parseTab(sp.tab);
  const { project, client, milestones, progress, inRevision } = await getProjectDetail(id);
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
              initial={{
                title: project.title,
                description: project.description,
                revisionAllowance: String(project.revisionAllowance),
                startDate: project.startDate ?? "",
                deadline: project.deadline ?? "",
              }}
            />
            <ProjectArchiveButton projectId={project.id} archived={archived} />
          </>
        }
      />

      <ProjectTabs value={tab}>
        {tab === "overview" ? (
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
        {tab === "payments" ? <PaymentsTab projectId={project.id} /> : null}
        {tab === "agreement" ? <AgreementTab projectId={project.id} /> : null}
        {tab === "revisions" ? <RevisionsTab projectId={project.id} /> : null}
        {tab === "activity" ? <ActivityTabContent projectId={project.id} /> : null}
      </ProjectTabs>
    </>
  );
}

async function ActivityTabContent({ projectId }: { projectId: string }) {
  const items = await listProjectActivity(projectId, { clientOnly: false });
  return <ActivityList items={items} showVisibility />;
}
