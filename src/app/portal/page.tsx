import Link from "next/link";
import { CalendarDays, FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { AnimatedBar } from "@/components/motion/animated-bar";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ProjectStatusBadge } from "@/components/projects-core/project-status-badge";
import { formatIsoDate } from "@/lib/dates";
import { KindBadge } from "@/components/common/kind-badge";
import { UNIT_LABELS } from "@/lib/billing";
import { formatMoney } from "@/lib/money";
import { listPortalProjects } from "@/server/data/projects";

export const metadata = { title: "Your projects" };

export default async function PortalHomePage() {
  const items = await listPortalProjects();

  return (
    <>
      <PageHeader
        eyebrow="Welcome back"
        title="Your projects"
        description="Progress, payments and agreements in one place. Open a project to see the details."
      />
      {items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderKanban />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>Your projects will appear here once they are ready to share.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="stagger grid gap-4 sm:grid-cols-2">
          {items.map(({ project, progress, tasksDone, tasksTotal }) => (
            <li key={project.id} className="min-w-0">
              <div className="card-interactive relative flex h-full flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/portal/projects/${project.id}`}
                    className="min-w-0 rounded-sm text-lg leading-snug font-semibold tracking-tight break-words outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                  >
                    {project.title}
                  </Link>
                  <ProjectStatusBadge status={project.status} />
                </div>
                {project.kind === "fixed" ? null : (
                  <div>
                    <KindBadge kind={project.kind} />
                  </div>
                )}
                {project.kind === "retainer" ? (
                  <p className="mt-auto text-sm text-muted-foreground">
                    Billed monthly at{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatMoney(project.rate, project.currency)} per {UNIT_LABELS[project.rateUnit ?? "hour"].singular}
                    </span>
                  </p>
                ) : (
                  <div className="mt-auto flex flex-col gap-2">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">{project.kind === "tasks" ? "Tasks done" : "Progress"}</span>
                      <span className="font-semibold tabular-nums">
                        {project.kind === "tasks" ? `${tasksDone} of ${tasksTotal}` : `${Math.round(progress)}%`}
                      </span>
                    </div>
                    <AnimatedBar value={progress} label={`Progress for ${project.title}`} />
                  </div>
                )}
                {project.deadline ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="size-4" aria-hidden />
                    Due {formatIsoDate(project.deadline)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
