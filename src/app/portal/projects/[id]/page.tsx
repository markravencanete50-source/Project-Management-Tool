import Link from "next/link";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ActivityList } from "@/components/activity/activity-list";
import { ProgressBar } from "@/components/projects-core/progress-bar";
import { ProjectStatusBadge } from "@/components/projects-core/project-status-badge";
import { PortalPaymentsSection } from "@/components/portal/payments-section";
import { PortalAgreementSection } from "@/components/portal/agreement-section";
import { PortalRevisionsSection } from "@/components/portal/revisions-section";
import { formatInstant, formatIsoDate } from "@/lib/dates";
import { progress } from "@/lib/projects";
import { getAccessibleProject } from "@/server/data/access";
import { listMilestones } from "@/server/data/milestones";
import { listProjectActivity } from "@/server/data/activity";

export const metadata = { title: "Project" };

export default async function PortalProjectPage({ params }: PageProps<"/portal/projects/[id]">) {
  const { id } = await params;
  const { project } = await getAccessibleProject(id);
  const [milestones, activity] = await Promise.all([
    listMilestones(project.id),
    listProjectActivity(project.id, { clientOnly: true }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/portal" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          All projects
        </Link>
        <PageHeader
          title={project.title}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <ProjectStatusBadge status={project.status} />
              {project.deadline ? <span>Due {formatIsoDate(project.deadline)}</span> : null}
            </span>
          }
        />
        {project.description ? <p className="-mt-3 text-sm break-words whitespace-pre-wrap text-muted-foreground">{project.description}</p> : null}
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="portal-progress">
        <h2 id="portal-progress" className="text-base font-semibold">
          Progress
        </h2>
        <ProgressBar value={progress(milestones)} />
        {milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Milestones will be listed here once they are set up.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                {m.done ? (
                  <Check className="size-4 shrink-0 text-primary" aria-label="Done" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="Not done" />
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm break-words">{m.title}</span>
                  {m.done && m.doneAt ? (
                    <span className="text-xs text-muted-foreground">Completed {formatInstant(m.doneAt, "d MMM yyyy")}</span>
                  ) : null}
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">{m.weight}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PortalPaymentsSection projectId={project.id} />
      <PortalAgreementSection projectId={project.id} />
      <PortalRevisionsSection projectId={project.id} />

      <section className="flex flex-col gap-4" aria-labelledby="portal-activity">
        <h2 id="portal-activity" className="text-base font-semibold">
          Activity
        </h2>
        <ActivityList items={activity} actorLabels={{ admin: "Team", client: "You", system: "Update" }} />
      </section>
    </div>
  );
}
