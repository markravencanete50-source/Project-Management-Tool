import { createHash } from "node:crypto";

/** Lowercase hex SHA-256 of a buffer or string. */
export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}
