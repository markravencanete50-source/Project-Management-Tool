// Optional screenshot matrix: every screen at 1280px and 390px, light and dark.
// Enabled with E2E_SHOTS=1 (everything) or E2E_SHOTS=<text> to capture only the screens whose
// name contains that text, e.g. E2E_SHOTS=prospect-new. Output goes to tests/e2e/screenshots/matrix.
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const SIZES = [
  { key: "1280", viewport: { width: 1280, height: 900 }, mobile: false },
  { key: "390", viewport: { width: 390, height: 844 }, mobile: true },
];
const THEMES = ["light", "dark"];

/** Open the New prospect dialog with a given kind picked. */
const newProspectDialog = (kind) => async (page) => {
  await page.getByRole("button", { name: "New prospect" }).first().click();
  await page.getByRole("dialog").getByRole("radio", { name: new RegExp(`^${kind}`) }).click();
  await page.waitForTimeout(500);
};

export async function runMatrix({ browser, base, cookies, ids, shots, host }) {
  const out = path.join(shots, "matrix");
  const only = process.env.E2E_SHOTS && process.env.E2E_SHOTS !== "1" ? process.env.E2E_SHOTS : null;
  if (!only) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // [name, path, optional action to run after load]
  const publicPages = [["login", "/login"]];
  const adminPages = [
    ["dashboard-php", "/admin?view=php"],
    ["dashboard-original", "/admin?view=original"],
    [
      "dashboard-fx-popover",
      "/admin?view=php",
      async (page) => {
        await page.getByRole("button", { name: "Show the exchange rates used" }).click();
        await page.waitForTimeout(500);
      },
    ],
    ["payments", "/admin/payments"],
    [
      "record-payment-only",
      "/admin/payments",
      async (page) => {
        await page.getByRole("button", { name: "Record payment" }).first().click();
        await page.getByRole("dialog").getByLabel("Payer name").waitFor({ timeout: 8000 });
        await page.waitForTimeout(500);
      },
    ],
    [
      "record-payment-project",
      "/admin/payments",
      async (page) => {
        await page.getByRole("button", { name: "Record payment" }).first().click();
        await page.getByRole("dialog").getByRole("radio", { name: "Attach to a project" }).click();
        await page.waitForTimeout(600);
      },
    ],
    [
      "range-control",
      "/admin?view=php&range=last-6-months",
      async (page) => {
        await page.getByRole("heading", { name: "Earnings" }).scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -24));
        await page.getByTestId("range-custom").click();
        await page.getByTestId("range-popover").waitFor({ timeout: 5000 });
        await page.waitForTimeout(500);
        return { viewport: true };
      },
    ],
    ["expenses", "/admin/expenses"],
    ["expenses-filtered", "/admin/expenses?category=office&month=all"],
    [
      "add-expense",
      "/admin/expenses",
      async (page) => {
        await page.getByRole("button", { name: "Add expense" }).first().click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("What did you buy").fill("Figma team plan");
        await dialog.getByLabel("Amount").fill("45.00");
        await page.waitForTimeout(500);
        return { element: dialog };
      },
    ],
    [
      "add-expense-more",
      "/admin/expenses",
      async (page) => {
        await page.getByRole("button", { name: "Add expense" }).first().click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("What did you buy").fill("Coworking desk");
        await dialog.getByLabel("Amount").fill("8500.00");
        await dialog.getByRole("button", { name: /More details/ }).click();
        await dialog.getByLabel("Repeat").selectOption("monthly");
        await dialog.getByLabel("Paid with").selectOption("gcash");
        await dialog.getByLabel("Vendor (optional)").fill("Hub Manila");
        await page.waitForTimeout(500);
        return { element: dialog };
      },
    ],
    [
      "settings-money",
      "/admin/settings",
      async (page) => {
        await page.waitForTimeout(300);
        return { element: page.locator('[data-slot="card"]').filter({ has: page.getByText("Opening balance date") }).first() };
      },
    ],
    ["prospects-table", "/admin/prospects"],
    ["prospects-board", "/admin/prospects?view=kanban"],
    ["prospect-detail", "/admin/prospects/pr-due"],
    ["prospect-detail-retainer", "/admin/prospects/pr-ret"],
    ["prospect-new-fixed", "/admin/prospects", newProspectDialog("Fixed")],
    ["prospect-new-retainer", "/admin/prospects", newProspectDialog("Retainer")],
    ["prospect-new-tasks", "/admin/prospects", newProspectDialog("Tasks")],
    ["clients", "/admin/clients"],
    ["client-detail", `/admin/clients/${ids.clientA}`],
    ["projects", "/admin/projects"],
    ["project-new-fixed", "/admin/projects/new"],
    ["project-new-retainer", "/admin/projects/new?kind=retainer"],
    ["project-new-tasks", "/admin/projects/new?kind=tasks"],
    ["project-overview", `/admin/projects/${ids.projA1}`],
    ["project-payments", `/admin/projects/${ids.projA1}?tab=payments`],
    ["project-agreement", `/admin/projects/${ids.projA1}?tab=agreement`],
    ["project-revisions", `/admin/projects/${ids.projA1}?tab=revisions`],
    ["project-activity", `/admin/projects/${ids.projA1}?tab=activity`],
    ["retainer-overview", `/admin/projects/${ids.projR1}`],
    ["retainer-time", `/admin/projects/${ids.projR1}?tab=time`],
    [
      "retainer-time-dialog",
      `/admin/projects/${ids.projR1}?tab=time`,
      async (page) => {
        await page.getByRole("button", { name: "Log time" }).first().click();
        await page.getByLabel("Hours").fill("7.5");
        await page.waitForTimeout(400);
      },
    ],
    ["retainer-payments", `/admin/projects/${ids.projR1}?tab=payments`],
    ["tasks-overview", `/admin/projects/${ids.projT1}`],
    ["tasks-tasks", `/admin/projects/${ids.projT1}?tab=tasks`],
    ["tasks-payments", `/admin/projects/${ids.projT1}?tab=payments`],
    ["settings", "/admin/settings"],
    // Screenshots for the default task price, flat retainers and working schedule (filter: E2E_SHOTS=wc-).
    ["wc-project-new-tasks", "/admin/projects/new?kind=tasks"],
    [
      "wc-project-new-retainer-schedule",
      "/admin/projects/new?kind=retainer",
      async (page) => {
        await page.getByLabel("Rate per hour").fill("25");
        await page.getByLabel("Hours per day").fill("6");
        await page.getByLabel("Days per month").fill("20");
        await page.waitForTimeout(400);
      },
    ],
    [
      "wc-project-new-retainer-month",
      "/admin/projects/new?kind=retainer",
      async (page) => {
        await page.locator("#project-unit").click();
        await page.getByRole("option", { name: "Per month" }).click();
        await page.getByLabel("Rate per month").fill("1200");
        await page.waitForTimeout(400);
      },
    ],
    [
      "wc-task-dialog-prefilled",
      `/admin/projects/${ids.projT1}?tab=tasks`,
      async (page) => {
        await page.getByRole("button", { name: "Add task" }).first().click();
        await page.waitForTimeout(500);
      },
    ],
    ["wc-tasks-tab", `/admin/projects/${ids.projT1}?tab=tasks`],
    [
      "wc-tasks-edit-default",
      `/admin/projects/${ids.projT1}?tab=tasks`,
      async (page) => {
        await page.getByRole("button", { name: "Change" }).first().click();
        await page.waitForTimeout(500);
      },
    ],
    ["wc-meter-time-tab", `/admin/projects/${ids.projR1}?tab=time`],
    ["wc-periods-tab", "/admin/projects/proj-a-flat-month?tab=periods"],
    ["wc-periods-overview", "/admin/projects/proj-a-flat-month"],
    ["wc-prospect-new-retainer", "/admin/prospects", newProspectDialog("Retainer")],
    ["wc-prospect-new-tasks", "/admin/prospects", newProspectDialog("Tasks")],
  ];
  const portalPages = [
    ["portal-home", "/portal"],
    ["portal-project", `/portal/projects/${ids.projA1}`],
    ["portal-agreement", `/portal/projects/${ids.projA1}/agreement`],
    ["portal-retainer", `/portal/projects/${ids.projR1}`],
  ];
  const portalBPages = [
    ["portal-tasks", `/portal/projects/${ids.projT1}`],
  ];

  const groups = [
    [null, publicPages],
    [cookies.admin, adminPages],
    [cookies.a, portalPages],
    [cookies.b, portalBPages],
  ];

  for (const size of SIZES) {
    for (const theme of THEMES) {
      // A targeted run (E2E_SHOTS=<text>) takes 1280 light, 1280 dark and 390 light only.
      if (only && size.mobile && theme === "dark") continue;
      for (const [cookie, allPages] of groups) {
        const pages = only ? allPages.filter(([name]) => only.split(",").some((o) => name.includes(o))) : allPages;
        if (pages.length === 0) continue;
        const ctx = await browser.newContext({
          viewport: size.viewport,
          deviceScaleFactor: 1,
          isMobile: size.mobile,
          hasTouch: size.mobile,
          colorScheme: theme,
          reducedMotion: "no-preference",
        });
        if (cookie) await ctx.addCookies([{ name: "__session", value: cookie, domain: host, path: "/", httpOnly: true, sameSite: "Lax" }]);
        const page = await ctx.newPage();
        for (const [name, p, action] of pages) {
          try {
            await page.goto(base + p, { waitUntil: "networkidle" });
            const target = action ? await action(page) : undefined;
            if (target?.viewport) {
              // An open popover: photograph what is on screen.
              await page.waitForTimeout(600);
              await page.screenshot({ path: path.join(out, `${name}-${size.key}-${theme}.png`) });
              continue;
            }
            if (target?.element) {
              // A dialog or a single card: photograph just that.
              await page.waitForTimeout(600);
              await target.element.screenshot({ path: path.join(out, `${name}-${size.key}-${theme}.png`) });
              continue;
            }
            // Content below the fold reveals on scroll: walk down the page and back so the capture shows it.
            await page.evaluate(async () => {
              const step = Math.max(300, Math.floor(window.innerHeight * 0.7));
              for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
                window.scrollTo(0, y);
                await new Promise((r) => setTimeout(r, 120));
              }
              window.scrollTo(0, 0);
            });
            await page.waitForTimeout(1400);
            await page.screenshot({ path: path.join(out, `${name}-${size.key}-${theme}.png`), fullPage: true });
          } catch (err) {
            console.log(`matrix: ${name} ${size.key} ${theme} failed: ${err instanceof Error ? err.message : err}`);
          }
        }
        await ctx.close();
      }
    }
  }
}
