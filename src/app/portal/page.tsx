import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ProgressBar } from "@/components/projects-core/progress-bar";
import { ProjectStatusBadge } from "@/components/projects-core/project-status-badge";
import { formatIsoDate } from "@/lib/dates";
import { listPortalProjects } from "@/server/data/projects";

export const metadata = { title: "Your projects" };

export default async function PortalHomePage() {
  const items = await listPortalProjects();

  return (
    <>
      <PageHeader title="Your projects" description="Progress, payments and agreements in one place." />
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
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map(({ project, progress }) => (
            <li key={project.id}>
              <Link
                href={`/portal/projects/${project.id}`}
                className="flex h-full flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 font-medium break-words">{project.title}</span>
                  <ProjectStatusBadge status={project.status} />
                </div>
                <ProgressBar value={progress} />
                {project.deadline ? <span className="text-xs text-muted-foreground">Due {formatIsoDate(project.deadline)}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
