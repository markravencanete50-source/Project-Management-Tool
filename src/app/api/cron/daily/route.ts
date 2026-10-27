import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { env, appUrl } from "@/lib/env";
import { BACKUP_FOLDER, deleteAsset, listFolder, uploadBuffer } from "@/lib/cloudinary";
import { formatIsoDate, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { projectFinance } from "@/lib/finance";
import { REVISION_WAITING_ON_ADMIN } from "@/lib/projects";
import { sendAdminDigest, type DigestData } from "@/lib/email";
import { col } from "@/server/data/refs";
import { fromDocs } from "@/server/data/convert";
import { exportAll } from "@/server/export";
import type { Client, Payment, Project, Prospect, Revision, ScheduleLine } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BACKUPS_TO_KEEP = 30;
const TOKEN_MAX_AGE_DAYS = 7;

/** Constant time comparison of the bearer token against CRON_SECRET. */
function authorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  const given = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(`Bearer ${env().CRON_SECRET}`).digest();
  return timingSafeEqual(given, expected);
}

async function digestStep() {
  const today = todayIso();

  const [prospectsSnap, projectsSnap, clientsSnap] = await Promise.all([
    col.prospects().get(),
    col.projects().get(),
    col.clients().get(),
  ]);
  const clientNames = new Map(fromDocs<Client>(clientsSnap).map((c) => [c.id, c.name]));

  const followUps: DigestData["followUps"] = fromDocs<Prospect>(prospectsSnap)
    .filter((p) => !p.archivedAt && p.stage !== "won" && p.stage !== "lost" && p.nextFollowUp !== null && p.nextFollowUp <= today)
    .sort((a, b) => String(a.nextFollowUp).localeCompare(String(b.nextFollowUp)))
    .map((p) => ({
      name: p.name,
      company: p.company,
      nextFollowUp: formatIsoDate(p.nextFollowUp as string),
      url: appUrl(`/admin/prospects/${p.id}`),
    }));

  const overdue: DigestData["overdue"] = [];
  const revisions: DigestData["revisions"] = [];

  const projects = fromDocs<Project>(projectsSnap).filter((p) => !p.archivedAt);
  await Promise.all(
    projects.map(async (project) => {
      const [scheduleSnap, paymentsSnap, revisionsSnap] = await Promise.all([
        col.schedule(project.id).get(),
        col.payments(project.id).get(),
        col.revisions(project.id).get(),
      ]);
      const finance = projectFinance({
        contractValue: project.contractValue,
        schedule: fromDocs<ScheduleLine>(scheduleSnap),
        payments: fromDocs<Payment>(paymentsSnap),
        today,
      });
      const url = appUrl(`/admin/projects/${project.id}`);
      for (const line of finance.overdueLines) {
        overdue.push({
          projectTitle: project.title,
          clientName: clientNames.get(project.clientId) ?? "Unknown client",
          label: line.label,
          outstanding: formatMoney(line.outstanding, project.currency),
          dueDate: formatIsoDate(line.dueDate),
          url,
        });
      }
      for (const revision of fromDocs<Revision>(revisionsSnap)) {
        if (REVISION_WAITING_ON_ADMIN.includes(revision.status)) {
          revisions.push({ projectTitle: project.title, round: revision.round, status: revision.status, url });
        }
      }
    }),
  );
  overdue.sort((a, b) => a.projectTitle.localeCompare(b.projectTitle) || a.label.localeCompare(b.label));
  revisions.sort((a, b) => a.projectTitle.localeCompare(b.projectTitle) || a.round - b.round);

  const counts = { followUps: followUps.length, overdue: overdue.length, revisions: revisions.length };
  if (counts.followUps + counts.overdue + counts.revisions === 0) return { sent: false, ...counts };
  await sendAdminDigest({ followUps, overdue, revisions });
  return { sent: true, ...counts };
}

async function backupStep() {
  const data = await exportAll();
  const name = `${todayIso()}.json`;
  const { storedId } = await uploadBuffer(Buffer.from(JSON.stringify(data)), {
    folder: BACKUP_FOLDER,
    resourceType: "raw",
    publicId: name,
  });

  // Names are dates, so newest first is a reverse sort. Ignore anything that is
  // not one of our dated backups so a stray file is never deleted.
  const existing = (await listFolder(BACKUP_FOLDER, "raw"))
    .filter((f) => /\/\d{4}-\d{2}-\d{2}\.json$/.test(f.storedId))
    .sort((a, b) => b.storedId.localeCompare(a.storedId));
  const stale = existing.slice(BACKUPS_TO_KEEP);
  for (const file of stale) await deleteAsset(file.storedId);
  return { stored: storedId, kept: Math.min(existing.length, BACKUPS_TO_KEEP), deleted: stale.length };
}

async function tokenCleanupStep() {
  const cutoff = Timestamp.fromMillis(Date.now() - TOKEN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  let deleted = 0;
  for (;;) {
    const snap = await col.loginTokens().where("expiresAt", "<", cutoff).limit(400).get();
    if (snap.empty) break;
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) break;
  }
  return { deleted };
}

type StepResult = { ok: true; result: unknown } | { ok: false; error: string };

async function step(name: string, fn: () => Promise<unknown>): Promise<StepResult> {
  try {
    return { ok: true, result: await fn() };
  } catch (err) {
    console.error(`[cron] ${name} failed`, err);
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

/** GET /api/cron/daily, called by Vercel Cron with Authorization: Bearer CRON_SECRET. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });

  const digest = await step("digest", digestStep);
  const backup = await step("backup", backupStep);
  const tokens = await step("tokens", tokenCleanupStep);

  const allOk = digest.ok && backup.ok && tokens.ok;
  return NextResponse.json({ ok: allOk, date: todayIso(), digest, backup, tokens }, { status: allOk ? 200 : 500 });
}
