import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { AgreementStatusBadge } from "@/components/agreements/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInstant } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getClientAgreement } from "@/server/data/agreements";

/** Portal: agreement status with a link to review and sign, or to view the signed copy. */
export async function PortalAgreementSection({ projectId }: { projectId: string }) {
  const { agreement } = await getClientAgreement(projectId);
  const href = `/portal/projects/${projectId}/agreement`;
  const needsSignature = agreement !== null && agreement.status !== "signed";

  return (
    <section aria-labelledby="portal-agreement-heading">
      <Card className={cn(needsSignature && "border-primary/30 bg-primary/5")}>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="portal-agreement-heading" className="flex items-center gap-2 text-lg">
              <FileText className="size-5 text-primary" aria-hidden />
              Agreement
            </CardTitle>
            {agreement ? <AgreementStatusBadge status={agreement.status} /> : null}
          </div>
          <CardDescription className="text-base">
            {!agreement
              ? "No agreement is waiting for you yet."
              : agreement.status === "signed"
                ? `Signed${agreement.signerName ? ` by ${agreement.signerName}` : ""}${agreement.signedAt ? ` on ${formatInstant(agreement.signedAt)}` : ""}.`
                : "Your agreement is ready. Please review it and sign."}
          </CardDescription>
        </CardHeader>
        {agreement ? (
          <CardContent>
            <Link
              href={href}
              className={cn(buttonVariants({ variant: agreement.status === "signed" ? "outline" : "default", size: "lg" }), "h-11 w-full text-base sm:w-auto")}
            >
              {agreement.status === "signed" ? "View signed agreement" : "Review and sign"}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </CardContent>
        ) : null}
      </Card>
    </section>
  );
}
