import { randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deleteAsset, downloadBuffer, isInFolder, projectFolder, uploadBuffer } from "@/lib/cloudinary";
import { formatInstant } from "@/lib/dates";
import { appUrl, env } from "@/lib/env";
import { sendAgreementSigned } from "@/lib/email";
import { db } from "@/lib/firebase/admin";
import { sha256Hex } from "@/lib/pdf/hash";
import { appendSignaturePages } from "@/lib/pdf/signed-pdf";
import {
  AGREEMENT_CONSENT_TEXT,
  MAX_SIGNATURE_BYTES,
  SIGNATURE_DATA_URL_PREFIX,
  signBodySchema,
} from "@/lib/validation/agreements";
import { isSameOrigin } from "@/server/auth-helpers";
import { logActivity } from "@/server/activity";
import { markAccepted } from "@/server/accepted";
import { canAccessProject } from "@/server/data/access";
import { fromDoc, fromDocs } from "@/server/data/convert";
import { col } from "@/server/data/refs";
import { getSettings } from "@/server/data/settings";
import type { Agreement, Client, Project } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The request carries a PNG of at most 300 KB (about 400 KB as base64). */
const MAX_BODY_CHARS = 500_000;
const MAX_PNG_WIDTH = 3000;
const MAX_PNG_HEIGHT = 1500;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(body: Record<string, unknown>, status: number) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Decode and sanity check the drawn signature. Rejects anything that is not a modest PNG. */
function decodeSignature(dataUrl: string): Buffer {
  const bytes = Buffer.from(dataUrl.slice(SIGNATURE_DATA_URL_PREFIX.length), "base64");
  const isPng = bytes.length > 33 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isPng || bytes.subarray(12, 16).toString("ascii") !== "IHDR") throw new HttpError(400, "The signature must be a PNG image.");
  if (bytes.length > MAX_SIGNATURE_BYTES) throw new HttpError(400, "The signature image is too large. Clear it and draw again.");
  // Dimensions come from the IHDR chunk: refuse images that would expand to a huge bitmap.
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > MAX_PNG_WIDTH || height > MAX_PNG_HEIGHT) {
    throw new HttpError(400, "The signature image has an unsupported size.");
  }
  return bytes;
}

function clientIp(request: NextRequest): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "").slice(0, 64);
}

