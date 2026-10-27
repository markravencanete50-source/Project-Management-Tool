import { FileText } from "lucide-react";
import { AgreementActions } from "@/components/agreements/agreement-actions";
import { AgreementStatusBadge } from "@/components/agreements/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatInstant } from "@/lib/dates";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { listAgreements } from "@/server/data/agreements";
import type { Agreement } from "@/lib/types";

function when(date: Date | null): string {
  return date ? formatInstant(date) : "Not yet";
}

function FileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
      {children}
    </a>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm break-words", mono && "font-mono text-xs break-all")}>{value || "Not recorded"}</dd>
    </div>
  );
}

/** Admin: the agreement for a project, its timeline, and every version. */
export async function AgreementTab({ projectId }: { projectId: string }) {
  const { agreements } = await listAgreements(projectId);

  const current = agreements.find((a) => a.status !== "void") ?? null;
  const hasSigned = agreements.some((a) => a.status === "signed");
  const sendable = current && (current.status === "draft" || current.status === "sent" || current.status === "viewed") ? current : null;

  if (agreements.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>No agreement yet</EmptyTitle>
            <EmptyDescription>
              Create one from the template in Settings. It uses the project description as the scope, the contract value and the payment schedule.
            </EmptyDescription>
          </EmptyHeader>
          <AgreementActions projectId={projectId} sendable={null} hasSigned={false} hasAny={false} />
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {current ? <CurrentAgreement agreement={current} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>
            Regenerating creates a new version and voids older unsigned ones. A signed agreement is never changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgreementActions
            projectId={projectId}
            sendable={sendable ? { id: sendable.id, version: sendable.version, status: sendable.status as "draft" | "sent" | "viewed" } : null}
            hasSigned={hasSigned}
            hasAny
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {agreements.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Version {a.version}</span>
                    <AgreementStatusBadge status={a.status} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Created {when(a.createdAt)}
                    {a.status === "signed" ? `, signed ${when(a.signedAt)}` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <FileLink href={fileUrl(a.pdfPublicId)}>Original PDF</FileLink>
                  {a.signedPdfPublicId ? <FileLink href={fileUrl(a.signedPdfPublicId)}>Signed PDF</FileLink> : null}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function CurrentAgreement({ agreement }: { agreement: Agreement }) {
  const steps: { label: string; at: Date | null }[] = [
    { label: "Created", at: agreement.createdAt },
    { label: "Sent", at: agreement.sentAt },
    { label: "Viewed by client", at: agreement.viewedAt },
    { label: "Signed", at: agreement.signedAt },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Version {agreement.version}</CardTitle>
          <AgreementStatusBadge status={agreement.status} />
        </div>
        <CardDescription>
          {agreement.status === "signed"
            ? `Signed by ${agreement.signerName ?? "the client"}`
            : agreement.status === "draft"
              ? "Draft. Review the PDF, then send it to the client."
              : "Waiting for the client to sign."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ol className="grid gap-2 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.label} className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span className={step.at ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{when(step.at)}</span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          <FileLink href={fileUrl(agreement.pdfPublicId)}>View PDF</FileLink>
          {agreement.signedPdfPublicId ? <FileLink href={fileUrl(agreement.signedPdfPublicId)}>View signed PDF</FileLink> : null}
        </div>

        {agreement.status === "signed" ? (
          <dl className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
            <Detail label="Signer name" value={agreement.signerName} />
            <Detail label="Signer email" value={agreement.signerEmail} />
            <Detail label="IP address" value={agreement.signerIp} mono />
            <Detail label="User agent" value={agreement.userAgent} />
            <Detail label="Original PDF SHA-256" value={agreement.pdfHash} mono />
            <Detail label="Signed PDF SHA-256" value={agreement.signedPdfHash} mono />
          </dl>
        ) : (
          <dl className="grid grid-cols-1 gap-3">
            <Detail label="Document SHA-256" value={agreement.pdfHash} mono />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
