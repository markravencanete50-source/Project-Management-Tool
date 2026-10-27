// End to end test runner. Usage: pnpm test:e2e
//
// Starts the Firebase Auth and Firestore emulators (demo project, no login or
// network needed), builds the app if needed, runs `next start` against the
// emulators, seeds data, then checks routes, access control, API routes and
// drives the UI with system Chrome through playwright-core.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INTERNAL_NOTE, CLIENT_NOTE, IDS, PROJECT_ID, seed, sessionCookieFor } from "./seed.mjs";
import { runBrowser } from "./browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);

// ---------------------------------------------------------------- bootstrap
// Re-run ourselves inside `firebase emulators:exec` so the emulators are
// started and stopped for us and their host variables are set.
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  const cmd = `pnpm exec firebase emulators:exec --only firestore,auth --project ${PROJECT_ID} "node tests/e2e/run.mjs"`;
  const child = spawn(cmd, { stdio: "inherit", shell: true, cwd: ROOT });
  child.on("exit", (code) => process.exit(code ?? 1));
  await new Promise(() => {});
}

// ------------------------------------------------------------------ helpers
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${detail}`}`);
}
async function check(name, fn) {
  try {
    const out = await fn();
    if (out === true || out === undefined) record(name, true);
    else record(name, false, String(out));
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
  }
}

function newestMtime(dir, skip = new Set()) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const t = entry.isDirectory() ? newestMtime(full, skip) : statSync(full).mtimeMs;
    if (t > newest) newest = t;
  }
  return newest;
}

function ensureBuild() {
  const marker = path.join(ROOT, ".next", "BUILD_ID");
  let stale = !existsSync(marker);
  if (!stale) {
    const built = statSync(marker).mtimeMs;
    const sources = Math.max(
      newestMtime(path.join(ROOT, "src")),
      newestMtime(path.join(ROOT, "public")),
      ...["package.json", "next.config.ts", "tsconfig.json", "pnpm-lock.yaml"].map((f) => statSync(path.join(ROOT, f)).mtimeMs),
    );
    stale = sources > built;
  }
  if (!stale) {
    console.log("Build is up to date, skipping pnpm build");
    return;
  }
  console.log("Running pnpm build ...");
  const r = spawnSync("pnpm build", { stdio: "inherit", shell: true, cwd: ROOT, env: buildEnv() });
  if (r.status !== 0) throw new Error("pnpm build failed");
}

