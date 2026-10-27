import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { downloadBuffer, isInFolder } from "@/lib/cloudinary";
import { canAccessProject } from "@/server/data/access";
import { fromDoc } from "@/server/data/convert";
import { col } from "@/server/data/refs";
import type { Agreement, Project } from "@/lib/types";

export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * GET /api/agreements/pdf?projectId=&agreementId=&kind=original|signed
 *
 * Streams an agreement PDF inline so the sign page can show it in an iframe
 * (the shared /api/files route redirects to a Cloudinary download, which
 * browsers save instead of display). Same checks as /api/files: a session, and
 * the project must belong to the client. Clients never get drafts or void versions.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId") ?? "";
  const agreementId = params.get("agreementId") ?? "";
  const kind = params.get("kind") === "signed" ? "signed" : "original";
  if (!ID.test(projectId) || !ID.test(agreementId)) return new NextResponse("Not found", { status: 404 });

  const projectSnap = await col.projects().doc(projectId).get();
  if (!projectSnap.exists || !canAccessProject(session, fromDoc<Project>(projectSnap))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const agreementSnap = await col.agreements(projectId).doc(agreementId).get();
  if (!agreementSnap.exists) return new NextResponse("Not found", { status: 404 });
  const agreement = fromDoc<Agreement>(agreementSnap);

  if (session.role === "client" && (agreement.status === "draft" || agreement.status === "void")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const storedId = kind === "signed" ? agreement.signedPdfPublicId : agreement.pdfPublicId;
  const purpose = kind === "signed" ? "signed" : "agreements";
  if (!storedId || !isInFolder(storedId, projectId, purpose)) return new NextResponse("Not found", { status: 404 });

  const pdf = await downloadBuffer(storedId);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="agreement-v${agreement.version}${kind === "signed" ? "-signed" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
