// Browser half of the e2e run: mobile screenshots with layout assertions, and
// the real UI flows that drive server actions. Uses playwright-core with the
// system Chrome (nothing is downloaded).
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { getFirestore } from "firebase-admin/firestore";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SHOTS = path.join(HERE, "screenshots");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const EM_DASH = /\u2014/;
const EMOJI = /\p{Extended_Pictographic}/u;

const slug = (s) => s.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "") || "root";

export async function runBrowser({ base, cookies, ids, check }) {
  const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error("System Chrome not found. Set CHROME_PATH.");

  if (existsSync(SHOTS)) for (const f of readdirSync(SHOTS)) rmSync(path.join(SHOTS, f), { force: true });
  mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({ executablePath, headless: true });
  const host = new URL(base).hostname;
  const mobileOpts = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  async function context(cookie, opts = mobileOpts) {
    const ctx = await browser.newContext(opts);
    if (cookie) await ctx.addCookies([{ name: "__session", value: cookie, domain: host, path: "/", httpOnly: true, sameSite: "Lax" }]);
    return ctx;
  }

  const consoleProblems = [];
  function watch(page, label) {
    page.on("pageerror", (e) => consoleProblems.push(`${label}: pageerror ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text();
      // Fonts or images blocked offline are not app bugs.
      if (/Failed to load resource|net::ERR_/.test(text)) return;
      consoleProblems.push(`${label}: console.error ${text.slice(0, 300)}`);
    });
  }

  /** Visit a page, assert layout, screenshot. */
  async function inspect(page, p, { width = 375, full = true, name } = {}) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    // Let the motion/animation settle and charts finish their entry animation.
    await page.waitForTimeout(900);
    const probe = await page.evaluate(() => {
      const placeholders = [...document.querySelectorAll("[placeholder]")].map((e) => e.getAttribute("placeholder")).join(" ");
      const labels = [...document.querySelectorAll("[aria-label],[title]")].map((e) => `${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("title") ?? ""}`).join(" ");
      // Elements that stick out past the viewport on the right, to name the culprit.
      const wide = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > window.innerWidth + 1) {
          let scrollable = false;
          for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
            const o = getComputedStyle(n).overflowX;
            if (o === "auto" || o === "scroll" || o === "hidden") {
              scrollable = true;
              break;
            }
          }
          if (!scrollable) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} right=${Math.round(r.right)}`);
        }
        if (wide.length >= 4) break;
      }
      return {
        scrollWidth: document.documentElement.scrollWidth,
        text: document.body.innerText + " " + placeholders + " " + labels + " " + document.title,
        wide,
      };
    });
    const file = path.join(SHOTS, `${name ?? slug(p)}-${width}.png`);
    await page.screenshot({ path: file, fullPage: full });
    return probe;
  }

  async function pageChecks(page, p, label, opts = {}) {
    const width = opts.width ?? 375;
    let probe;
    await check(`${label}: ${p} renders (screenshot)`, async () => {
      probe = await inspect(page, p, opts);
      return true;
    });
    if (!probe) return;
    await check(`${label}: ${p} has no horizontal page overflow at ${width}px`, () =>
      probe.scrollWidth <= width || `scrollWidth ${probe.scrollWidth} > ${width}; wide elements: ${probe.wide.join(", ")}`,
    );
    await check(`${label}: ${p} has no em dashes or emojis in UI text`, () => {
      if (EM_DASH.test(probe.text)) return "em dash found";
      const m = probe.text.match(EMOJI);
      return !m || `emoji found: ${m[0]}`;
    });
  }

  try {
    // ------------------------------------------------------------- public
    {
      const ctx = await context(null);
      const page = await ctx.newPage();
      watch(page, "public");
      await pageChecks(page, "/login", "public");
      await ctx.close();
    }

    // -------------------------------------------------------------- admin
    const adminCtx = await context(cookies.admin);
    const admin = await adminCtx.newPage();
    watch(admin, "admin");
    const adminPaths = [
      "/admin",
      "/admin/prospects",
      "/admin/prospects?view=kanban",
      "/admin/prospects/pr-due",
      "/admin/prospects/pr-lost",
      "/admin/clients",
      `/admin/clients/${ids.clientA}`,
      "/admin/projects",
      "/admin/projects/new",
      `/admin/projects/${ids.projA1}`,
      `/admin/projects/${ids.projA1}?tab=payments`,
      `/admin/projects/${ids.projA1}?tab=agreement`,
      `/admin/projects/${ids.projA1}?tab=revisions`,
      `/admin/projects/${ids.projA1}?tab=activity`,
      `/admin/projects/${ids.projA2}`,
      `/admin/projects/${ids.projB2}?tab=payments`,
      "/admin/settings",
    ];
    for (const p of adminPaths) await pageChecks(admin, p, "admin mobile");

    {
      const ctx = await context(cookies.admin, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      watch(page, "admin desktop");
      await pageChecks(page, "/admin", "admin desktop", { width: 1280, name: "admin-desktop" });
      await ctx.close();
    }

    // ------------------------------------------------------------- client
    {
      const ctx = await context(cookies.a);
      const page = await ctx.newPage();
      watch(page, "client");
      for (const p of ["/portal", `/portal/projects/${ids.projA1}`, `/portal/projects/${ids.projA1}/agreement`]) {
        await pageChecks(page, p, "client mobile");
      }
      await ctx.close();
    }

    // ---------------------------------------------------------- UI flows
    const db = getFirestore();
    const clickText = (page, text, opts) => page.getByRole("button", { name: text, ...opts });

    await check("UI: create a client", async () => {
      await admin.goto(`${base}/admin/clients`, { waitUntil: "networkidle" });
      await admin.getByRole("button", { name: "New client" }).first().click();
      await admin.getByLabel("Name").fill("Carol Created");
      await admin.getByLabel("Company").fill("Created Co");
      await admin.getByLabel("Email").fill("Carol@Created.test");
      await admin.getByRole("button", { name: "Create client" }).click();
      await admin.waitForURL(/\/admin\/clients\/[^/?]+$/, { timeout: 15000 });
      await admin.getByText("Carol Created").first().waitFor({ timeout: 10000 });
      const snap = await db.collection("clients").where("email", "==", "carol@created.test").get();
      if (snap.size !== 1) return `expected one client doc with lowercased email, found ${snap.size}`;
      const act = await db.collection("activity").where("clientId", "==", snap.docs[0].id).get();
      return act.size >= 1 || "no activity entry written for the new client";
    });

    let newProjectId = null;
    await check("UI: create a project for the new client", async () => {
      const clientId = admin.url().split("/").pop();
      await clickText(admin, "New project").first().or(admin.getByRole("link", { name: "New project" }).first()).click();
      await admin.waitForURL(/\/admin\/projects\/new\?clientId=/, { timeout: 10000 });
      await admin.getByLabel("Title").fill("Carol Landing Page");
      await admin.getByLabel("Description").fill("One page marketing site");
      await admin.getByLabel("Contract value").fill("2500.50");
      await admin.getByRole("button", { name: "Create project" }).click();
      await admin.waitForURL(/\/admin\/projects\/[^/?]+$/, { timeout: 15000 });
      await admin.getByText("Carol Landing Page").first().waitFor({ timeout: 10000 });
      newProjectId = admin.url().split("/").pop();
      const doc = await db.collection("projects").doc(newProjectId).get();
      if (!doc.exists) return "project doc missing";
      if (doc.get("clientId") !== clientId) return "project not linked to the new client";
      if (doc.get("contractValue") !== 250050) return `contractValue stored as ${doc.get("contractValue")}, expected 250050`;
      return doc.get("status") === "draft" || `status ${doc.get("status")}`;
    });

    await check("UI: add a payment", async () => {
      if (!newProjectId) return "no project from the previous step";
      await admin.goto(`${base}/admin/projects/${newProjectId}?tab=payments`, { waitUntil: "networkidle" });
      await admin.getByRole("button", { name: "Add payment" }).first().click();
      await admin.getByLabel(/^Amount/).fill("100.25");
      await admin.getByRole("button", { name: "Record payment" }).click();
      await admin.getByText("100.25").first().waitFor({ timeout: 15000 });
      const snap = await db.collection("projects").doc(newProjectId).collection("payments").get();
      if (snap.size !== 1) return `expected one payment doc, found ${snap.size}`;
      if (snap.docs[0].get("amount") !== 10025) return `amount stored as ${snap.docs[0].get("amount")}`;
      const act = await db.collection("activity").where("projectId", "==", newProjectId).get();
      return act.docs.some((d) => d.get("visibility") === "client") || "no client-visible activity for the payment";
    });

    await check("UI: add a second payment on a seeded project and see the totals change", async () => {
      await admin.goto(`${base}/admin/projects/${ids.projB1}?tab=payments`, { waitUntil: "networkidle" });
      await admin.getByRole("button", { name: "Add payment" }).first().click();
      await admin.getByLabel(/^Amount/).fill("1000");
      await admin.getByRole("button", { name: "Record payment" }).click();
      await admin.getByText("$1,000.00").first().waitFor({ timeout: 15000 });
      return true;
    });

    await check("UI: move a prospect to another stage", async () => {
      await admin.goto(`${base}/admin/prospects/pr-new`, { waitUntil: "networkidle" });
      await admin.getByRole("combobox", { name: "Stage" }).click();
      await admin.getByRole("option", { name: "Contacted" }).click();
      await admin.getByText("Stage updated").first().waitFor({ timeout: 10000 });
      await admin.waitForTimeout(500);
      const doc = await db.collection("prospects").doc("pr-new").get();
      return doc.get("stage") === "contacted" || `stage is ${doc.get("stage")}`;
    });

    await check("UI: moving a prospect to lost asks for a reason", async () => {
      await admin.goto(`${base}/admin/prospects/pr-neg`, { waitUntil: "networkidle" });
      await admin.getByRole("combobox", { name: "Stage" }).click();
      await admin.getByRole("option", { name: "Lost" }).click();
      await admin.getByRole("dialog").getByRole("heading", { name: "Mark as lost" }).waitFor({ timeout: 5000 });
      const confirm = admin.getByRole("dialog").getByRole("button", { name: /^(Mark as lost|Confirm|Save)/ }).last();
      if (!(await confirm.isDisabled())) return "confirm button enabled before a reason is chosen";
      await admin.getByRole("dialog").getByRole("combobox").click();
      await admin.getByRole("option", { name: "Timing" }).click();
      await confirm.click();
      await admin.getByText("Stage updated").first().waitFor({ timeout: 10000 });
      await admin.waitForTimeout(500);
      const doc = await db.collection("prospects").doc("pr-neg").get();
      if (doc.get("stage") !== "lost" || doc.get("lostReason") !== "timing") return `stage ${doc.get("stage")} reason ${doc.get("lostReason")}`;
      return doc.get("closedAt") != null || "closedAt not set";
    });

    await check("UI: new data shows on the dashboard totals", async () => {
      await admin.goto(`${base}/admin`, { waitUntil: "networkidle" });
      const text = await admin.evaluate(() => document.body.innerText);
      return text.includes("$1,250.00") || "expected USD earned this month $250.00 + $1,000.00 = $1,250.00";
    });

    await adminCtx.close();

    await check("no browser console errors or page errors", () => consoleProblems.length === 0 || [...new Set(consoleProblems)].slice(0, 6).join(" || "));
  } finally {
    await browser.close();
  }
  return [];
}
