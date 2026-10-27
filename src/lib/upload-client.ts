"use client";

import { getUploadSignature } from "@/server/actions/uploads";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Upload a file straight from the browser to Cloudinary (never through a
 * Vercel function, which caps bodies at 4.5 MB). Returns the stored id; pass it
 * to a server action, which must check it with isInFolder() before saving.
 */
export async function uploadFile(
  file: File,
  opts: { projectId: string; purpose: "receipts" | "revisions" },
): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be 10 MB or smaller");
  const resourceType = file.type.startsWith("image/") ? "image" : "raw";
  const sig = await getUploadSignature({ ...opts, resourceType });
  if (!sig.ok) throw new Error(sig.error);

  const body = new FormData();
  body.append("file", file);
  body.append("api_key", sig.data.apiKey);
  body.append("timestamp", String(sig.data.timestamp));
  body.append("signature", sig.data.signature);
  body.append("folder", sig.data.folder);
  body.append("type", sig.data.type);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.data.cloudName}/${resourceType}/upload`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error("Upload failed");
  const json = (await res.json()) as { resource_type: string; public_id: string; format?: string };
  return json.resource_type === "raw" ? `raw:${json.public_id}` : `image:${json.public_id}.${json.format ?? "png"}`;
}
