import { MessageSquarePlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireAdmin } from "@/lib/auth/session";
import { getProjectRevisions } from "@/server/data/revisions";
import { RevisionItem } from "@/components/revisions/revision-item";
import { RevisionMeter } from "@/components/revisions/revision-meter";
import { AdminRevisionActions } from "@/components/revisions/admin-actions";

/** Admin view of a project's revisions: allowance used, every round, and the actions for each. */
export async function RevisionsTab({ projectId }: { projectId: string }) {
  await requireAdmin();
  const data = await getProjectRevisions(projectId);
  const over = data.counted > data.allowance;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Revision allowance</CardTitle>
          <CardDescription>
            {Math.min(data.counted, data.allowance)} of {data.allowance} included revision{data.allowance === 1 ? "" : "s"} used
            {over ? `, ${data.counted - data.allowance} extra billed as change orders` : ""}. Cancelled revisions do not count.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <RevisionMeter counted={data.counted} allowance={data.allowance} />
          {data.revisions.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquarePlus />
                </EmptyMedia>
                <EmptyTitle>No revisions yet</EmptyTitle>
                <EmptyDescription>Revision requests from the client will appear here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="stagger space-y-3 [--stagger:40ms]">
              {data.revisions.map((revision) => (
                <RevisionItem key={revision.id} revision={revision} currency={data.currency}>
                  <AdminRevisionActions
                    projectId={projectId}
                    revisionId={revision.id}
                    status={revision.status}
                    currency={data.currency}
                  />
                </RevisionItem>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
