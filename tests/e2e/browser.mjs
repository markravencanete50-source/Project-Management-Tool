// Browser half of the e2e run: mobile screenshots with layout assertions, and
// the real UI flows that drive server actions. Uses playwright-core with the
// system Chrome (nothing is downloaded).
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { runMatrix } from "./matrix.mjs";
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

  if (existsSync(SHOTS)) for (const f of readdirSync(SHOTS, { withFileTypes: true })) if (f.isFile()) rmSync(path.join(SHOTS, f.name), { force: true });
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
      "/admin/projects/new?kind=retainer",
      `/admin/projects/${ids.projR1}`,
      `/admin/projects/${ids.projR1}?tab=time`,
      `/admin/projects/${ids.projR1}?tab=payments`,
      `/admin/projects/${ids.projT1}`,
      `/admin/projects/${ids.projT1}?tab=tasks`,
      `/admin/projects/${ids.projT1}?tab=payments`,
      "/admin/prospects/pr-ret",
      "/admin?view=original",
      "/admin/settings",
      "/admin/payments",
    ];
    // E2E_FAST=1 skips the per-page mobile overflow sweeps (they dominate the run time) while iterating.
    if (!process.env.E2E_FAST) for (const p of adminPaths) await pageChecks(admin, p, "admin mobile");

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
      for (const p of ["/portal", `/portal/projects/${ids.projA1}`, `/portal/projects/${ids.projA1}/agreement`, `/portal/projects/${ids.projR1}`]) {
        await pageChecks(page, p, "client mobile");
      }
      await ctx.close();
    }
    {
      const ctx = await context(cookies.b);
      const page = await ctx.newPage();
      watch(page, "client b");
      await pageChecks(page, `/portal/projects/${ids.projT1}`, "client mobile");
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


    // ----------------------------------------------- retainer and tasks flows
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const firstOfThis = `${today.slice(0, 8)}01`;
    const prevMonthDay = (() => {
      const d = new Date(`${firstOfThis}T00:00:00Z`);
      d.setUTCDate(0);
      return `${d.toISOString().slice(0, 8)}10`;
    })();
    let carolId = null;
    let retainerId = null;
    let tasksId = null;

    await check("UI: create a retainer project from the kind picker", async () => {
      const clientSnap = await db.collection("clients").where("email", "==", "carol@created.test").get();
      carolId = clientSnap.docs[0].id;
      await admin.goto(`${base}/admin/projects/new?clientId=${carolId}`, { waitUntil: "networkidle" });
      await admin.getByRole("radio", { name: /^Retainer/ }).click();
      await admin.getByLabel("Title").fill("Carol Monthly Support");
      await admin.getByLabel("Rate per hour").fill("40");
      await admin.getByRole("button", { name: "Create project" }).click();
      await admin.waitForURL(/\/admin\/projects\/[^/?]+$/, { timeout: 15000 });
      await admin.getByText("Carol Monthly Support").first().waitFor({ timeout: 10000 });
      retainerId = admin.url().split("/").pop();
      const doc = await db.collection("projects").doc(retainerId).get();
      if (doc.get("kind") !== "retainer") return `kind ${doc.get("kind")}`;
      if (doc.get("rate") !== 4000 || doc.get("rateUnit") !== "hour") return `rate ${doc.get("rate")} ${doc.get("rateUnit")}`;
      if (doc.get("status") !== "active") return `status ${doc.get("status")}, retainers start active`;
      if (!doc.get("acceptedAt")) return "acceptedAt not set";
      if (doc.get("startDate") !== today) return `startDate ${doc.get("startDate")}`;
      return doc.get("contractValue") === 0 || "contractValue should be 0";
    });

    await check("UI: log time across two months, see month groups with subtotals", async () => {
      if (!retainerId) return "no retainer from the previous step";
      await admin.goto(`${base}/admin/projects/${retainerId}?tab=time`, { waitUntil: "networkidle" });
      for (const [date, hours, note] of [[prevMonthDay, "7.5", "Last month work"], [today, "2", "This month work"]]) {
        await admin.getByRole("button", { name: "Log time" }).first().click();
        await admin.getByLabel("Date worked").fill(date);
        await admin.getByLabel("Hours").fill(hours);
        await admin.getByLabel("Note (optional)").fill(note);
        await admin.getByRole("dialog").getByRole("button", { name: "Log time" }).click();
        await admin.getByText(note).first().waitFor({ timeout: 15000 });
      }
      const snap = await db.collection("projects").doc(retainerId).collection("timeEntries").get();
      const byDate = Object.fromEntries(snap.docs.map((d) => [d.get("date"), d.get("quantityHundredths")]));
      if (byDate[prevMonthDay] !== 750 || byDate[today] !== 200) return `entries ${JSON.stringify(byDate)}`;
      const text = await admin.evaluate(() => document.body.innerText);
      // 7.5h and 2h at 40.00: 300.00 and 80.00, one group each.
      if (!text.includes("300.00") || !text.includes("80.00")) return "month subtotals missing";
      if (!text.includes("In progress")) return "current month should be in progress";
      const act = await db.collection("activity").where("projectId", "==", retainerId).get();
      const timeAct = act.docs.filter((d) => d.get("type") === "time.logged");
      if (timeAct.length !== 2) return `expected 2 time.logged activity entries, got ${timeAct.length}`;
      return timeAct.every((d) => d.get("visibility") === "internal") || "time activity should be internal";
    });

    await check("UI: edit and delete a time entry", async () => {
      // The page header also has an Edit button, so work inside the entry's own row.
      const row = admin.locator("li").filter({ hasText: "This month work" });
      await row.getByRole("button", { name: "Edit" }).click();
      await admin.getByLabel("Hours").fill("3");
      await admin.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
      await admin.getByText("3 hours").first().waitFor({ timeout: 15000 });
      await row.getByRole("button", { name: "Delete" }).click();
      await admin.getByRole("dialog").getByRole("button", { name: "Delete entry" }).click();
      await admin.waitForTimeout(1500);
      const snap = await db.collection("projects").doc(retainerId).collection("timeEntries").get();
      return snap.size === 1 || `expected one entry left, found ${snap.size}`;
    });

    await check("UI: retainer payment shows paid, pending and overdue on the derived lines", async () => {
      // Re-add this month's entry so there are two months again (one of them overdue once last month is unpaid).
      await admin.goto(`${base}/admin/projects/${retainerId}?tab=time`, { waitUntil: "networkidle" });
      await admin.getByRole("button", { name: "Log time" }).first().click();
      await admin.getByLabel("Date worked").fill(today);
      await admin.getByLabel("Hours").fill("2");
      await admin.getByRole("dialog").getByRole("button", { name: "Log time" }).click();
      await admin.getByText("In progress").first().waitFor({ timeout: 15000 });
      await admin.goto(`${base}/admin/projects/${retainerId}?tab=payments`, { waitUntil: "networkidle" });
      await admin.getByRole("button", { name: "Add payment" }).first().click();
      await admin.getByLabel(/^Amount/).fill("100");
      await admin.getByRole("button", { name: "Record payment" }).click();
      await admin.getByText("Overdue", { exact: true }).first().waitFor({ timeout: 15000 });
      await admin.waitForTimeout(1500); // totals count up
      const text = await admin.evaluate(() => document.body.innerText);
      // Last month 300.00 billed, 100.00 paid: 200.00 outstanding and overdue. This month 80.00 in progress.
      for (const needle of ["380.00", "280.00", "Overdue", "In progress", "200.00"]) if (!text.includes(needle)) return `missing ${needle}`;
      const act = await db.collection("activity").where("projectId", "==", retainerId).get();
      return act.docs.some((d) => d.get("type") === "payment.recorded" && d.get("visibility") === "client") || "payment activity missing";
    });

    await check("UI: an hourly retainer with a working schedule shows expected earnings, a prefilled time entry and the meter", async () => {
      await admin.goto(`${base}/admin/projects/new?clientId=${carolId}`, { waitUntil: "networkidle" });
      await admin.getByRole("radio", { name: /^Retainer/ }).click();
      await admin.getByLabel("Title").fill("Carol Scheduled Support");
      await admin.getByLabel("Rate per hour").fill("25");
      await admin.getByLabel("Hours per day").fill("6");
      await admin.getByLabel("Days per month").fill("20");
      await admin.getByText("Expected per month:").first().waitFor({ timeout: 5000 });
      const form = await admin.evaluate(() => document.body.innerText);
      if (!form.includes("3,000.00")) return "expected per month should be 3,000.00 (25 x 6 x 20)";
      await admin.getByRole("button", { name: "Create project" }).click();
      await admin.waitForURL(/\/admin\/projects\/[^/?]+$/, { timeout: 15000 });
      const id = admin.url().split("/").pop();
      const doc = await db.collection("projects").doc(id).get();
      if (doc.get("hoursPerDay") !== 600 || doc.get("daysPerMonth") !== 2000) return `schedule ${doc.get("hoursPerDay")} ${doc.get("daysPerMonth")}`;
      await admin.goto(`${base}/admin/projects/${id}?tab=time`, { waitUntil: "networkidle" });
      await admin.getByRole("button", { name: "Log time" }).first().click();
      const qty = await admin.getByLabel("Hours").inputValue();
      if (qty !== "6") return `time entry should prefill 6 hours, got "${qty}"`;
      await admin.getByRole("dialog").getByRole("button", { name: "Log time" }).click();
      await admin.getByText("In progress").first().waitFor({ timeout: 15000 });
      const text = await admin.evaluate(() => document.body.innerText);
      return text.includes("of 120 expected hours") || "meter should read 6 of 120 expected hours";
    });

    await check("UI: a per-month retainer started two months ago bills three periods, with payment states", async () => {
      const twoAgo = (() => {
        const d = new Date(`${firstOfThis}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - 2);
        return `${d.toISOString().slice(0, 8)}10`;
      })();
      await admin.goto(`${base}/admin/projects/new?clientId=${carolId}`, { waitUntil: "networkidle" });
      await admin.getByRole("radio", { name: /^Retainer/ }).click();
      await admin.getByLabel("Title").fill("Carol Monthly Flat");
      await admin.locator("#project-unit").click();
      await admin.getByRole("option", { name: "Per month" }).click();
      await admin.getByLabel("Rate per month").fill("500");
      await admin.locator("#project-start").fill(twoAgo);
      await admin.getByRole("button", { name: "Create project" }).click();
      await admin.waitForURL(/\/admin\/projects\/[^/?]+$/, { timeout: 15000 });
      const id = admin.url().split("/").pop();
      const doc = await db.collection("projects").doc(id).get();
      if (doc.get("rateUnit") !== "month" || doc.get("rate") !== 50000) return `unit ${doc.get("rateUnit")} rate ${doc.get("rate")}`;
      await admin.goto(`${base}/admin/projects/${id}?tab=periods`, { waitUntil: "networkidle" });
      let text = await admin.evaluate(() => document.body.innerText);
      if (!text.includes("1,500.00") && !text.includes("1500.00")) return "three months at 500.00 should be billed as 1,500.00";
      if ((text.match(/500\.00/g) ?? []).length < 3) return "expected three 500.00 periods";
      await admin.goto(`${base}/admin/projects/${id}?tab=payments`, { waitUntil: "networkidle" });
      await admin.getByRole("button", { name: "Add payment" }).first().click();
      await admin.getByLabel(/^Amount/).fill("700");
      await admin.getByRole("button", { name: "Record payment" }).click();
      await admin.getByText("Overdue", { exact: true }).first().waitFor({ timeout: 15000 });
      await admin.waitForTimeout(1000);
      text = await admin.evaluate(() => document.body.innerText);
      for (const needle of ["Paid", "Overdue", "In progress"]) if (!text.includes(needle)) return `missing ${needle}`;
      const tabs = await admin.getByRole("tab", { name: "Billing periods" }).count();
      return tabs > 0 || "Billing periods tab missing";
    });

    await check("UI: a per-week retainer lists its weekly periods", async () => {
      const startDate = (() => {
        const d = new Date(`${today}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 15);
        return d.toISOString().slice(0, 10);
      })();
      await admin.goto(`${base}/admin/projects/new?clientId=${carolId}`, { waitUntil: "networkidle" });
      await admin.getByRole("radio", { name: /^Retainer/ }).click();
      await admin.getByLabel("Title").fill("Carol Weekly Flat");
      await admin.locator("#project-unit").click();
      await admin.getByRole("option", { name: "Per week" }).click();
      await admin.getByLabel("Rate per week").fill("100");
      await admin.locator("#project-start").fill(startDate);
      await admin.getByRole("button", { name: "Create project" }).click();
      await admin.waitForURL(/\/admin\/projects\/[^/?]+$/, { timeout: 15000 });
      const id = admin.url().split("/").pop();
      await admin.goto(`${base}/admin/projects/${id}?tab=periods`, { waitUntil: "networkidle" });
      const text = await admin.evaluate(() => document.body.innerText);
      return (text.match(/Week of /g) ?? []).length >= 3 || "expected at least three weekly periods";
    });

    await check("UI: create a tasks project, add tasks, tick one done, record a payment", async () => {
      await admin.goto(`${base}/admin/projects/new?clientId=${carolId}`, { waitUntil: "networkidle" });
      await admin.getByRole("radio", { name: /^Tasks/ }).click();
      await admin.getByLabel("Title").fill("Carol Small Jobs");
      await admin.getByLabel(/^Default price per task/).fill("150");
      await admin.getByRole("button", { name: "Create project" }).click();
      await admin.waitForURL(/\/admin\/projects\/[^/?]+$/, { timeout: 15000 });
      tasksId = admin.url().split("/").pop();
      const doc = await db.collection("projects").doc(tasksId).get();
      if (doc.get("kind") !== "tasks" || doc.get("status") !== "active" || !doc.get("acceptedAt")) return `project ${doc.get("kind")} ${doc.get("status")}`;
      if (doc.get("rate") !== 15000 || doc.get("rateUnit") !== null) return `default task price ${doc.get("rate")} ${doc.get("rateUnit")}`;

      await admin.goto(`${base}/admin/projects/${tasksId}?tab=tasks`, { waitUntil: "networkidle" });
      for (const [title, price] of [["Logo", "150"], ["Brochure", "400"]]) {
        await admin.getByRole("button", { name: "Add task" }).first().click();
        await admin.getByLabel("Task", { exact: true }).fill(title);
        if (title === "Logo") {
          const prefilled = await admin.getByLabel(/^Price/).inputValue();
          if (prefilled !== "150.00") return `task price should be prefilled with the default, got "${prefilled}"`;
        }
        await admin.getByLabel(/^Price/).fill(price);
        await admin.getByRole("dialog").getByRole("button", { name: "Add task" }).click();
        await admin.getByText(title, { exact: true }).first().waitFor({ timeout: 15000 });
      }
      const before = await db.collection("projects").doc(tasksId).collection("tasks").get();
      if (before.size !== 2 || before.docs.some((d) => d.get("status") !== "todo" || d.get("doneAt") !== null)) return "new tasks should be todo";

      await admin.getByRole("checkbox", { name: 'Mark "Logo" as done' }).click();
      await admin.getByRole("checkbox", { name: 'Mark "Logo" as not done' }).waitFor({ timeout: 10000 });
      await admin.waitForTimeout(800);
      const after = await db.collection("projects").doc(tasksId).collection("tasks").get();
      const logo = after.docs.find((d) => d.get("title") === "Logo");
      if (logo?.get("status") !== "done" || !logo.get("doneAt")) return "Logo should be done with doneAt set";
      const act = await db.collection("activity").where("projectId", "==", tasksId).get();
      if (!act.docs.some((d) => d.get("type") === "task.done" && d.get("visibility") === "client")) return "task.done activity missing";

      await admin.goto(`${base}/admin/projects/${tasksId}?tab=payments`, { waitUntil: "networkidle" });
      await admin.getByRole("button", { name: "Add payment" }).first().click();
      await admin.getByLabel(/^Amount/).fill("100");
      await admin.getByRole("button", { name: "Record payment" }).click();
      await admin.getByText("Partially paid").first().waitFor({ timeout: 15000 });
      await admin.waitForTimeout(1500); // totals count up
      const text = await admin.evaluate(() => document.body.innerText);
      // Owed 150.00 (Logo only, Brochure is not billed), paid 100.00, pending 50.00.
      for (const needle of ["150.00", "50.00", "Logo"]) if (!text.includes(needle)) return `missing ${needle}`;
      return !text.includes("Brochure") || "a task still to do must not be billed";
    });

    await check("UI: marking a task back to todo removes it from what is owed", async () => {
      await admin.goto(`${base}/admin/projects/${tasksId}?tab=tasks`, { waitUntil: "networkidle" });
      await admin.getByRole("checkbox", { name: 'Mark "Logo" as not done' }).click();
      await admin.getByRole("checkbox", { name: 'Mark "Logo" as done' }).waitFor({ timeout: 10000 });
      await admin.waitForTimeout(800);
      await admin.goto(`${base}/admin/projects/${tasksId}?tab=payments`, { waitUntil: "networkidle" });
      const text = await admin.evaluate(() => document.body.innerText);
      return text.includes("No tasks owed yet") || "expected nothing owed after reopening the only done task";
    });

    await check("UI: add a retainer prospect, convert it, and get a retainer with the right rate", async () => {
      await admin.goto(`${base}/admin/prospects`, { waitUntil: "networkidle" });
      await admin.getByRole("button", { name: "New prospect" }).first().click();
      const dialog = admin.getByRole("dialog");
      await dialog.getByRole("radio", { name: /^Retainer/ }).click();
      await dialog.getByLabel("Name").fill("Ronan Recurring");
      await dialog.getByLabel("Email").fill("ronan@recurring.test");
      await dialog.getByLabel("Estimated monthly value").fill("2000");
      await dialog.getByLabel("Rate per hour").fill("25");
      await dialog.getByLabel("Rate per hour").press("Enter");
      await admin.getByText("Prospect added").first().waitFor({ timeout: 15000 });
      const snap = await db.collection("prospects").where("email", "==", "ronan@recurring.test").get();
      if (snap.size !== 1) return `expected one prospect, found ${snap.size}`;
      const p = snap.docs[0];
      if (p.get("engagementKind") !== "retainer" || p.get("rate") !== 2500 || p.get("rateUnit") !== "hour" || p.get("estimatedValue") !== 200000) {
        return `prospect ${p.get("engagementKind")} ${p.get("rate")} ${p.get("rateUnit")} ${p.get("estimatedValue")}`;
      }
      await admin.goto(`${base}/admin/prospects/${p.id}`, { waitUntil: "networkidle" });
      await admin.getByText("/mo").first().waitFor({ timeout: 10000 });
      await admin.getByRole("button", { name: "Convert to client" }).first().click();
      await admin.getByRole("dialog").getByRole("button", { name: "Convert" }).click();
      await admin.waitForURL(/\/admin\/projects\/[^/?]+$/, { timeout: 20000 });
      const projectId = admin.url().split("/").pop();
      const project = await db.collection("projects").doc(projectId).get();
      if (project.get("kind") !== "retainer") return `converted project kind ${project.get("kind")}`;
      if (project.get("rate") !== 2500 || project.get("rateUnit") !== "hour" || project.get("currency") !== "USD") return `converted rate ${project.get("rate")} ${project.get("rateUnit")} ${project.get("currency")}`;
      if (project.get("status") !== "active" || !project.get("acceptedAt")) return `converted status ${project.get("status")}`;
      const again = await db.collection("prospects").doc(p.id).get();
      if (again.get("convertedProjectId") !== projectId || !again.get("convertedClientId")) return "back-links not set";
      const ag = await db.collection("projects").doc(projectId).collection("agreements").get();
      return ag.empty || "a retainer must not get an agreement";
    });

    await check("UI: the dashboard toggles between PHP total and original currencies", async () => {
      await admin.goto(`${base}/admin?view=php`, { waitUntil: "networkidle" });
      let text = await admin.evaluate(() => document.body.innerText);
      if (!text.includes("Converted at market rates") || !text.includes("Recurring billed this month") || !text.includes("₱")) return "PHP view missing";
      if (!text.includes("Past payments use today's rate")) return "limitation not stated";
      await admin.getByRole("button", { name: "Show the exchange rates used" }).click();
      await admin.getByText("1 USD = 56.00 PHP").waitFor({ timeout: 5000 });
      await admin.keyboard.press("Escape");
      await admin.getByRole("radio", { name: "Original currencies" }).click();
      await admin.waitForURL(/view=original/, { timeout: 10000 });
      await admin.waitForFunction(() => !document.body.innerText.includes("Converted at"), null, { timeout: 10000 });
      text = await admin.evaluate(() => document.body.innerText);
      if (!text.includes("$1,250.00")) return "original view should show per currency figures";
      // The choice is remembered in a cookie: a plain visit now opens the original view.
      await admin.goto(`${base}/admin`, { waitUntil: "networkidle" });
      text = await admin.evaluate(() => document.body.innerText);
      if (text.includes("Converted at")) return "the choice was not remembered by the server (cookie dash-view)";
      await admin.getByRole("radio", { name: "PHP total" }).click();
      await admin.waitForFunction(() => document.body.innerText.includes("Converted at"), null, { timeout: 10000 });
      return true;
    });

    // ------------------------------------------------ pass: rates, pipeline, stage, payment only
    {
      const dctx = await context(cookies.admin, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
      const desk = await dctx.newPage();
      watch(desk, "admin desktop flows");
      const text = (page) => page.evaluate(() => document.body.innerText);
      const num = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
      const RATE = { GBP: 70, USD: 56, PHP: 1 };
      const peso = (centavos) => `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      /** The open pipeline worked out straight from Firestore, so the checks do not depend on what earlier flows changed. */
      const pipelineNow = async (usdRate = RATE.USD) => {
        const snap = await db.collection("prospects").get();
        const one = {};
        const mon = {};
        for (const d of snap.docs) {
          const p = d.data();
          if (p.archivedAt || p.stage === "won" || p.stage === "lost") continue;
          const bucket = (p.engagementKind ?? "fixed") === "retainer" ? mon : one;
          bucket[p.currency] = (bucket[p.currency] ?? 0) + (p.estimatedValue ?? 0);
        }
        const php = (b) => Object.entries(b).reduce((s, [c, v]) => s + Math.round(v * (c === "USD" ? usdRate : RATE[c])), 0);
        return { one, mon, oneOff: php(one), monthly: php(mon), firstYear: php(one) + php(mon) * 12 };
      };
      /** The PHP figure printed in a dashboard card, found by the card's heading. */
      const cardFigure = async (page, heading) => {
        const t = await page.locator("h3", { hasText: heading }).first().locator("xpath=../..").innerText();
        const m = /₱\s?([0-9,]+\.[0-9]{2})/.exec(t);
        return m ? num(m[1]) : null;
      };

      await check("UI: set my own USD rate in Settings, see the dashboard use it, then reset to live", async () => {
        await desk.goto(`${base}/admin?view=php`, { waitUntil: "networkidle" });
        const before = await text(desk);
        if (!before.includes("Converted at market rates")) return "expected live (stub) rates before any override";
        const monthlyBefore = await desk.getByTestId("pipeline-monthly").innerText();
        const expectBefore = await pipelineNow();
        if (!monthlyBefore.includes(peso(expectBefore.monthly))) return `pipeline monthly before: ${monthlyBefore}, expected ${peso(expectBefore.monthly)}`;

        await desk.goto(`${base}/admin/settings`, { waitUntil: "networkidle" });
        if (!(await text(desk)).includes("Live now: 56.00")) return "the live rate hint is missing";
        await desk.getByRole("radiogroup", { name: "USD rate source" }).getByRole("radio", { name: "My rate" }).click();
        await desk.locator("#fx-USD").fill("60.5");
        await desk.getByRole("button", { name: "Save settings" }).click();
        await desk.getByText("Settings saved").first().waitFor({ timeout: 10000 });
        await desk.waitForTimeout(400);
        const stored = (await db.collection("settings").doc("app").get()).get("fxOverrides");
        if (stored?.USD !== 605000 || stored?.GBP !== undefined) return `stored overrides ${JSON.stringify(stored)}`;

        await desk.goto(`${base}/admin?view=php`, { waitUntil: "networkidle" });
        const after = await text(desk);
        if (!after.includes("Converted at your rates and market rates")) return "info line did not name your rates";
        const monthly = await desk.getByTestId("pipeline-monthly").innerText();
        const expectAfter = await pipelineNow(60.5);
        if (!monthly.includes(peso(expectAfter.monthly))) return `pipeline monthly after: ${monthly}, expected ${peso(expectAfter.monthly)}`;
        await desk.getByRole("button", { name: "Show the exchange rates used" }).click();
        await desk.getByText("1 USD = 60.50 PHP").waitFor({ timeout: 5000 });
        if (!(await desk.getByText("(your rate)").first().isVisible())) return "popover did not say your rate";
        if (!(await text(desk)).includes("(market")) return "popover did not label the GBP rate as market";
        await desk.keyboard.press("Escape");

        // Invalid values are refused with a message.
        await desk.goto(`${base}/admin/settings`, { waitUntil: "networkidle" });
        await desk.locator("#fx-USD").fill("56.12345");
        await desk.getByText("Enter a rate from 0.0001 to 1,000,000 with up to 4 decimals").waitFor({ timeout: 5000 });
        await desk.locator("#fx-USD").fill("0");
        await desk.getByText("Enter a rate from 0.0001").waitFor({ timeout: 5000 });

        // Back to live.
        await desk.goto(`${base}/admin/settings`, { waitUntil: "networkidle" });
        await desk.getByRole("button", { name: "Use live rate" }).first().click();
        await desk.getByRole("button", { name: "Save settings" }).click();
        await desk.getByText("Settings saved").first().waitFor({ timeout: 10000 });
        await desk.waitForTimeout(400);
        const doc = await db.collection("settings").doc("app").get();
        if (doc.get("fxOverrides")?.USD !== undefined) return `override still stored ${JSON.stringify(doc.get("fxOverrides"))}`;
        await desk.goto(`${base}/admin?view=php`, { waitUntil: "networkidle" });
        const monthlyLive = await desk.getByTestId("pipeline-monthly").innerText();
        return monthlyLive.includes(peso(expectBefore.monthly)) || `pipeline monthly after reset: ${monthlyLive}`;
      });

      await check("UI: the pipeline card shows one-off, monthly (/mo) and first year in PHP and original views", async () => {
        await desk.goto(`${base}/admin?view=php`, { waitUntil: "networkidle" });
        const card = (await desk.getByTestId("pipeline-card").innerText()).replace(/TOP OPEN PROSPECTS/i, "Top open prospects");
        const want = await pipelineNow();
        for (const needle of [peso(want.oneOff), peso(want.monthly), peso(want.firstYear), "/mo", "Not weighted by win chance", "Top open prospects", "Wanda Waiting"]) {
          if (!card.includes(needle)) return `PHP view missing ${needle}`;
        }
        if (want.firstYear !== want.oneOff + want.monthly * 12) return "first year is not one-off + monthly x 12";
        await desk.goto(`${base}/admin?view=original`, { waitUntil: "networkidle" });
        const orig = await desk.getByTestId("pipeline-card").innerText();
        const usd = (m) => `$${(m / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
        const gbp = (m) => `£${(m / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
        const needles = ["/mo", want.one.USD ? usd(want.one.USD) : null, want.one.GBP ? gbp(want.one.GBP) : null, want.mon.USD ? usd(want.mon.USD) : null].filter(Boolean);
        for (const needle of needles) {
          if (!orig.includes(needle)) return `Original view missing ${needle}`;
        }
        const expected = await desk.getByTestId("expected-this-month").innerText();
        return expected.includes("Expected this month") || `expected this month: ${expected}`;
      });

      await check("UI: drag a prospect into and out of Waiting for client, it persists and stays open", async () => {
        await desk.goto(`${base}/admin/prospects?view=kanban`, { waitUntil: "networkidle" });
        const waiting = desk.getByRole("region", { name: "Waiting for client" });
        if (!(await waiting.innerText()).includes("Wanda Waiting")) return "seeded waiting prospect missing from its column";
        const drag = async (name, target, expectStage) => {
          const card = desk.locator('[role="group"]').filter({ hasText: name }).first();
          const col = desk.getByRole("region", { name: target });
          // The board scrolls sideways: bring the target column fully into view, then measure.
          await col.scrollIntoViewIfNeeded();
          await card.scrollIntoViewIfNeeded();
          await col.scrollIntoViewIfNeeded();
          const a = await card.boundingBox();
          const b = await col.boundingBox();
          if (b.x + b.width / 2 > 1270 || a.x < 0) throw new Error(`card or column not both visible (card x ${a.x}, column ${b.x}+${b.width})`);
          // Grab the card by its lower part, away from the name link.
          await desk.mouse.move(a.x + a.width / 2, a.y + a.height - 8);
          await desk.mouse.down();
          await desk.mouse.move(a.x + a.width / 2 + 24, a.y + a.height + 12, { steps: 5 });
          await desk.mouse.move(b.x + b.width / 2, b.y + 140, { steps: 20 });
          await desk.mouse.up();
          // The board moves cards optimistically and shows no toast: wait for the stored stage instead.
          for (let i = 0; i < 40; i++) {
            if ((await db.collection("prospects").doc("pr-prop").get()).get("stage") === expectStage) break;
            await desk.waitForTimeout(250);
          }
        };
        const open = async () => (await desk.evaluate(() => document.body.innerText)).length;
        void open;
        await drag("Pia Proposal", "Waiting for client", "waiting_for_client");
        if ((await db.collection("prospects").doc("pr-prop").get()).get("stage") !== "waiting_for_client") return "stage did not persist as waiting_for_client";
        if ((await db.collection("prospects").doc("pr-prop").get()).get("closedAt")) return "an open stage must not set closedAt";
        await desk.goto(`${base}/admin?view=original`, { waitUntil: "networkidle" });
        const t = await text(desk);
        if (!/top open prospects/i.test(t) || !/Pia Proposal/.test(t)) return "the waiting prospect should count in the pipeline and top list";
        await desk.goto(`${base}/admin/prospects?view=kanban`, { waitUntil: "networkidle" });
        await drag("Pia Proposal", "Proposal sent", "proposal_sent");
        const stage = (await db.collection("prospects").doc("pr-prop").get()).get("stage");
        return stage === "proposal_sent" || `stage after dragging out: ${stage}`;
      });

      await check("UI: record a payment only entry, see it on Payments and the dashboard, edit it, delete it", async () => {
        const projectBefore = await (async () => {
          await desk.goto(`${base}/admin/projects/${ids.projA1}?tab=payments`, { waitUntil: "networkidle" });
          return text(desk);
        })();
        await desk.goto(`${base}/admin?view=php`, { waitUntil: "networkidle" });
        const earnedBefore = await cardFigure(desk, "Earned this month");
        const pendingBefore = await cardFigure(desk, "Pending balance");

        await desk.getByRole("button", { name: "Record payment" }).first().click();
        const dialog = desk.getByRole("dialog");
        await dialog.getByRole("radio", { name: "Attach to a project" }).click();
        await dialog.getByLabel("Project").waitFor({ timeout: 5000 });
        await dialog.getByRole("radio", { name: "Payment only" }).click();
        await dialog.getByLabel("Payer name").fill("Walk-in Maria");
        await dialog.getByLabel("Amount").fill("123.45");
        await dialog.getByLabel("Note (optional)").fill("STANDALONE-NOTE");
        await dialog.getByRole("button", { name: "Record payment" }).click();
        await desk.getByText("Payment recorded (no project)").first().waitFor({ timeout: 10000 });
        await desk.waitForTimeout(500);
        const snap = await db.collection("standalonePayments").get();
        if (snap.size !== 1 || snap.docs[0].get("amount") !== 12345 || snap.docs[0].get("currency") !== "PHP") return `stored ${JSON.stringify(snap.docs.map((d) => d.data()))}`;
        const sid = snap.docs[0].id;
        const activity = await db.collection("activity").where("type", "==", "standalone_payment.recorded").get();
        if (activity.size !== 1 || activity.docs[0].get("visibility") !== "internal") return "internal activity entry missing";

        await desk.goto(`${base}/admin/payments`, { waitUntil: "networkidle" });
        const list = await text(desk);
        for (const needle of ["Walk-in Maria", "Payment only", "₱123.45", "STANDALONE-NOTE", "Project: Acme Website Rebuild"]) {
          if (!list.includes(needle)) return `Payments page missing ${needle}`;
        }
        await desk.goto(`${base}/admin?view=php`, { waitUntil: "networkidle" });
        const earnedAfter = await cardFigure(desk, "Earned this month");
        if (Math.round((earnedAfter - earnedBefore) * 100) !== 12345) return `earned this month moved by ${earnedAfter - earnedBefore}, expected 123.45`;
        if ((await cardFigure(desk, "Pending balance")) !== pendingBefore) return "pending balance changed";

        // Filters.
        await desk.goto(`${base}/admin/payments?source=standalone`, { waitUntil: "networkidle" });
        const only = await text(desk);
        if (!only.includes("Walk-in Maria") || only.includes("Project: Acme Website Rebuild")) return "the Payment only filter did not narrow the list";
        await desk.goto(`${base}/admin/payments?source=project`, { waitUntil: "networkidle" });
        if ((await text(desk)).includes("Walk-in Maria")) return "the Project payments filter still shows a payment only entry";

        // Edit: attach it to a client.
        await desk.goto(`${base}/admin/payments?source=standalone`, { waitUntil: "networkidle" });
        await desk.getByRole("button", { name: "Edit" }).first().click();
        const edit = desk.getByRole("dialog");
        await edit.getByText("Edit payment").first().waitFor({ timeout: 5000 });
        await edit.getByLabel("Who paid").selectOption(ids.clientA);
        await edit.getByLabel("Amount").fill("200");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await desk.getByText("Payment updated").first().waitFor({ timeout: 10000 });
        await desk.waitForTimeout(500);
        const edited = await db.collection("standalonePayments").doc(sid).get();
        if (edited.get("amount") !== 20000 || edited.get("clientId") !== ids.clientA) return `edited doc ${JSON.stringify(edited.data())}`;

        await desk.goto(`${base}/admin/clients/${ids.clientA}`, { waitUntil: "networkidle" });
        if (!(await text(desk)).includes("Payments with no project")) return "the client page should list the payment only entry";

        // The client never sees it.
        const cctx = await context(cookies.a, { viewport: { width: 1280, height: 900 } });
        const cp = await cctx.newPage();
        for (const p of ["/portal", `/portal/projects/${ids.projA1}`, `/portal/projects/${ids.projR1}`]) {
          await cp.goto(`${base}${p}`, { waitUntil: "networkidle" });
          const t = await cp.evaluate(() => document.body.innerText);
          if (t.includes("STANDALONE-NOTE") || t.includes("Payments with no project") || t.includes("₱200.00")) {
            await cctx.close();
            return `portal ${p} leaked a payment only entry`;
          }
        }
        await cctx.close();

        // Delete.
        await desk.goto(`${base}/admin/payments?source=standalone`, { waitUntil: "networkidle" });
        await desk.getByRole("button", { name: "Delete" }).first().click();
        await desk.getByRole("dialog").getByRole("button", { name: "Delete payment" }).click();
        await desk.getByText("Payment deleted").first().waitFor({ timeout: 10000 });
        await desk.waitForTimeout(500);
        if (!(await db.collection("standalonePayments").get()).empty) return "payment only entry was not deleted";
        await desk.goto(`${base}/admin?view=php`, { waitUntil: "networkidle" });
        if ((await cardFigure(desk, "Earned this month")) !== earnedBefore) return "earned this month did not return after deleting";

        // Project finance never moved.
        await desk.goto(`${base}/admin/projects/${ids.projA1}?tab=payments`, { waitUntil: "networkidle" });
        return (await text(desk)) === projectBefore || "the project payments tab changed";
      });

      await dctx.close();
    }

    await adminCtx.close();

    if (process.env.E2E_SHOTS) await runMatrix({ browser, base, cookies, ids, shots: SHOTS, host });

    await check("no browser console errors or page errors", () => consoleProblems.length === 0 || [...new Set(consoleProblems)].slice(0, 6).join(" || "));
  } finally {
    await browser.close();
  }
  return [];
}
