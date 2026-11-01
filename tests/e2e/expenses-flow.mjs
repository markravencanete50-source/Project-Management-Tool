// Browser flows for expenses, available money, recurring expenses and the opening balance.
// Called from browser.mjs with the desktop admin page. Every figure is read from the page and
// compared with a delta, so the checks do not depend on what earlier flows left behind.
import { addDays, manilaToday } from "./seed.mjs";

/** A signed centavo amount from the first money figure in a piece of text ("-₱1,234.56" is -123456). */
function centavos(text) {
  const m = /(-)?₱\s?(-)?([0-9,]+\.[0-9]{2})/.exec(text);
  if (!m) return null;
  const n = Math.round(Number(m[3].replace(/,/g, "")) * 100);
  return m[1] || m[2] ? -n : n;
}

/** First day-of-month-safe date two months back, and the date one month after it. */
function recurringDates(today) {
  const [y, m, d] = today.split("-").map(Number);
  const day = String(Math.min(d, 28)).padStart(2, "0");
  const at = (back) => {
    const total = y * 12 + (m - 1) - back;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-${day}`;
  };
  return { start: at(2), second: at(1), third: at(0) };
}

export async function expensesFlow({ base, cookies, ids, check, context, desk, db, text }) {
  const today = manilaToday();
  const dates = recurringDates(today);
  const shown = async (page, testId) => centavos(await page.getByTestId(testId).first().innerText());
  const goDash = async () => {
    await desk.goto(`${base}/admin?view=php`, { waitUntil: "networkidle" });
    await desk.waitForTimeout(300);
  };
  const cardFigure = async (heading) => {
    const t = await desk.locator("h3", { hasText: heading }).first().locator("xpath=../..").innerText();
    return centavos(t);
  };
  const expenseDocs = async () => (await db.collection("expenses").get()).docs;
  /** Visible expense rows whose text contains `needle` (the table on desktop, the cards on mobile are hidden). */
  const rowsWith = (needle) => desk.locator('[data-testid="expense-rows"] tr', { hasText: needle });

  let baseline;
  let earnedBefore;
  let pendingBefore;
  let figmaId;
  let rentId;

  await check("UI: add an expense, it comes off available money and spending, and earnings do not move", async () => {
    await goDash();
    baseline = await shown(desk, "available-now");
    earnedBefore = await cardFigure("Earned this month");
    pendingBefore = await cardFigure("Pending balance");
    const netBefore = await shown(desk, "net-month");
    const spentBefore = centavos(await desk.getByTestId("flow-spent").first().innerText());
    if (baseline === null) return "no Available now figure on the dashboard";

    await desk.getByRole("button", { name: "Add expense" }).first().click();
    const dialog = desk.getByRole("dialog");
    await dialog.getByLabel("What did you buy").waitFor({ timeout: 5000 });
    // Fast path only: description, amount, currency (PHP by default), today, category.
    if ((await dialog.getByLabel("Currency").inputValue()) !== "PHP") return "currency should default to PHP";
    if ((await dialog.getByLabel("Date spent").inputValue()) !== today) return "date should default to today";
    await dialog.getByLabel("What did you buy").fill("E2E Figma plan");
    await dialog.getByLabel("Amount").fill("250.50");
    await dialog.getByLabel("Category").selectOption("software");
    await dialog.getByRole("button", { name: "Add expense" }).click();
    await desk.getByText("Expense added").first().waitFor({ timeout: 10000 });
    await desk.waitForTimeout(500);

    const docs = await expenseDocs();
    if (docs.length !== 1) return `expected 1 expense doc, found ${docs.length}`;
    figmaId = docs[0].id;
    const d = docs[0].data();
    if (d.amount !== 25050 || d.currency !== "PHP" || d.category !== "software" || d.spentOn !== today || d.recurring !== "none" || d.clientId !== null) {
      return `stored ${JSON.stringify(d)}`;
    }
    const activity = await db.collection("activity").where("type", "==", "expense.recorded").get();
    if (activity.size !== 1 || activity.docs[0].get("visibility") !== "internal") return "internal activity entry missing";

    await goDash();
    const after = await shown(desk, "available-now");
    if (after !== baseline - 25050) return `available money moved by ${after - baseline}, expected -25050`;
    if ((await shown(desk, "net-month")) !== netBefore - 25050) return "net this month did not drop by the expense";
    const spentAfter = centavos(await desk.getByTestId("flow-spent").first().innerText());
    if (spentAfter - spentBefore !== 25050) return `income vs expenses spent total moved by ${spentAfter - spentBefore}`;
    if ((await cardFigure("Earned this month")) !== earnedBefore) return "earned this month changed";
    if ((await cardFigure("Pending balance")) !== pendingBefore) return "pending balance changed";
    const t = await text(desk);
    for (const needle of ["Available money", "Available now", "Net this month", "Net this year", "Profit margin this month", "Income vs expenses", "Spending by category", "not a bank balance"]) {
      if (!t.includes(needle)) return `dashboard missing ${needle}`;
    }
    return true;
  });

  await check("UI: the Expenses page lists it, filters live in the URL, and search works", async () => {
    await desk.goto(`${base}/admin/expenses`, { waitUntil: "networkidle" });
    let t = await text(desk);
    for (const needle of ["Expenses", "E2E Figma plan", "₱250.50", "Software", "By category"]) {
      if (!t.includes(needle)) return `page missing ${needle}`;
    }
    await desk.goto(`${base}/admin/expenses?category=software&currency=PHP`, { waitUntil: "networkidle" });
    if (!(await text(desk)).includes("E2E Figma plan")) return "category and currency filters hid a matching expense";
    await desk.goto(`${base}/admin/expenses?category=food`, { waitUntil: "networkidle" });
    t = await text(desk);
    if (t.includes("E2E Figma plan") || !t.includes("No expenses match")) return "the food filter should show nothing";
    await desk.goto(`${base}/admin/expenses`, { waitUntil: "networkidle" });
    await desk.getByRole("searchbox", { name: "Search expenses" }).fill("figma");
    await desk.waitForURL(/[?&]q=figma/, { timeout: 5000 });
    if (!(await text(desk)).includes("E2E Figma plan")) return "search hid a matching expense";
    await desk.getByRole("searchbox", { name: "Search expenses" }).fill("zzz-nothing");
    await desk.waitForURL(/[?&]q=zzz-nothing/, { timeout: 5000 });
    await desk.getByText("No expenses match").first().waitFor({ timeout: 5000 });
    await desk.getByRole("button", { name: "Clear filters" }).click();
    await desk.waitForURL((u) => !u.search, { timeout: 5000 });
    return (await text(desk)).includes("E2E Figma plan") || "clearing the filters did not bring it back";
  });

  await check("UI: a monthly recurring expense started two months ago shows three occurrences and counts three times", async () => {
    await goDash();
    const before = await shown(desk, "available-now");
    await desk.getByRole("button", { name: "Add expense" }).first().click();
    const dialog = desk.getByRole("dialog");
    await dialog.getByLabel("What did you buy").fill("E2E Coworking rent");
    await dialog.getByLabel("Amount").fill("5000");
    await dialog.getByLabel("Date spent").fill(dates.start);
    await dialog.getByLabel("Category").selectOption("office");
    await dialog.getByRole("button", { name: /More details/ }).click();
    await dialog.getByLabel("Repeat").selectOption("monthly");
    const help = await dialog.getByTestId("repeat-help").innerText();
    if (!/worked out automatically/.test(help) || !/Only this one expense is saved/.test(help)) return `repeat helper text missing: ${help}`;
    await dialog.getByLabel("Vendor (optional)").fill("Hub Manila");
    await dialog.getByRole("button", { name: "Add expense" }).click();
    await desk.getByText("Expense added").first().waitFor({ timeout: 10000 });
    await desk.waitForTimeout(500);

    const docs = await expenseDocs();
    if (docs.length !== 2) return `expected 2 stored expense docs (repeats are never stored), found ${docs.length}`;
    const rent = docs.find((x) => x.get("description") === "E2E Coworking rent");
    rentId = rent.id;
    if (rent.get("recurring") !== "monthly" || rent.get("recurringUntil") !== null || rent.get("spentOn") !== dates.start) return `stored ${JSON.stringify(rent.data())}`;

    await desk.goto(`${base}/admin/expenses?q=Coworking`, { waitUntil: "networkidle" });
    const count = await rowsWith("E2E Coworking rent").count();
    if (count !== 3) return `expected 3 occurrences, saw ${count}`;
    const dateCells = await rowsWith("E2E Coworking rent").locator("td:first-child").allInnerTexts();
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const fmt = (iso) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
    for (const iso of [dates.start, dates.second, dates.third]) {
      if (!dateCells.some((c) => c.trim() === fmt(iso))) return `occurrence on ${iso} missing; saw ${dateCells.join(" | ")}`;
    }
    if ((await rowsWith("Repeats monthly").count()) !== 3) return "each occurrence should say Repeats monthly";
    if ((await rowsWith(/Recurring/).count()) !== 2) return "two derived occurrences should be marked Recurring";
    if (!(await text(desk)).includes("2 repeats included")) return "totals should say the repeats are included";

    await goDash();
    const after = await shown(desk, "available-now");
    if (after !== before - 3 * 500000) return `available money moved by ${after - before}, expected ${-3 * 500000}`;
    return true;
  });

  await check("UI: stop a recurring expense with a stop date, edit the other one, link it to a client", async () => {
    // Edit the repeating template from one of its derived rows: stop after the second month.
    await desk.goto(`${base}/admin/expenses?q=Coworking`, { waitUntil: "networkidle" });
    await desk.getByRole("button", { name: "Edit repeat" }).first().click();
    let dialog = desk.getByRole("dialog");
    await dialog.getByText("Changes apply to every repeat").waitFor({ timeout: 5000 });
    if ((await dialog.getByLabel("What did you buy").inputValue()) !== "E2E Coworking rent") return "the edit dialog did not load the template";
    if ((await dialog.getByLabel("First date").inputValue()) !== dates.start) return "the edit dialog should show the first date of the template";
    await dialog.getByLabel("Stop repeating after (optional)").fill(dates.second);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await desk.getByText("Expense updated").first().waitFor({ timeout: 10000 });
    await desk.waitForTimeout(500);
    if ((await db.collection("expenses").doc(rentId).get()).get("recurringUntil") !== dates.second) return "stop date was not stored";
    await desk.goto(`${base}/admin/expenses?q=Coworking`, { waitUntil: "networkidle" });
    if ((await rowsWith("E2E Coworking rent").count()) !== 2) return "the stop date should leave two occurrences";

    // A bad stop date is refused in the form.
    await desk.getByRole("button", { name: "Edit repeat" }).first().click();
    dialog = desk.getByRole("dialog");
    await dialog.getByLabel("Stop repeating after (optional)").fill(addDays(dates.start, -1));
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await dialog.getByText("Stop date must be on or after the first date").waitFor({ timeout: 5000 });
    await desk.keyboard.press("Escape");

    // Edit the one-off: new amount and a client link.
    await desk.goto(`${base}/admin/expenses?q=Figma`, { waitUntil: "networkidle" });
    await desk.getByRole("button", { name: "Edit" }).first().click();
    dialog = desk.getByRole("dialog");
    await dialog.getByLabel("Amount").fill("300");
    await dialog.getByRole("button", { name: /More details/ }).click();
    await dialog.getByLabel("For client (optional)").selectOption(ids.clientA);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await desk.getByText("Expense updated").first().waitFor({ timeout: 10000 });
    await desk.waitForTimeout(500);
    const doc = await db.collection("expenses").doc(figmaId).get();
    if (doc.get("amount") !== 30000 || doc.get("clientId") !== ids.clientA) return `edited doc ${JSON.stringify(doc.data())}`;
    if ((await db.collection("activity").where("type", "==", "expense.updated").get()).size < 2) return "update activity entries missing";

    await desk.goto(`${base}/admin/clients/${ids.clientA}`, { waitUntil: "networkidle" });
    const t = await text(desk);
    if (!t.includes("Expenses for this client") || !t.includes("E2E Figma plan") || !t.includes("₱300.00")) return "the client page should list the linked expense with its total";
    return true;
  });

  await check("UI: a project from another client is refused, a project with no client picks up its client", async () => {
    await desk.goto(`${base}/admin/expenses?q=Figma`, { waitUntil: "networkidle" });
    await desk.getByRole("button", { name: "Edit" }).first().click();
    const dialog = desk.getByRole("dialog");
    await dialog.getByLabel("For client (optional)").selectOption("");
    await dialog.getByLabel("For project (optional)").selectOption(ids.projB1);
    // Choosing the project fills in its client.
    if ((await dialog.getByLabel("For client (optional)").inputValue()) !== ids.clientB) return "choosing a project should select its client";
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await desk.getByText("Expense updated").first().waitFor({ timeout: 10000 });
    await desk.waitForTimeout(500);
    const doc = await db.collection("expenses").doc(figmaId).get();
    if (doc.get("projectId") !== ids.projB1 || doc.get("clientId") !== ids.clientB) return `stored ${JSON.stringify(doc.data())}`;
    return true;
  });

  await check("UI: opening balance in Settings, including negative and a cut-off date", async () => {
    await goDash();
    const before = await shown(desk, "available-now");
    await desk.goto(`${base}/admin/settings`, { waitUntil: "networkidle" });
    const t = await text(desk);
    for (const needle of ["Money", "Opening balance date", "not a bank balance"]) if (!t.includes(needle)) return `settings missing ${needle}`;
    const save = async () => {
      await desk.getByRole("button", { name: "Save settings" }).click();
      await desk.getByText("Settings saved").first().waitFor({ timeout: 10000 });
      await desk.waitForTimeout(400);
    };

    await desk.locator("#opening-PHP").fill("1000");
    await save();
    const stored = (await db.collection("settings").doc("app").get()).data();
    if (stored?.openingBalances?.PHP !== 100000) return `stored ${JSON.stringify(stored?.openingBalances)}`;
    await goDash();
    if ((await shown(desk, "available-now")) !== before + 100000) return "an opening balance of 1000.00 should add exactly 1000.00";

    // Garbage is refused with a message.
    await desk.goto(`${base}/admin/settings`, { waitUntil: "networkidle" });
    await desk.locator("#opening-GBP").fill("12.345");
    await desk.getByText("Enter an amount like 1500.50 or -200").waitFor({ timeout: 5000 });
    await desk.locator("#opening-GBP").fill("");

    // Negative: a large debt makes available money negative, shown with a minus sign and the warning colour.
    await desk.locator("#opening-PHP").fill("-9999999.99");
    await save();
    await goDash();
    const negative = await desk.getByTestId("available-now").first().innerText();
    if (!negative.includes("-₱")) return `negative figure should carry a minus sign: ${negative}`;
    if ((await desk.getByTestId("available-now").locator(".text-warning").count()) === 0) return "negative available money should use the warning colour";
    if (!(await text(desk)).includes("More has gone out than come in")) return "negative available money should say so";
    const mctx = await context(cookies.admin);
    const mpage = await mctx.newPage();
    await mpage.goto(`${base}/admin?view=php`, { waitUntil: "networkidle" });
    const overflow = await mpage.evaluate(() => {
      const wide = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > 376) wide.push(el.tagName.toLowerCase() + "." + String(el.className).slice(0, 60) + " right=" + Math.round(r.right));
        if (wide.length >= 5) break;
      }
      return document.documentElement.scrollWidth > 375 ? document.documentElement.scrollWidth + " " + wide.join(" | ") : 0;
    });
    await mctx.close();
    if (overflow) return `a negative figure overflows the 375px page (${overflow})`;

    // With a date, money before it is not counted: only the opening balance remains.
    await desk.goto(`${base}/admin/settings`, { waitUntil: "networkidle" });
    await desk.locator("#opening-PHP").fill("1000");
    await desk.locator("#openingBalanceDate").fill(addDays(today, 1));
    await save();
    await goDash();
    if ((await shown(desk, "available-now")) !== 100000) return "with the date set to tomorrow, only the opening balance should count";
    if (!(await desk.getByTestId("available-money-card").innerText()).includes("Counted from")) return "the label should say money is counted from the opening date";
    // Earnings still show everything.
    if ((await cardFigure("Earned this month")) !== earnedBefore) return "the opening date must not change earnings";

    // Back to nothing.
    await desk.goto(`${base}/admin/settings`, { waitUntil: "networkidle" });
    await desk.locator("#opening-PHP").fill("");
    await desk.locator("#openingBalanceDate").fill("");
    await save();
    const cleared = (await db.collection("settings").doc("app").get()).data();
    if (cleared?.openingBalances?.PHP !== undefined || cleared?.openingBalanceDate !== undefined) return `still stored ${JSON.stringify([cleared?.openingBalances, cleared?.openingBalanceDate])}`;
    await goDash();
    return (await shown(desk, "available-now")) === before || "available money did not return after clearing the opening balance";
  });

  await check("UI: Original currencies view shows an available money block per currency", async () => {
    await desk.goto(`${base}/admin?view=original`, { waitUntil: "networkidle" });
    const card = await desk.getByTestId("available-money-card").innerText();
    for (const needle of ["Available now", "Net this month", "Net this year", "Received", "Spent"]) if (!card.includes(needle)) return `card missing ${needle}`;
    return (await desk.locator('[data-testid^="available-"][data-testid$="PHP"]').count()) >= 1 || "no PHP block";
  });

  await check("UI: the command palette adds an expense and goes to Expenses", async () => {
    await desk.goto(`${base}/admin`, { waitUntil: "networkidle" });
    await desk.keyboard.press("Control+k");
    const box = desk.getByRole("combobox", { name: "Search pages and actions" });
    await box.fill("add expense");
    await desk.getByRole("option", { name: /Add expense/ }).first().waitFor({ timeout: 5000 });
    await box.press("Enter");
    await desk.getByRole("dialog").getByLabel("What did you buy").waitFor({ timeout: 5000 });
    await desk.keyboard.press("Escape");
    await desk.waitForTimeout(300);
    await desk.keyboard.press("Control+k");
    await desk.getByRole("combobox", { name: "Search pages and actions" }).fill("go to expenses");
    await desk.getByRole("option", { name: /Expenses/ }).first().waitFor({ timeout: 5000 });
    await desk.getByRole("combobox", { name: "Search pages and actions" }).press("Enter");
    await desk.waitForURL(/\/admin\/expenses$/, { timeout: 10000 });
    return true;
  });

  await check("UI: the client portal never shows expenses", async () => {
    const cctx = await context(cookies.a, { viewport: { width: 1280, height: 900 } });
    const cp = await cctx.newPage();
    for (const p of ["/portal", `/portal/projects/${ids.projA1}`, `/portal/projects/${ids.projR1}`, `/portal/projects/${ids.projA1}?tab=activity`]) {
      await cp.goto(`${base}${p}`, { waitUntil: "networkidle" });
      const t = await cp.evaluate(() => document.body.innerText);
      if (/E2E Figma|E2E Coworking|Hub Manila|Expense/.test(t)) {
        await cctx.close();
        return `portal ${p} leaked an expense`;
      }
    }
    // Client B's project was linked to the expense; their portal must stay clean too.
    await cctx.close();
    const bctx = await context(cookies.b, { viewport: { width: 1280, height: 900 } });
    const bp = await bctx.newPage();
    for (const p of ["/portal", `/portal/projects/${ids.projB1}`]) {
      await bp.goto(`${base}${p}`, { waitUntil: "networkidle" });
      const t = await bp.evaluate(() => document.body.innerText);
      if (/E2E Figma|Expense/.test(t)) {
        await bctx.close();
        return `portal ${p} leaked an expense linked to this client's project`;
      }
    }
    await bctx.close();
    const res = await fetch(`${base}/admin/expenses`, { headers: { cookie: `__session=${cookies.a}` }, redirect: "manual" });
    return ([302, 303, 307, 308].includes(res.status) && (res.headers.get("location") ?? "").endsWith("/login")) || `a client opening /admin/expenses got status ${res.status}`;
  });

  await check("UI: export expenses CSV flags the derived repeats; JSON and the admin-only rule hold", async () => {
    const admin = { headers: { cookie: `__session=${cookies.admin}` } };
    const res = await fetch(`${base}/api/export?format=expenses`, admin);
    const csv = await res.text();
    if (res.status !== 200 || !(res.headers.get("content-type") ?? "").includes("text/csv")) return `status ${res.status}`;
    const rows = csv.replace(/^﻿/, "").trim().split("\r\n");
    if (!rows[0].startsWith("expense_id,date,description,category,vendor,amount")) return `header ${rows[0]}`;
    const rent = rows.filter((r) => r.includes("E2E Coworking rent"));
    if (rent.length !== 2) return `expected the template and one repeat after the stop date, got ${rent.length}`;
    if (rent.filter((r) => r.includes(",recurring_repeat,yes,")).length !== 1 || rent.filter((r) => r.includes(",recurring_template,no,")).length !== 1) return "derived rows are not flagged";
    if (!csv.includes("5000.00,500000,PHP") || !csv.includes("Hub Manila")) return "amounts or vendor missing";
    const json = await (await fetch(`${base}/api/export?format=json`, admin)).json();
    if (!Array.isArray(json.expenses) || json.expenses.length !== 2) return `json expenses: ${JSON.stringify(json.expenses?.length)}`;
    if (json.expenses.some((e) => e.recurring === "monthly" && e.recurringUntil !== dates.second)) return "the template is missing its stop date";
    const denied = await fetch(`${base}/api/export?format=expenses`, { headers: { cookie: `__session=${cookies.a}` } });
    return [401, 403].includes(denied.status) || `a client got status ${denied.status}`;
  });

  await check("UI: delete both expenses, available money returns to where it started", async () => {
    await desk.goto(`${base}/admin/expenses?q=Figma`, { waitUntil: "networkidle" });
    await desk.getByRole("button", { name: "Delete" }).first().click();
    await desk.getByRole("dialog").getByRole("button", { name: "Delete expense" }).click();
    await desk.getByText("Expense deleted").first().waitFor({ timeout: 10000 });
    await desk.waitForTimeout(500);
    await desk.goto(`${base}/admin/expenses?q=Coworking`, { waitUntil: "networkidle" });
    await desk.getByRole("button", { name: "Delete repeat" }).first().click();
    const dialog = desk.getByRole("dialog");
    if (!(await dialog.innerText()).includes("every repeat")) return "the dialog should warn that every repeat goes";
    await dialog.getByRole("button", { name: "Delete expense" }).click();
    await desk.getByText("Expense deleted").first().waitFor({ timeout: 10000 });
    await desk.waitForTimeout(500);
    if ((await expenseDocs()).length !== 0) return "expenses were not deleted";
    if ((await db.collection("activity").where("type", "==", "expense.deleted").get()).size !== 2) return "delete activity entries missing";
    await goDash();
    if ((await shown(desk, "available-now")) !== baseline) return "available money did not return to the start";
    if ((await cardFigure("Earned this month")) !== earnedBefore || (await cardFigure("Pending balance")) !== pendingBefore) return "earnings or pending changed over the flow";
    await desk.goto(`${base}/admin/expenses`, { waitUntil: "networkidle" });
    return (await text(desk)).includes("No expenses yet") || "the empty state is missing";
  });
  await check("UI: dashboard date range, presets, custom range, URL, bar size and the PHP / Original toggle", async () => {
    await goDash();
    const select = desk.getByTestId("range-select");
    const earned = async () => centavos(await desk.getByTestId("earned-in-range").first().innerText());
    const earnedText = async () => desk.getByTestId("earned-in-range").first().innerText();
    const flowText = async () => desk.getByTestId("flow-section").innerText();
    const grain = (name) => desk.getByRole("radiogroup", { name: "Group earnings by" }).getByRole("radio", { name });
    const waitUrl = async (re) => {
      await desk.waitForURL(re, { timeout: 10000 });
      await desk.waitForLoadState("networkidle");
      await desk.waitForTimeout(500);
    };

    // The default is the last 12 weeks, as the weekly view always was.
    if ((await select.inputValue()) !== "last-12-weeks") return "the default range should be Last 12 weeks";
    if (desk.url().includes("range=")) return "the default range needs no URL parameter";
    const twelveWeeks = await earned();
    if (twelveWeeks === null) return "no Earned in selected range figure";
    const pageText = await text(desk);
    if (!pageText.includes("vs previous 12 weeks")) return "the comparison should say vs previous 12 weeks";
    if ((await grain("Weekly").getAttribute("aria-checked")) !== "true") return "12 weeks should default to Weekly bars";

    // A preset: the URL and the figures follow, and 12 months covers 12 weeks.
    await select.selectOption("last-12-months");
    await waitUrl(/range=last-12-months/);
    const twelveMonths = await earned();
    if (twelveMonths === null || twelveMonths < twelveWeeks) return `12 months (${twelveMonths}) should cover at least what 12 weeks (${twelveWeeks}) did`;
    if (!(await text(desk)).includes("vs previous 12 months")) return "the comparison label did not follow the range";
    if ((await grain("Monthly").getAttribute("aria-checked")) !== "true") return "12 months should default to Monthly bars";
    if (!(await flowText()).includes("same range as Earnings")) return "Income vs expenses should say it follows the range";

    // Daily would need more than 92 bars: disabled, with the reason as a tooltip, and a click does nothing.
    const daily = grain("Daily");
    if ((await daily.getAttribute("aria-disabled")) !== "true") return "Daily should be disabled for 12 months";
    await daily.click({ force: true }); // aria-disabled: Playwright would otherwise wait for it to become enabled
    if ((await grain("Monthly").getAttribute("aria-checked")) !== "true") return "clicking a disabled bar size must not select it";
    await desk.mouse.move(5, 5); // a click closes the tooltip, so leave and come back
    await daily.hover();
    await desk.getByText(/would need \d+ bars/).first().waitFor({ timeout: 4000 });
    await desk.mouse.move(5, 5);
    await grain("Weekly").click();
    if ((await grain("Weekly").getAttribute("aria-checked")) !== "true") return "Weekly could not be chosen";

    // The currency toggle keeps the range.
    await desk.getByRole("radio", { name: "Original currencies" }).click();
    await waitUrl(/view=original/);
    if (!desk.url().includes("range=last-12-months")) return "switching to Original currencies dropped the range";
    await desk.getByRole("radio", { name: "PHP total" }).click();
    await waitUrl(/view=php/);
    if (!desk.url().includes("range=last-12-months")) return "switching to PHP total dropped the range";

    // Custom range: an end before the start is refused, then a quiet stretch of time shows nothing.
    await desk.getByTestId("range-custom").click();
    const popover = desk.getByTestId("range-popover");
    await popover.waitFor({ timeout: 5000 });
    await popover.locator("#range-from").fill(today);
    await popover.locator("#range-to").fill(addDays(today, -5));
    await desk.waitForTimeout(200);
    if (!(await popover.innerText()).includes("on or after the start date")) return "an end date before the start was not explained";
    if (!(await desk.getByTestId("range-apply").isDisabled())) return "Apply should be disabled for a backwards range";
    await popover.locator("#range-from").fill(addDays(today, -800));
    await popover.locator("#range-to").fill(addDays(today, -790));
    await desk.waitForTimeout(200);
    await desk.getByTestId("range-apply").click();
    await waitUrl(/from=.*to=/);
    const url = new URL(desk.url());
    if (url.searchParams.get("from") !== addDays(today, -800) || url.searchParams.get("to") !== addDays(today, -790)) return `custom range not in the URL (${desk.url()})`;
    if (url.searchParams.get("range")) return "a custom range should replace ?range=";
    if (url.searchParams.get("view") !== "php") return "the custom range dropped ?view=";
    if (!(await earnedText()).includes("Nothing received")) return "a quiet range should show Nothing received";
    if (!(await text(desk)).includes("No earnings in this range")) return "the empty state for the range is missing";
    if ((await select.inputValue()) !== "custom") return "the select should read Custom range";

    // A custom range that covers the last year brings the money back, and survives a reload.
    await desk.goto(`${base}/admin?view=php&from=${addDays(today, -400)}&to=${today}`, { waitUntil: "networkidle" });
    const wide = await earned();
    if (wide === null || wide < twelveMonths) return `a 400 day custom range (${wide}) should cover 12 months (${twelveMonths})`;
    await desk.reload({ waitUntil: "networkidle" });
    if ((await select.inputValue()) !== "custom" || (await earned()) !== wide) return "the custom range did not survive a reload";
    if (!(await text(desk)).includes("vs previous 401 days")) return "a custom range should compare with the previous 401 days";

    // Bad values fall back to the default instead of breaking the page.
    for (const query of ["range=nonsense", "from=2026-02-30&to=abc", `from=${addDays(today, 5)}&to=${addDays(today, 9)}`, "from=2026-09-01"]) {
      await desk.goto(`${base}/admin?view=php&${query}`, { waitUntil: "networkidle" });
      if ((await select.inputValue()) !== "last-12-weeks") return `?${query} should fall back to Last 12 weeks`;
      if ((await earned()) !== twelveWeeks) return `?${query} changed the figures`;
    }

    // Earned this month and this year keep their fixed meaning whatever the range.
    await desk.goto(`${base}/admin?view=php&range=last-year`, { waitUntil: "networkidle" });
    if ((await cardFigure("Earned this month")) !== earnedBefore) return "Earned this month changed with the range";
    return true;
  });
}