function buildEnv(extra = {}) {
  return { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...extra };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync(`taskkill /PID ${child.pid} /T /F`, { shell: true, stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function waitFor(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start at ${url}`);
}

// --------------------------------------------------------------------- main
let server;
let exitCode = 1;
try {
  ensureBuild();
  const port = await freePort();
  const base = `http://localhost:${port}`;

  const appEnv = buildEnv({
    NODE_ENV: "production",
    PORT: String(port),
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    GCLOUD_PROJECT: PROJECT_ID,
    FIREBASE_ADMIN_PROJECT_ID: PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:abcdef",
    CLOUDINARY_CLOUD_NAME: "demo-cloud",
    CLOUDINARY_API_KEY: "123456789012345",
    CLOUDINARY_API_SECRET: "demo-secret-demo-secret",
    EMAIL_FROM: "E2E <e2e@example.com>",
    ADMIN_EMAIL: "admin@example.com",
    APP_URL: base,
    CRON_SECRET: "e2e-cron-secret-0123456789",
  });
  delete appEnv.RESEND_API_KEY;

  let serverLog = "";
  server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: ROOT,
    env: appEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  await waitFor(`${base}/login`);
  console.log(`App running at ${base}`);

  // The seed and the session helper use firebase-admin in this process.
  await seed();
  const cookies = {
    admin: await sessionCookieFor(IDS.adminUid, base),
    a: await sessionCookieFor(IDS.authA, base),
    b: await sessionCookieFor(IDS.authB, base),
  };

  const get = async (p, cookie, init = {}) => {
    const res = await fetch(base + p, {
      redirect: "manual",
      ...init,
      headers: { ...(cookie ? { cookie: `__session=${cookie}` } : {}), ...(init.headers ?? {}) },
    });
    const text = await res.text();
    return { status: res.status, location: res.headers.get("location") ?? "", text, res };
  };
  const isNotFound = (r) => r.status === 404 || /This page could not be found|NEXT_HTTP_ERROR_FALLBACK;404/.test(r.text);
  const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

  // ---- session route
  await check("POST /api/auth/session with bad Origin is rejected", async () => {
    const r = await get("/api/auth/session", null, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ idToken: "x" }),
    });
    return r.status === 403 || `status ${r.status}`;
  });
  await check("POST /api/auth/session with no Origin is rejected", async () => {
    const r = await get("/api/auth/session", null, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: "x" }) });
    return r.status === 403 || `status ${r.status}`;
  });
  await check("POST /api/auth/session with garbage token is 401", async () => {
    const r = await get("/api/auth/session", null, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ idToken: "x".repeat(40) }) });
    return r.status === 401 || `status ${r.status}`;
  });

  // ---- unauthenticated
  for (const p of ["/admin", "/portal", "/admin/projects", `/portal/projects/${IDS.projA1}`]) {
    await check(`unauthenticated ${p} redirects to /login`, async () => {
      const r = await get(p);
      return ([307, 308, 302].includes(r.status) && r.location.endsWith("/login")) || `status ${r.status} location ${r.location}`;
    });
  }

  // ---- admin pages
  const aText = (r, ...needles) => {
    const t = strip(r.text);
    const missing = needles.filter((n) => !t.includes(n));
    if (missing.length && process.env.E2E_DEBUG) console.log(t.slice(0, 3000));
    return missing.length === 0 || `missing text: ${missing.join(" | ")}`;
  };
  const adminPages = [
    ["/admin", ["£120.00", "$250.00", "Build milestone"]],
    ["/admin/prospects", ["Nina New", "Carl Contacted", "Lena Lost"]],
    ["/admin/prospects?view=kanban", ["Nina New", "Pia Proposal"]],
    ["/admin/prospects/pr-due", ["Carl Contacted", "Followup Inc"]],
    ["/admin/clients", ["Alice Anders", "Bob Brown"]],
    [`/admin/clients/${IDS.clientA}`, ["Alice Anders", "Acme Website Rebuild"]],
    ["/admin/projects", ["Acme Website Rebuild", "Beta Portal Build", "Acme Draft Brochure"]],
    ["/admin/projects/new", []],
    [`/admin/projects/${IDS.projA1}`, ["Acme Website Rebuild", "Design approved"]],
    [`/admin/projects/${IDS.projA1}?tab=overview`, ["Design approved", "Build complete"]],
    [`/admin/projects/${IDS.projA1}?tab=payments`, ["Build milestone", "Overdue", "£1,000.00"]],
    [`/admin/projects/${IDS.projA1}?tab=agreement`, ["Signed"]],
    [`/admin/projects/${IDS.projA1}?tab=revisions`, ["Add a new pricing page"]],
    [`/admin/projects/${IDS.projA1}?tab=activity`, [CLIENT_NOTE, INTERNAL_NOTE]],
    ["/admin/settings", ["Agreement template", "Export all data"]],
  ];
  for (const [p, needles] of adminPages) {
    await check(`admin GET ${p} is 200`, async () => {
      const r = await get(p, cookies.admin);
      if (r.status !== 200) return `status ${r.status}`;
      return aText(r, ...needles);
    });
  }
  await check("admin on /portal is redirected to /login", async () => {
    const r = await get("/portal", cookies.admin);
    const redirected = ([302, 303, 307, 308].includes(r.status) && r.location.endsWith("/login")) || /NEXT_REDIRECT;[a-z]+;\/login/.test(r.text);
    return redirected || `status ${r.status}, no redirect`;
  });

  // ---- client A
  await check("client A GET /portal is 200 and lists their active project", async () => {
    const r = await get("/portal", cookies.a);
    if (r.status !== 200) return `status ${r.status}`;
    const t = strip(r.text);
    if (!t.includes("Acme Website Rebuild")) return "own project missing";
    if (t.includes("Acme Draft Brochure")) return "draft project leaked";
    if (t.includes("Beta Portal Build")) return "other client's project leaked";
    return true;
  });
  await check("client A GET own active project is 200 with payments and no internal activity", async () => {
    const r = await get(`/portal/projects/${IDS.projA1}`, cookies.a);
    if (r.status !== 200) return `status ${r.status}`;
    const t = strip(r.text);
    if (!t.includes("Acme Website Rebuild")) return "title missing";
    if (!t.includes("Build milestone")) return "schedule missing";
    if (!t.includes(CLIENT_NOTE)) return "client-visible activity missing";
    if (t.includes(INTERNAL_NOTE) || r.text.includes("INTERNAL-ONLY")) return "INTERNAL activity leaked";
    return true;
  });
  await check("client A cannot open client B's project", async () => {
    const r = await get(`/portal/projects/${IDS.projB1}`, cookies.a);
    if (r.status === 200 && strip(r.text).includes("Beta Portal Build")) return "B's data visible";
    return isNotFound(r) || `status ${r.status}`;
  });
  await check("client A cannot open their own draft project", async () => {
    const r = await get(`/portal/projects/${IDS.projA2}`, cookies.a);
    if (strip(r.text).includes("Acme Draft Brochure")) return "draft visible";
    return isNotFound(r) || `status ${r.status}`;
  });
  await check("client A cannot open B's agreement page", async () => {
    const r = await get(`/portal/projects/${IDS.projB1}/agreement`, cookies.a);
    if (strip(r.text).includes("Beta Portal Build")) return "B's data visible";
    return isNotFound(r) || `status ${r.status}`;
  });
  for (const p of ["/admin", "/admin/projects", `/admin/projects/${IDS.projA1}`, "/admin/settings"]) {
    await check(`client A on ${p} is redirected to /login, no admin content`, async () => {
      const r = await get(p, cookies.a);
      const t = strip(r.text);
      if (["Earned this month", "Contract value", "Export all data", "Alice Anders"].some((x) => t.includes(x))) return "admin content served to a client";
      const redirected = ([302, 303, 307, 308].includes(r.status) && r.location.endsWith("/login")) || /NEXT_REDIRECT;[a-z]+;\/login/.test(r.text);
      return redirected || `status ${r.status}, no redirect to /login`;
    });
  }

  // ---- files
  const bFile = `/api/files/raw:pmt/projects/${IDS.projB1}/receipts/x.pdf`;
  await check("files: client A requesting B's file is 404", async () => ((await get(bFile, cookies.a)).status === 404) || "not 404");
  await check("files: no cookie is 401", async () => ((await get(bFile)).status === 401) || "not 401");
  await check("files: admin gets a redirect to a Cloudinary private download URL", async () => {
    const r = await get(bFile, cookies.admin);
    return (r.status === 302 && r.location.startsWith("https://api.cloudinary.com/")) || `status ${r.status} ${r.location}`;
  });
  await check("files: client A requesting backups is 404", async () => ((await get("/api/files/raw:pmt/backups/2026-01-01.json", cookies.a)).status === 404) || "not 404");

  // ---- export
  await check("export json as admin has the seeded data", async () => {
    const r = await get("/api/export?format=json", cookies.admin);
    if (r.status !== 200) return `status ${r.status}`;
    const data = JSON.parse(r.text);
    const s = JSON.stringify(data);
    return ["Acme Website Rebuild", "Beta Portal Build", "Nina New", "Alice Anders"].every((n) => s.includes(n)) || "seed names missing from export";
  });
  await check("export csv as admin is 200", async () => {
    const r = await get("/api/export?format=csv", cookies.admin);
    return (r.status === 200 && r.text.includes("Acme Website Rebuild")) || `status ${r.status}`;
  });
  await check("export as client A is refused", async () => [401, 403].includes((await get("/api/export?format=json", cookies.a)).status) || "not 401/403");
  await check("export with no cookie is refused", async () => [401, 403].includes((await get("/api/export?format=json")).status) || "not 401/403");

  // ---- cron
  await check("cron without secret is 401", async () => ((await get("/api/cron/daily")).status === 401) || "not 401");
  await check("cron with wrong secret is 401", async () => ((await get("/api/cron/daily", null, { headers: { authorization: "Bearer nope-nope-nope-nope" } })).status === 401) || "not 401");
  await check("cron with secret runs the digest and token cleanup (backup fails against fake Cloudinary)", async () => {
    const r = await get("/api/cron/daily", null, { headers: { authorization: `Bearer ${appEnv.CRON_SECRET}` } });
    const body = JSON.parse(r.text);
    if (!body.digest?.ok) return `digest failed: ${JSON.stringify(body.digest)}`;
    if (!body.digest.result.sent) return `digest not sent: ${JSON.stringify(body.digest.result)}`;
    if (!body.tokens?.ok) return `token cleanup failed: ${JSON.stringify(body.tokens)}`;
    if (body.backup?.ok) return "backup unexpectedly succeeded against a fake Cloudinary";
    await new Promise((res) => setTimeout(res, 300));
    return /digest|Daily/i.test(serverLog) || "digest email was not logged";
  });

  // ---- browser
  await runBrowser({ base, cookies, ids: IDS, check });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("Server log tail:\n" + serverLog.split("\n").slice(-30).join("\n"));
  }
  exitCode = failed.length ? 1 : 0;
} catch (err) {
  console.error("E2E runner crashed:", err);
  exitCode = 1;
} finally {
  killTree(server);
}
process.exit(exitCode);
