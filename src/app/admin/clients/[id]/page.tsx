import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ClientActions } from "@/components/clients/client-actions";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { ProjectStatusBadge } from "@/components/projects-core/project-status-badge";
import { formatMoney } from "@/lib/money";
import { formatInstant, formatIsoDate } from "@/lib/dates";
import { getClient } from "@/server/data/clients";
import { listClientProjects } from "@/server/data/projects";

export const metadata = { title: "Client" };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

export default async function ClientDetailPage({ params }: PageProps<"/admin/clients/[id]">) {
  const { id } = await params;
  const [client, projects] = await Promise.all([getClient(id), listClientProjects(id)]);
  const archived = Boolean(client.archivedAt);

  return (
    <>
      <PageHeader
        title={client.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {client.company || "No company"}
            {archived ? <Badge variant="outline">Archived</Badge> : null}
          </span>
        }
        actions={
          <>
            <ClientFormDialog
              client={{
                id: client.id,
                name: client.name,
                company: client.company,
                email: client.email,
                defaultCurrency: client.defaultCurrency,
                notes: client.notes,
              }}
            />
            <ClientActions clientId={client.id} archived={archived} />
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Email">{client.email}</Detail>
              <Detail label="Default currency">{client.defaultCurrency}</Detail>
              <Detail label="Portal access">{client.authUid ? "Has signed in" : "Not signed in yet"}</Detail>
              <Detail label="Added">{formatInstant(client.createdAt, "d MMM yyyy")}</Detail>
              <div className="sm:col-span-2">
                <Detail label="Notes">
                  {client.notes ? <span className="whitespace-pre-wrap">{client.notes}</span> : <span className="text-muted-foreground">None</span>}
                </Detail>
              </div>
            </dl>
          </CardContent>
        </Card>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Projects</h2>
            {archived ? null : (
              <Button render={<Link href={`/admin/projects/new?clientId=${client.id}`} />} size="sm">
                <Plus data-icon="inline-start" />
                New project
              </Button>
            )}
          </div>
          {projects.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderKanban />
                </EmptyMedia>
                <EmptyTitle>No projects yet</EmptyTitle>
                <EmptyDescription>Create a project for this client to start tracking work.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map(({ project, progress }) => (
                <li key={project.id}>
                  <Link
                    href={`/admin/projects/${project.id}`}
                    className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{project.title}</span>
                      <span className="flex items-center gap-2">
                        {project.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
                        <ProjectStatusBadge status={project.status} />
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{progress}% complete</span>
                      <span>{formatMoney(project.contractValue, project.currency)}</span>
                      {project.deadline ? <span>Due {formatIsoDate(project.deadline)}</span> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
