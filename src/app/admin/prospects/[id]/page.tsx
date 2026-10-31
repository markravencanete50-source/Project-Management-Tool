import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, CalendarClock, FolderKanban, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { DetailGrid, DetailItem } from "@/components/common/detail";
import { InitialsAvatar } from "@/components/common/initials-avatar";
import { ProspectForm } from "@/components/prospects/prospect-form";
import { StageControl } from "@/components/prospects/stage-control";
import { ArchiveButton, ConvertButton } from "@/components/prospects/prospect-actions";
import { StageBadge } from "@/components/prospects/prospects-table";
import { isFollowUpDue, LOST_REASON_LABELS, SOURCE_LABELS } from "@/components/prospects/labels";
import { formatInstant, formatIsoDate, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getConvertedLinks, getProspect, getProspectActivity } from "@/server/data/prospects";

export const metadata = { title: "Prospect" };

function LinkTile({ href, kind, label, icon }: { href: string; kind: string; label: string; icon: ReactNode }) {
  return (
    <Link
      href={href}
      className="card-interactive group/tile flex items-center gap-3 rounded-lg border bg-background p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{kind}</span>
        <span className="block truncate text-sm font-medium">{label}</span>
      </span>
      <ArrowUpRight
        className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover/tile:translate-x-0.5 group-hover/tile:-translate-y-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export default async function ProspectPage({ params }: PageProps<"/admin/prospects/[id]">) {
  const { id } = await params;
  const prospect = await getProspect(id);
  const [activity, links] = await Promise.all([getProspectActivity(id), getConvertedLinks(prospect)]);
  const converted = !!(prospect.convertedClientId || prospect.convertedProjectId);
  const today = todayIso();
  const due = isFollowUpDue(prospect, today);
  const open = prospect.stage !== "won" && prospect.stage !== "lost";

  return (
    <div className="min-w-0">
      <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" render={<Link href="/admin/prospects" />}>
        <ArrowLeft data-icon="inline-start" />
        All prospects
      </Button>

      <div className="enter mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between md:mb-8">
        <div className="flex min-w-0 items-center gap-4">
          <InitialsAvatar name={prospect.name} className="size-14 text-lg" />
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance break-words sm:text-[1.75rem]">
              {prospect.name}
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {prospect.company || "No company"}
              {prospect.service ? `, ${prospect.service}` : ""}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <StageBadge stage={prospect.stage} />
              {prospect.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
              {due ? (
                <Badge variant="destructive" dot>
                  Follow-up due
                </Badge>
              ) : null}
              {prospect.nextFollowUp ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  {open ? "Next follow-up" : "Follow-up was"} {formatIsoDate(prospect.nextFollowUp)}
                </span>
              ) : open ? (
                <span className="text-sm text-muted-foreground">No follow-up scheduled</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ArchiveButton id={prospect.id} archived={!!prospect.archivedAt} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="stagger flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>The essentials at a glance. Edit them further down.</CardDescription>
            </CardHeader>
            <CardContent>
              <DetailGrid>
                <DetailItem label="Email">{prospect.email || <span className="text-muted-foreground">Not set</span>}</DetailItem>
                <DetailItem label="Source">{SOURCE_LABELS[prospect.source]}</DetailItem>
                <DetailItem label="Service">{prospect.service || <span className="text-muted-foreground">Not set</span>}</DetailItem>
                <DetailItem label="Estimated value">
                  {prospect.estimatedValue ? (
                    <span className="font-semibold tabular-nums">{formatMoney(prospect.estimatedValue, prospect.currency)}</span>
                  ) : (
                    <span className="text-muted-foreground">No estimated value yet</span>
                  )}
                </DetailItem>
                <DetailItem label="Next follow-up">
                  {prospect.nextFollowUp ? formatIsoDate(prospect.nextFollowUp) : <span className="text-muted-foreground">None</span>}
                </DetailItem>
                <DetailItem label="Added">{formatInstant(prospect.createdAt)}</DetailItem>
                {prospect.stage === "lost" && prospect.lostReason ? (
                  <DetailItem label="Lost reason">{LOST_REASON_LABELS[prospect.lostReason]}</DetailItem>
                ) : null}
                {prospect.closedAt ? <DetailItem label="Closed">{formatInstant(prospect.closedAt)}</DetailItem> : null}
              </DetailGrid>
            </CardContent>
          </Card>

          {prospect.notes.trim() ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm/relaxed break-words whitespace-pre-wrap">{prospect.notes}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Edit details</CardTitle>
              <CardDescription>Changes are logged in the activity below.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProspectForm prospect={prospect} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>No activity yet</EmptyTitle>
                    <EmptyDescription>Changes to this prospect will be listed here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
                  {activity.map((a) => (
                    <li key={a.id} className="relative flex gap-3 text-sm">
                      <span
                        aria-hidden="true"
                        className="relative z-10 mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-muted-foreground/50 bg-card"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                        <span className="min-w-0 break-words">{a.message}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatInstant(a.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="stagger flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Stage</CardTitle>
              <CardDescription>Moving to lost asks for a reason.</CardDescription>
            </CardHeader>
            <CardContent>
              <StageControl prospect={prospect} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Convert</CardTitle>
              <CardDescription>
                {converted
                  ? "This prospect has already been converted."
                  : "Create a client (or reuse one with the same email) and a draft project."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {converted ? (
                <>
                  <Button disabled className="w-full">
                    Convert to client
                  </Button>
                  <div className="flex flex-col gap-2">
                    {prospect.convertedClientId ? (
                      <LinkTile
                        href={`/admin/clients/${prospect.convertedClientId}`}
                        kind="Client"
                        label={links.clientName ?? "View client"}
                        icon={<Users className="size-4" />}
                      />
                    ) : null}
                    {prospect.convertedProjectId ? (
                      <LinkTile
                        href={`/admin/projects/${prospect.convertedProjectId}`}
                        kind="Project"
                        label={links.projectTitle ?? "View project"}
                        icon={<FolderKanban className="size-4" />}
                      />
                    ) : null}
                  </div>
                </>
              ) : !prospect.email ? (
                <>
                  <Button disabled className="w-full">
                    Convert to client
                  </Button>
                  <p className="text-sm text-muted-foreground">Add an email address in the details to enable conversion.</p>
                </>
              ) : prospect.archivedAt ? (
                <>
                  <Button disabled className="w-full">
                    Convert to client
                  </Button>
                  <p className="text-sm text-muted-foreground">Restore this prospect to convert it.</p>
                </>
              ) : (
                <ConvertButton id={prospect.id} name={prospect.name} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
