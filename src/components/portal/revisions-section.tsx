import { MessageSquarePlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatMoney } from "@/lib/money";
import { getProjectRevisions } from "@/server/data/revisions";
import { RevisionItem } from "@/components/revisions/revision-item";
import { RevisionMeter } from "@/components/revisions/revision-meter";
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
          <CardTitle id="revisions-heading" className="text-lg">
            Revisions
          </CardTitle>
          <CardDescription className="text-base">
            {Math.min(data.counted, data.allowance)} of {data.allowance} included revision{data.allowance === 1 ? "" : "s"} used.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RevisionMeter counted={data.counted} allowance={data.allowance} />

          {data.role === "client" ? (
            <RequestRevisionForm projectId={projectId} disabledReason={data.requestBlockedReason} nextRoundNote={nextRoundNote} />
          ) : null}

          {data.revisions.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquarePlus />
                </EmptyMedia>
                <EmptyTitle>No revisions requested</EmptyTitle>
                <EmptyDescription>Requests you send will be listed here with their progress.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              <h3 className="text-base font-semibold">Your requests</h3>
              <ul className="stagger space-y-3 [--stagger:40ms]">
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
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
