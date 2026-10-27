import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
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
import { formatInstant, formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getProjectDetail } from "@/server/data/projects";
import { listProjectActivity } from "@/server/data/activity";

export const metadata = { title: "Project" };

function parseTab(value: string | string[] | undefined): ProjectTab {
  const v = Array.isArray(value) ? value[0] : value;
  return PROJECT_TABS.find((t) => t.value === v)?.value ?? "overview";
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

export default async function ProjectDetailPage({ params, searchParams }: PageProps<"/admin/projects/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tab = parseTab(sp.tab);
  const { project, client, milestones, progress, inRevision } = await getProjectDetail(id);
  const archived = Boolean(project.archivedAt);

  return (
    <>
      <PageHeader
        title={project.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {client ? (
              <Link href={`/admin/clients/${client.id}`} className="text-foreground underline-offset-4 hover:underline">
                {client.name}
              </Link>
            ) : (
              <span>Unknown client</span>
            )}
            <ProjectStatusBadge status={project.status} />
            {inRevision ? <Badge variant="secondary">In revision</Badge> : null}
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
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm break-words whitespace-pre-wrap">
                  {project.description || <span className="text-muted-foreground">No description.</span>}
                </p>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Detail label="Start date">{project.startDate ? formatIsoDate(project.startDate) : "Not set"}</Detail>
                  <Detail label="Deadline">{project.deadline ? formatIsoDate(project.deadline) : "Not set"}</Detail>
                  <Detail label="Contract value">{formatMoney(project.contractValue, project.currency)}</Detail>
                  <Detail label="Included revision rounds">{project.revisionAllowance}</Detail>
                  <Detail label="Accepted">{project.acceptedAt ? formatInstant(project.acceptedAt, "d MMM yyyy") : "Not yet"}</Detail>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Progress</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
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
