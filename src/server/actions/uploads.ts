"use server";

import { z } from "zod";
import { requireAny } from "@/lib/auth/session";
import { projectFolder, signUpload } from "@/lib/cloudinary";
import { canAccessProject } from "@/server/data/access";
import { col } from "@/server/data/refs";
import { fromDoc } from "@/server/data/convert";
import { run, UserError } from "@/server/action";
import type { Project } from "@/lib/types";

const input = z.object({
  projectId: z.string().min(1),
  purpose: z.enum(["receipts", "revisions"]),
  resourceType: z.enum(["raw", "image"]),
});

/** Signed parameters for a direct browser upload into a project's folder. */
export async function getUploadSignature(raw: z.input<typeof input>) {
  return run(async () => {
    const { projectId, purpose, resourceType } = input.parse(raw);
    const session = await requireAny();
    if (purpose === "receipts" && session.role !== "admin") throw new UserError("Not allowed");
    const snap = await col.projects().doc(projectId).get();
    if (!snap.exists || !canAccessProject(session, fromDoc<Project>(snap))) throw new UserError("Not found");
    return signUpload(projectFolder(projectId, purpose), resourceType);
  });
}
