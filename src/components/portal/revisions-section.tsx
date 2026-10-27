import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { formatMoney } from "@/lib/money";
import { getProjectRevisions } from "@/server/data/revisions";
import { RevisionItem } from "@/components/revisions/revision-item";
import { ClientRevisionActions } from "@/components/revisions/client-actions";
import { RequestRevisionForm } from "@/components/revisions/request-form";

/** Client portal: request a revision, decide change orders, approve delivered work. */
export async function PortalRevisionsSection({ projectId }: { projectId: string }) {
  const data = await getProjectRevisions(projectId);
  const nextRound = data.counted + 1;
  const nextIsExtra = nextRound > data.allowance;

  const nextRoundNote = nextIsExtra
    ? `Your ${data.allowance} included revision${data.allowance === 1 ? " has" : "s have"} been used. A new request is quoted first, and work starts only after you approve the price.`
    : `This will be revision ${nextRound} of ${data.allowance} included.`;

  return (
    <section className="space-y-4" aria-labelledby="revisions-heading">
      <Card>
        <CardHeader>
          <CardTitle id="revisions-heading">Revisions</CardTitle>
          <CardDescription>
            {Math.min(data.counted, data.allowance)} of {data.allowance} included revision{data.allowance === 1 ? "" : "s"} used.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {data.role === "client" ? (
            <RequestRevisionForm projectId={projectId} disabledReason={data.requestBlockedReason} nextRoundNote={nextRoundNote} />
          ) : null}

          {data.revisions.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No revisions requested</EmptyTitle>
                <EmptyDescription>Requests you send will be listed here with their progress.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="space-y-3">
              {data.revisions.map((revision) => (
                <RevisionItem key={revision.id} revision={revision} currency={data.currency}>
                  {data.role === "client" ? (
                    <ClientRevisionActions
                      projectId={projectId}
                      revisionId={revision.id}
                      status={revision.status}
                      priceLabel={revision.price !== null ? formatMoney(revision.price, data.currency) : null}
                    />
                  ) : null}
                </RevisionItem>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
