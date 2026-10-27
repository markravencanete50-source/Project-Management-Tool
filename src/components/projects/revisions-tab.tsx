import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { requireAdmin } from "@/lib/auth/session";
import { getProjectRevisions } from "@/server/data/revisions";
import { RevisionItem } from "@/components/revisions/revision-item";
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
        <CardContent>
          {data.revisions.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No revisions yet</EmptyTitle>
                <EmptyDescription>Revision requests from the client will appear here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="space-y-3">
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
