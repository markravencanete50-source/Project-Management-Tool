// Optional screenshot matrix: every screen at 1280px and 390px, light and dark.
// Enabled with E2E_SHOTS=1. Output goes to tests/e2e/screenshots/matrix.
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const SIZES = [
  { key: "1280", viewport: { width: 1280, height: 900 }, mobile: false },
  { key: "390", viewport: { width: 390, height: 844 }, mobile: true },
];
const THEMES = ["light", "dark"];

export async function runMatrix({ browser, base, cookies, ids, shots, host }) {
  const out = path.join(shots, "matrix");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const publicPages = [["login", "/login"]];
  const adminPages = [
    ["dashboard", "/admin"],
    ["prospects-table", "/admin/prospects"],
    ["prospects-board", "/admin/prospects?view=kanban"],
    ["prospect-detail", "/admin/prospects/pr-due"],
    ["clients", "/admin/clients"],
    ["client-detail", `/admin/clients/${ids.clientA}`],
    ["projects", "/admin/projects"],
    ["project-new", "/admin/projects/new"],
    ["project-overview", `/admin/projects/${ids.projA1}`],
    ["project-payments", `/admin/projects/${ids.projA1}?tab=payments`],
    ["project-agreement", `/admin/projects/${ids.projA1}?tab=agreement`],
    ["project-revisions", `/admin/projects/${ids.projA1}?tab=revisions`],
    ["project-activity", `/admin/projects/${ids.projA1}?tab=activity`],
    ["settings", "/admin/settings"],
  ];
  const portalPages = [
    ["portal-home", "/portal"],
    ["portal-project", `/portal/projects/${ids.projA1}`],
    ["portal-agreement", `/portal/projects/${ids.projA1}/agreement`],
  ];

  const groups = [
    [null, publicPages],
    [cookies.admin, adminPages],
    [cookies.a, portalPages],
  ];

  for (const size of SIZES) {
    for (const theme of THEMES) {
      for (const [cookie, pages] of groups) {
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
        for (const [name, p] of pages) {
          try {
            await page.goto(base + p, { waitUntil: "networkidle" });
            await page.waitForTimeout(1100);
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
