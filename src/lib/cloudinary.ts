import "server-only";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { env } from "@/lib/env";

export type ResourceType = "raw" | "image";

/** Every asset lives under pmt/projects/{projectId}/{purpose}/ or pmt/backups/. */
export type UploadPurpose = "agreements" | "signed" | "signatures" | "receipts" | "revisions";
export const ROOT = "pmt";
export const BACKUP_FOLDER = `${ROOT}/backups`;

export function projectFolder(projectId: string, purpose: UploadPurpose): string {
  return `${ROOT}/projects/${projectId}/${purpose}`;
}

let configured = false;
function client() {
  if (!configured) {
    const e = env();
    cloudinary.config({
      cloud_name: e.CLOUDINARY_CLOUD_NAME,
      api_key: e.CLOUDINARY_API_KEY,
      api_secret: e.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

/**
 * Server-side upload of a generated file (PDFs, signatures, backups).
 * Returns the stored id to save in Firestore (see toStoredId).
 */
export function uploadBuffer(
  buffer: Buffer,
  opts: { folder: string; resourceType: ResourceType; publicId?: string },
): Promise<{ storedId: string; raw: UploadApiResponse }> {
  return new Promise((resolve, reject) => {
    client()
      .uploader.upload_stream(
        {
          folder: opts.folder,
          resource_type: opts.resourceType,
          type: "authenticated",
          public_id: opts.publicId,
          overwrite: false,
        },
        (err, res) => (err || !res ? reject(err ?? new Error("Upload failed")) : resolve({ storedId: toStoredId(res), raw: res })),
      )
      .end(buffer);
  });
}

/**
 * Parameters for a direct browser upload. The browser posts the file plus
 * api_key, timestamp, signature, folder and type to
 * https://api.cloudinary.com/v1_1/{cloudName}/{resourceType}/upload.
 */
export function signUpload(folder: string, resourceType: ResourceType) {
  const e = env();
  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder, timestamp, type: "authenticated" };
  const signature = client().utils.api_sign_request(params, e.CLOUDINARY_API_SECRET);
  return { cloudName: e.CLOUDINARY_CLOUD_NAME, apiKey: e.CLOUDINARY_API_KEY, resourceType, signature, ...params };
}

/**
 * Time-limited download URL (5 minutes by default). Standard signed delivery
 * URLs never expire, so authenticated assets are only served through this.
 */
export function privateDownloadUrl(storedId: string, ttlSeconds = 300): string {
  const { resourceType, publicId, format } = parseStoredId(storedId);
  return client().utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: "authenticated",
    expires_at: Math.round(Date.now() / 1000) + ttlSeconds,
  });
}

/** Fetch a stored file's bytes on the server (for email attachments, pdf-lib). */
export async function downloadBuffer(storedId: string): Promise<Buffer> {
  const res = await fetch(privateDownloadUrl(storedId, 60));
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteAsset(storedId: string): Promise<void> {
  const { resourceType, publicId } = parseStoredId(storedId);
  await client().uploader.destroy(publicId, { resource_type: resourceType, type: "authenticated", invalidate: true });
}

export async function listFolder(folder: string, resourceType: ResourceType): Promise<{ storedId: string; createdAt: string }[]> {
  const res = await client().api.resources({
    type: "authenticated",
    resource_type: resourceType,
    prefix: folder,
    max_results: 500,
  });
  return (res.resources as { public_id: string; resource_type: string; format?: string; created_at: string }[]).map((r) => ({
    storedId: toStoredId(r),
    createdAt: r.created_at,
  }));
}

/**
 * The value saved in Firestore for any file: "{resourceType}:{publicId}", plus
 * ".{format}" for images (raw public ids already include their extension).
 */
export function toStoredId(res: { resource_type: string; public_id: string; format?: string }): string {
  const rt = res.resource_type === "raw" ? "raw" : "image";
  return rt === "image" && res.format ? `image:${res.public_id}.${res.format}` : `${rt}:${res.public_id}`;
}

export function parseStoredId(storedId: string): { resourceType: ResourceType; publicId: string; format: string } {
  const idx = storedId.indexOf(":");
  const rt = storedId.slice(0, idx);
  const full = storedId.slice(idx + 1);
  if (rt === "image") {
    const dot = full.lastIndexOf(".");
    return dot > 0
      ? { resourceType: "image", publicId: full.slice(0, dot), format: full.slice(dot + 1) }
      : { resourceType: "image", publicId: full, format: "png" };
  }
  return { resourceType: "raw", publicId: full, format: "" };
}

/** projectId encoded in a stored id's folder, or null (backups, foreign ids). */
export function projectIdOf(storedId: string): string | null {
  const m = /^(?:raw|image):pmt\/projects\/([^/]+)\//.exec(storedId);
  return m ? m[1] : null;
}

/** True when a stored id sits in the expected project folder. Check before saving any browser-supplied id. */
export function isInFolder(storedId: string, projectId: string, purpose: UploadPurpose): boolean {
  if (!/^(raw|image):/.test(storedId)) return false;
  const { publicId } = parseStoredId(storedId);
  return publicId.startsWith(`${projectFolder(projectId, purpose)}/`) && !publicId.includes("..");
}
