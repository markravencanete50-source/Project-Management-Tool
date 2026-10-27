import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ProjectsList } from "@/components/projects-core/projects-list";
import { listProjects } from "@/server/data/projects";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const items = await listProjects();
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
        projects={items.map(({ project, clientName, progress }) => ({
          id: project.id,
          title: project.title,
          clientName,
          status: project.status,
          progress,
          deadline: project.deadline,
          archived: Boolean(project.archivedAt),
        }))}
      />
    </>
  );
}
