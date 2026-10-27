import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/common/page-header";
import { ProspectForm } from "@/components/prospects/prospect-form";
import { StageControl } from "@/components/prospects/stage-control";
import { ArchiveButton, ConvertButton } from "@/components/prospects/prospect-actions";
import { StageBadge } from "@/components/prospects/prospects-table";
import { isFollowUpDue } from "@/components/prospects/labels";
import { formatInstant, formatIsoDate, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getConvertedLinks, getProspect, getProspectActivity } from "@/server/data/prospects";

export const metadata = { title: "Prospect" };

export default async function ProspectPage({ params }: PageProps<"/admin/prospects/[id]">) {
  const { id } = await params;
  const prospect = await getProspect(id);
  const [activity, links] = await Promise.all([getProspectActivity(id), getConvertedLinks(prospect)]);
  const converted = !!(prospect.convertedClientId || prospect.convertedProjectId);
  const due = isFollowUpDue(prospect, todayIso());

  return (
    <div className="min-w-0">
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" render={<Link href="/admin/prospects" />}>
        <ArrowLeft data-icon="inline-start" />
        All prospects
      </Button>
      <PageHeader
        title={prospect.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {prospect.company || "No company"}
            <StageBadge stage={prospect.stage} />
            {prospect.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
            {due ? <Badge variant="destructive">Follow-up due</Badge> : null}
          </span>
        }
        actions={<ArchiveButton id={prospect.id} archived={!!prospect.archivedAt} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>
                {prospect.estimatedValue
                  ? `Estimated ${formatMoney(prospect.estimatedValue, prospect.currency)}`
                  : "No estimated value yet"}
                {prospect.nextFollowUp ? `. Next follow-up ${formatIsoDate(prospect.nextFollowUp)}.` : ""}
              </CardDescription>
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
                <ul className="flex flex-col divide-y">
                  {activity.map((a) => (
                    <li key={a.id} className="flex flex-col gap-0.5 py-2 text-sm first:pt-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-4">
                      <span className="min-w-0 break-words">{a.message}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatInstant(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
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
                  <Button disabled>Convert to client</Button>
                  <div className="flex flex-col gap-1 text-sm">
                    {prospect.convertedClientId ? (
                      <Link className="underline underline-offset-4" href={`/admin/clients/${prospect.convertedClientId}`}>
                        Client: {links.clientName ?? "View client"}
                      </Link>
                    ) : null}
                    {prospect.convertedProjectId ? (
                      <Link className="underline underline-offset-4" href={`/admin/projects/${prospect.convertedProjectId}`}>
                        Project: {links.projectTitle ?? "View project"}
                      </Link>
                    ) : null}
                  </div>
                </>
              ) : !prospect.email ? (
                <>
                  <Button disabled>Convert to client</Button>
                  <p className="text-sm text-muted-foreground">Add an email address in the details to enable conversion.</p>
                </>
              ) : prospect.archivedAt ? (
                <>
                  <Button disabled>Convert to client</Button>
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
