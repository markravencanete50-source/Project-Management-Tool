import Link from "next/link";
import { ArrowLeft, CalendarDays, Check, Circle } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ActivityList } from "@/components/activity/activity-list";
import { AnimatedBar } from "@/components/motion/animated-bar";
import { ProjectStatusBadge } from "@/components/projects-core/project-status-badge";
import { PortalPaymentsSection } from "@/components/portal/payments-section";
import { PortalAgreementSection } from "@/components/portal/agreement-section";
import { PortalRevisionsSection } from "@/components/portal/revisions-section";
import { PortalTasksSection } from "@/components/portal/tasks-section";
import { KindBadge } from "@/components/common/kind-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatInstant, formatIsoDate } from "@/lib/dates";
import { progress } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { getAccessibleProject } from "@/server/data/access";
import { listMilestones } from "@/server/data/milestones";
import { listProjectActivity } from "@/server/data/activity";

export const metadata = { title: "Project" };

export default async function PortalProjectPage({ params }: PageProps<"/portal/projects/[id]">) {
  const { id } = await params;
  const { project } = await getAccessibleProject(id);
  const fixed = project.kind === "fixed";
  const [milestones, activity] = await Promise.all([
    fixed ? listMilestones(project.id) : Promise.resolve([]),
    listProjectActivity(project.id, { clientOnly: true }),
  ]);

  const percent = Math.round(progress(milestones));
  const doneCount = milestones.filter((m) => m.done).length;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/portal" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-3 -ml-2")}>
          <ArrowLeft data-icon="inline-start" />
          All projects
        </Link>
        <PageHeader
          title={project.title}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {fixed ? null : <KindBadge kind={project.kind} />}
              <ProjectStatusBadge status={project.status} />
              {project.deadline ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" aria-hidden />
                  Due {formatIsoDate(project.deadline)}
                </span>
              ) : null}
            </span>
          }
        />
        {project.description ? (
          <p className="-mt-3 text-base leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">{project.description}</p>
        ) : null}
      </div>

      {fixed ? (
      <section className="flex flex-col gap-4" aria-labelledby="portal-progress">
        <h2 id="portal-progress" className="text-xl font-semibold tracking-tight">
          Progress
        </h2>
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl leading-none font-semibold tracking-tight tabular-nums">{percent}%</p>
              <p className="mt-2 text-base text-muted-foreground">
                {milestones.length === 0
                  ? "Milestones will be listed here once they are set up."
                  : percent === 100
                    ? "All done. Thank you for working with us."
                    : `${doneCount} of ${milestones.length} milestone${milestones.length === 1 ? "" : "s"} complete`}
              </p>
            </div>
          </div>
          <AnimatedBar value={percent} label="Project progress" className="h-3" />
        </div>

        {milestones.length > 0 ? (
          <ul className="stagger flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border bg-card shadow-xs [--stagger:30ms]">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3.5">
                {m.done ? (
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success/12 text-success">
                    <Check className="size-3.5" aria-label="Done" />
                  </span>
                ) : (
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Circle className="size-3" aria-label="Not done" />
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("text-base break-words", m.done ? "font-medium" : "text-foreground")}>{m.title}</span>
                  {m.done && m.doneAt ? (
                    <span className="text-sm text-muted-foreground">Completed {formatInstant(m.doneAt, "d MMM yyyy")}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">{m.done ? "Completed" : "In the works"}</span>
                  )}
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">{m.weight}%</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      ) : null}

      <PortalTasksSection projectId={project.id} />
      <PortalPaymentsSection projectId={project.id} />
      {fixed ? <PortalAgreementSection projectId={project.id} /> : null}
      {fixed ? <PortalRevisionsSection projectId={project.id} /> : null}

      <section className="flex flex-col gap-4" aria-labelledby="portal-activity">
        <div>
          <h2 id="portal-activity" className="text-xl font-semibold tracking-tight">
            Activity
          </h2>
          <p className="mt-1 text-base text-muted-foreground">Recent updates on your project.</p>
        </div>
        <ActivityList items={activity} actorLabels={{ admin: "Team", client: "You", system: "Update" }} />
      </section>
    </div>
  );
}
