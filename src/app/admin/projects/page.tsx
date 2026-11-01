import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ProjectsList } from "@/components/projects-core/projects-list";
import { todayIso } from "@/lib/dates";
import { listProjects } from "@/server/data/projects";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const items = await listProjects();
  const today = todayIso();
  return (
    <>
      <PageHeader
        title="Projects"
        description="Everything in flight and everything delivered."
        actions={
          <Button render={<Link href="/admin/projects/new" />}>
            <Plus data-icon="inline-start" />
            New project
          </Button>
        }
      />
      <ProjectsList
        projects={items.map(({ project, clientName, progress, tasksDone, tasksTotal }) => ({
          id: project.id,
          title: project.title,
          clientName,
          status: project.status,
          kind: project.kind,
          progress,
          tasksDone,
          tasksTotal,
          rate: project.rate,
          rateUnit: project.rateUnit,
          hoursPerDay: project.hoursPerDay,
          daysPerMonth: project.daysPerMonth,
          currency: project.currency,
          deadline: project.deadline,
          archived: Boolean(project.archivedAt),
          overdue:
            Boolean(project.deadline) &&
            (project.deadline as string) < today &&
            project.status !== "completed" &&
            project.status !== "cancelled",
        }))}
      />
    </>
  );
}
