import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { privateDownloadUrl, projectIdOf } from "@/lib/cloudinary";
import { canAccessProject } from "@/server/data/access";
import { col } from "@/server/data/refs";
import { fromDoc } from "@/server/data/convert";
import type { Project } from "@/lib/types";

/**
 * GET /api/files/{storedId} serves any stored file. Link to it with fileUrl()
 * from "@/lib/files". Checks the session and project ownership, then redirects
 * to a 5 minute Cloudinary download URL. Backups are admin only.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/files/[...storedId]">) {
  const { storedId: parts } = await ctx.params;
  const storedId = parts.map(decodeURIComponent).join("/");
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const projectId = projectIdOf(storedId);
  if (projectId) {
    const snap = await col.projects().doc(projectId).get();
    if (!snap.exists || !canAccessProject(session, fromDoc<Project>(snap))) {
      return new NextResponse("Not found", { status: 404 });
    }
  } else if (session.role !== "admin") {
    return new NextResponse("Not found", { status: 404 });
  }

  const res = NextResponse.redirect(privateDownloadUrl(storedId), 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
