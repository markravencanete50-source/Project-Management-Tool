import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AgreementStatusBadge } from "@/components/agreements/status-badge";
import { SignForm } from "@/components/agreements/sign-form";
import { PageHeader } from "@/components/common/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { requireClient } from "@/lib/auth/session";
import { formatInstant } from "@/lib/dates";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { getClientAgreement } from "@/server/data/agreements";

export const metadata: Metadata = { title: "Agreement" };

export default async function AgreementPage({ params }: PageProps<"/portal/projects/[id]/agreement">) {
  const { id } = await params;
  await requireClient();
  // Opening this page is what marks a sent agreement as viewed.
  const { project, agreement } = await getClientAgreement(id, { markViewed: true });

  const back = (
    <Link href={`/portal/projects/${project.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-3 -ml-2")}>
      <ArrowLeft data-icon="inline-start" />
      Back to project
    </Link>
  );

  if (!agreement) {
    return (
      <div>
        {back}
        <PageHeader title="Agreement" description={project.title} />
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Nothing to sign yet</EmptyTitle>
            <EmptyDescription>Your developer has not sent an agreement for this project. You will get an email when it is ready.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const signed = agreement.status === "signed";
  const showSigned = signed && agreement.signedPdfPublicId !== null;
  const inlineUrl = `/api/agreements/pdf?projectId=${encodeURIComponent(project.id)}&agreementId=${encodeURIComponent(agreement.id)}&kind=${showSigned ? "signed" : "original"}`;
  const downloadUrl = fileUrl(showSigned && agreement.signedPdfPublicId ? agreement.signedPdfPublicId : agreement.pdfPublicId);
  const fingerprint = showSigned && agreement.signedPdfHash ? agreement.signedPdfHash : agreement.pdfHash;

  return (
    <div>
      {back}
      <PageHeader
        title="Agreement"
        description={`${project.title}, version ${agreement.version}`}
        actions={<AgreementStatusBadge status={agreement.status} />}
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{signed ? "Signed agreement" : "Read the agreement"}</CardTitle>
            <CardDescription>
              {signed ? "This is the signed copy, including the signature page and audit trail." : "Read the whole document before you sign."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto sm:self-start")}
            >
              <ExternalLink data-icon="inline-start" />
              Open PDF
            </a>
            <iframe
              src={inlineUrl}
              title={signed ? "Signed agreement" : "Agreement to review"}
              className="h-[60vh] w-full rounded-lg border bg-muted sm:h-[75vh]"
            />
            <p className="text-xs break-all text-muted-foreground">
              Document fingerprint (SHA-256): <span className="font-mono">{fingerprint}</span>
            </p>
          </CardContent>
        </Card>

        {signed ? (
          <Card>
            <CardHeader>
              <CardTitle>Signature details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Signed by</dt>
                  <dd className="text-sm">{agreement.signerName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Signed on</dt>
                  <dd className="text-sm">{agreement.signedAt ? `${formatInstant(agreement.signedAt)} (Asia/Manila)` : ""}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd className="text-sm break-words">{agreement.signerEmail}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Sign</CardTitle>
              <CardDescription>Type your full name, draw your signature and confirm below.</CardDescription>
            </CardHeader>
            <CardContent>
              <SignForm projectId={project.id} agreementId={agreement.id} version={agreement.version} pdfHash={agreement.pdfHash} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
