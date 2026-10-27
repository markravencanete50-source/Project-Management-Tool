import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ProjectCreateForm } from "@/components/projects-core/project-create-form";
import { listClientOptions } from "@/server/data/clients";
import { getSettings } from "@/server/data/settings";

export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/admin/projects/new">) {
  const sp = await searchParams;
  const clientParam = typeof sp.clientId === "string" ? sp.clientId : null;
  const [clients, settings] = await Promise.all([listClientOptions(), getSettings()]);

  return (
    <>
      <PageHeader title="New project" description="Projects start as drafts until the agreement is sent." />
      {clients.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Add a client first</EmptyTitle>
            <EmptyDescription>Every project belongs to a client.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/admin/clients" />}>Go to clients</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ProjectCreateForm
          clients={clients}
          initialClientId={clientParam}
          defaultRevisionAllowance={settings.defaultRevisionAllowance}
        />
      )}
    </>
  );
}