/** The newest non-void version. Only this one may be signed. */
function latestNonVoid(agreements: Agreement[]): Agreement | null {
  return agreements.filter((a) => a.status !== "void").sort((a, b) => b.version - a.version)[0] ?? null;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  const session = await getSession();
  if (!session || session.role !== "client") return json({ error: "Please sign in again." }, 401);

  const uploaded: string[] = [];
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_CHARS) throw new HttpError(413, "The request is too large.");
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    const parsed = signBodySchema.safeParse(parsedJson);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
    const body = parsed.data;
    const signaturePng = decodeSignature(body.signatureDataUrl);

    // ---- Ownership and state checks ----
    const projectRef = col.projects().doc(body.projectId);
    const agreementRef = col.agreements(body.projectId).doc(body.agreementId);
    const [projectSnap, agreementSnap] = await Promise.all([projectRef.get(), agreementRef.get()]);
    if (!projectSnap.exists) throw new HttpError(404, "Not found.");
    const project = fromDoc<Project>(projectSnap);
    if (!canAccessProject(session, project) || project.clientId !== session.clientId) throw new HttpError(404, "Not found.");
    if (!agreementSnap.exists) throw new HttpError(404, "Not found.");
    const agreement = fromDoc<Agreement>(agreementSnap);

    const all = fromDocs<Agreement>(await col.agreements(body.projectId).get());
    const latest = latestNonVoid(all);
    if (agreement.status === "signed") throw new HttpError(409, "This agreement is already signed.");
    if (!latest || latest.id !== agreement.id || agreement.status === "void") {
      throw new HttpError(409, "A newer version of this agreement exists. Reload the page.");
    }
    if (agreement.status !== "sent" && agreement.status !== "viewed") throw new HttpError(409, "This agreement is not ready to sign.");
    if (agreement.version !== body.version || agreement.pdfHash !== body.pdfHash) {
      throw new HttpError(409, "The agreement changed since you opened it. Reload the page and review it again.");
    }
    if (!isInFolder(agreement.pdfPublicId, project.id, "agreements")) throw new HttpError(500, "Agreement file is invalid.");

    const clientSnap = await col.clients().doc(project.clientId).get();
    if (!clientSnap.exists) throw new HttpError(404, "Not found.");
    const client = fromDoc<Client>(clientSnap);
    const signerEmail = (session.email ?? client.email).toLowerCase();
    const ip = clientIp(request);
    const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 400);

    // ---- Build the signed document ----
    const original = await downloadBuffer(agreement.pdfPublicId);
    if (sha256Hex(original) !== agreement.pdfHash) {
      console.error("agreement hash mismatch", agreement.id);
      throw new HttpError(500, "The stored agreement could not be verified. Please contact the developer.");
    }

    const signedAt = new Date();
    const signature = await uploadBuffer(signaturePng, {
      folder: projectFolder(project.id, "signatures"),
      resourceType: "image",
      publicId: `v${agreement.version}-${randomBytes(6).toString("hex")}`,
    });
    uploaded.push(signature.storedId);

    const signedPdf = await appendSignaturePages(original, {
      agreementId: agreement.id,
      version: agreement.version,
      signerName: body.signerName,
      signerEmail,
      signedAt,
      ip,
      userAgent,
      originalHash: agreement.pdfHash,
      signaturePng,
      consentText: AGREEMENT_CONSENT_TEXT,
    });
    const signedPdfHash = sha256Hex(signedPdf);
    const signedUpload = await uploadBuffer(signedPdf, {
      folder: projectFolder(project.id, "signed"),
      resourceType: "raw",
      publicId: `v${agreement.version}-signed-${randomBytes(6).toString("hex")}.pdf`,
    });
    uploaded.push(signedUpload.storedId);

    // ---- Commit ----
    const settings = await getSettings();
    await db().runTransaction(async (tx) => {
      const [freshAgreement, freshProject, freshAll] = await Promise.all([tx.get(agreementRef), tx.get(projectRef), tx.get(col.agreements(project.id))]);
      const current = fromDoc<Agreement>(freshAgreement);
      const currentProject = fromDoc<Project>(freshProject);
      if (current.status !== "sent" && current.status !== "viewed") throw new HttpError(409, "This agreement is already signed or no longer open.");
      if (latestNonVoid(fromDocs<Agreement>(freshAll))?.id !== current.id) throw new HttpError(409, "A newer version of this agreement exists. Reload the page.");
      if (current.pdfHash !== body.pdfHash || current.version !== body.version) throw new HttpError(409, "The agreement changed. Reload the page.");

      tx.update(agreementRef, {
        status: "signed",
        signedAt: Timestamp.fromDate(signedAt),
        signedPdfPublicId: signedUpload.storedId,
        signedPdfHash,
        signaturePublicId: signature.storedId,
        signerName: body.signerName,
        signerEmail,
        signerIp: ip,
        userAgent,
        ...(current.viewedAt ? {} : { viewedAt: Timestamp.fromDate(signedAt) }),
      });
      logActivity(tx, {
        type: "agreement.signed",
        message: `Agreement version ${current.version} signed by ${body.signerName}`,
        actor: "client",
        visibility: "client",
        projectId: project.id,
        clientId: project.clientId,
      });
      if (settings.acceptedRule === "signed") {
        markAccepted(tx, projectRef, currentProject, "signed", "client");
      }
    });
    uploaded.length = 0; // referenced from Firestore now; keep them

    // ---- Notify (the signature is already recorded, so failures here are only logged) ----
    try {
      const recipients = [...new Set([client.email.toLowerCase(), env().ADMIN_EMAIL.toLowerCase()])];
      await sendAgreementSigned({
        to: recipients,
        projectTitle: project.title,
        signerName: body.signerName,
        signedAt: `${formatInstant(signedAt, "d MMM yyyy, HH:mm")} (Asia/Manila)`,
        pdf: signedPdf,
        filename: `agreement-v${agreement.version}-signed.pdf`,
        clientUrl: appUrl(`/portal/projects/${project.id}`),
        adminUrl: appUrl(`/admin/projects/${project.id}`),
      });
    } catch (err) {
      console.error("sendAgreementSigned failed", err);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    // Files uploaded for a signature that was not committed are removed again.
    await Promise.all(uploaded.map((id) => deleteAsset(id).catch((e) => console.error("signature cleanup failed", e))));
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("agreement sign failed", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
