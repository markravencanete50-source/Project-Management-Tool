import Link from "next/link";
import { FileText } from "lucide-react";
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            Agreement
          </CardTitle>
          {agreement ? <AgreementStatusBadge status={agreement.status} /> : null}
        </div>
        <CardDescription>
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
            className={cn(buttonVariants({ variant: agreement.status === "signed" ? "outline" : "default", size: "lg" }), "w-full sm:w-auto")}
          >
            {agreement.status === "signed" ? "View signed agreement" : "Review and sign"}
          </Link>
        </CardContent>
      ) : null}
    </Card>
  );
}
