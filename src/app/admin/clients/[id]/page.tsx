import Link from "next/link";
import { CalendarClock, FolderKanban, Plus } from "lucide-react";
import { InitialsAvatar } from "@/components/common/initials-avatar";
import { DetailGrid, DetailItem } from "@/components/common/detail";
import { SectionHeader } from "@/components/common/section-header";
import { AnimatedBar } from "@/components/motion/animated-bar";
import { Badge } from "@/components/ui/badge";
import { KindBadge } from "@/components/common/kind-badge";
import { RateWithMonthly } from "@/components/common/rate-with-monthly";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ClientActions } from "@/components/clients/client-actions";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { ProjectStatusBadge } from "@/components/projects-core/project-status-badge";
import { formatMoney } from "@/lib/money";
import { formatInstant, formatIsoDate } from "@/lib/dates";
import { getClient } from "@/server/data/clients";
import { listClientProjects } from "@/server/data/projects";
import { listStandaloneForClient } from "@/server/data/standalone-payments";
import { listExpenseLinesForClient } from "@/server/data/expenses";
import { CATEGORY_LABELS, RECURRING_LABELS } from "@/components/expenses/labels";
import { expenseTotals } from "@/lib/expenses";
import { METHOD_LABELS } from "@/components/payments/labels";
import { currenciesIn } from "@/lib/money";
import { ledgerTotals } from "@/lib/standalone-payments";

export const metadata = { title: "Client" };

export default async function ClientDetailPage({ params }: PageProps<"/admin/clients/[id]">) {
  const { id } = await params;
  const [client, projects, standalone, expenseLines] = await Promise.all([
    getClient(id),
    listClientProjects(id),
    listStandaloneForClient(id),
    listExpenseLinesForClient(id),
  ]);
  const standaloneTotals = ledgerTotals(standalone);
  const expenseSum = expenseTotals(expenseLines);
  const archived = Boolean(client.archivedAt);

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between md:mb-8">
        <div className="flex min-w-0 items-center gap-4">
          <InitialsAvatar name={client.company || client.name} className="size-14 text-base" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl leading-tight font-semibold tracking-tight break-words sm:text-[1.75rem]">{client.name}</h1>
              {archived ? <Badge variant="outline">Archived</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground break-words">{client.company || "No company"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <Card className="enter">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid>
              <DetailItem label="Email">{client.email}</DetailItem>
              <DetailItem label="Default currency">{client.defaultCurrency}</DetailItem>
              <DetailItem label="Portal access">
                {client.authUid ? (
                  <Badge variant="success" dot>
                    Has signed in
                  </Badge>
                ) : (
                  <Badge variant="outline" dot>
                    Not signed in yet
                  </Badge>
                )}
              </DetailItem>
              <DetailItem label="Added">{formatInstant(client.createdAt, "d MMM yyyy")}</DetailItem>
              <DetailItem label="Notes" className="sm:col-span-2">
                {client.notes ? <span className="whitespace-pre-wrap">{client.notes}</span> : <span className="text-muted-foreground">None</span>}
              </DetailItem>
            </DetailGrid>
          </CardContent>
        </Card>

        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Projects"
            description={projects.length > 0 ? `${projects.length} ${projects.length === 1 ? "project" : "projects"} for this client.` : undefined}
            actions={
              archived || projects.length === 0 ? null : (
                <Button render={<Link href={`/admin/projects/new?clientId=${client.id}`} />} size="sm">
                  <Plus data-icon="inline-start" />
                  New project
                </Button>
              )
            }
          />
          {projects.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderKanban />
                </EmptyMedia>
                <EmptyTitle>No projects yet</EmptyTitle>
                <EmptyDescription>Create a project for this client to start tracking work.</EmptyDescription>
              </EmptyHeader>
              {archived ? null : (
                <EmptyContent>
                  <Button render={<Link href={`/admin/projects/new?clientId=${client.id}`} />}>
                    <Plus data-icon="inline-start" />
                    New project
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <ul className="stagger grid gap-3 sm:grid-cols-2">
              {projects.map(({ project, progress, tasksDone, tasksTotal }) => (
                <li
                  key={project.id}
                  className="card-interactive relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="min-w-0 font-medium break-words outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/40"
                    >
                      {project.title}
                    </Link>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      {project.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
                      <KindBadge kind={project.kind} />
                      <ProjectStatusBadge status={project.status} />
                    </div>
                  </div>
                  {project.kind === "retainer" ? null : (
                    <div className="flex items-center gap-3">
                      <AnimatedBar value={progress} label="Project progress" className="h-1.5 flex-1" />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {project.kind === "tasks" ? `${tasksDone} of ${tasksTotal}` : `${progress}%`}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium tabular-nums">
                      {project.kind === "retainer" ? (
                        <RateWithMonthly
                          rate={project.rate}
                          unit={project.rateUnit}
                          currency={project.currency}
                          hoursPerDay={project.hoursPerDay}
                          daysPerMonth={project.daysPerMonth}
                        />
                      ) : project.kind === "tasks" ? (
                        "Per task"
                      ) : (
                        formatMoney(project.contractValue, project.currency)
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      {project.deadline ? `Due ${formatIsoDate(project.deadline)}` : "No deadline"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {standalone.length > 0 ? (
          <section className="flex flex-col gap-4" data-testid="client-standalone-payments">
            <SectionHeader
              title="Payments with no project"
              description={`Money received from this client that is not attached to a project. Total: ${currenciesIn(standaloneTotals)
                .map((c) => formatMoney(standaloneTotals[c] ?? 0, c))
                .join(" + ")}.`}
            />
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {standalone.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className="font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    {formatIsoDate(p.paidOn)}, {METHOD_LABELS[p.method]}
                    {p.note ? `, ${p.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/admin/payments" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Open all payments
            </Link>
          </section>
        ) : null}

        {expenseLines.length > 0 ? (
          <section className="flex flex-col gap-4" data-testid="client-expenses">
            <SectionHeader
              title="Expenses for this client"
              description={`Money you spent on this client's work. Total: ${currenciesIn(expenseSum)
                .map((c) => formatMoney(expenseSum[c] ?? 0, c))
                .join(" + ")}. Never shown to the client.`}
            />
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {expenseLines.map((e) => (
                <li key={e.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className="font-semibold tabular-nums">{formatMoney(e.amount, e.currency)}</span>
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    <span className="font-medium text-foreground">{e.description}</span>, {CATEGORY_LABELS[e.category]}, {formatIsoDate(e.date)}
                    {e.recurring !== "none" ? `, ${RECURRING_LABELS[e.recurring].toLowerCase()}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/admin/expenses" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Open all expenses
            </Link>
          </section>
        ) : null}
      </div>
    </>
  );
}
