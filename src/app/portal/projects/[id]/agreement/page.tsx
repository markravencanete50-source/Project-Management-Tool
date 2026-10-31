import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleCheck, ExternalLink, FileText } from "lucide-react";
import { AgreementStatusBadge } from "@/components/agreements/status-badge";
import { SignForm } from "@/components/agreements/sign-form";
import { DetailGrid, DetailItem } from "@/components/common/detail";
import { PageHeader } from "@/components/common/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
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

      <div className="stagger flex flex-col gap-5">
        {signed ? (
          <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success/8 px-4 py-3 text-success" role="status">
            <CircleCheck className="size-5 shrink-0" aria-hidden />
            <p className="text-base font-medium">This agreement is signed. Thank you.</p>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{signed ? "Signed agreement" : "Read the agreement"}</CardTitle>
            <CardDescription className="text-base">
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
              className="h-[60vh] w-full rounded-xl border bg-muted shadow-xs sm:h-[75vh]"
            />
            <p className="text-xs break-all text-muted-foreground">
              Document fingerprint (SHA-256): <span className="font-mono">{fingerprint}</span>
            </p>
          </CardContent>
        </Card>

        {signed ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Signature details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailGrid>
                <DetailItem label="Signed by">{agreement.signerName}</DetailItem>
                <DetailItem label="Signed on">
                  {agreement.signedAt ? `${formatInstant(agreement.signedAt)} (Asia/Manila)` : ""}
                </DetailItem>
                <DetailItem label="Email">{agreement.signerEmail}</DetailItem>
              </DetailGrid>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sign</CardTitle>
              <CardDescription className="text-base">Type your full name, draw your signature and confirm below.</CardDescription>
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
