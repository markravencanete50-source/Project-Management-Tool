/** Link for a stored file id. Never link to Cloudinary directly. */
export function fileUrl(storedId: string): string {
  return `/api/files/${storedId.split("/").map(encodeURIComponent).join("/")}`;
}
