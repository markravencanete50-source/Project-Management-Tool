# Build: Client Project Tracker v1

You are building a production web app for me, Mark (a solo full-stack developer). I run client projects and need one private dashboard to track prospects, projects, progress, agreements, revisions, payments received, and monthly earnings, plus a client portal. Ship a working v1 fast. Keep running cost near zero. Flag tradeoffs instead of over-engineering. Do not add features that are not in this spec without asking.

This app does NOT process payments. Clients pay me outside the app (bank, PayPal, Wise, GCash). I type in what was received, and the app calculates paid, pending, and overdue amounts for visibility only.

## Decisions (fixed for v1)
- Firestore region: asia-southeast1 (Singapore). Vercel function region: sin1.
- Business time zone: Asia/Manila. All month buckets and "today" use this zone.
- A project counts as "accepted" when its agreement is signed. Switchable in settings (signed | deposit_paid). Changing the setting applies going forward only; it never rewrites past acceptedAt values.
- Clients can see their payment schedule, payments received, and pending balance in the portal.
- Single admin (me). Design roles so a "staff" role can be added later.
- Currencies: GBP, USD, PHP. Stored amounts are never converted. Totals are shown per currency, except the dashboard's default PHP view (see Dashboard currency view), which is a display conversion.
- Engagement kinds (added after v1): every project and every prospect has a kind. "fixed" (the original fixed-price project, and the default for every document with no kind), "retainer" (ongoing work billed by logged hours or days, monthly in arrears) and "tasks" (a list of priced tasks, each billed when done). Existing documents are fixed and behave exactly as before.
- All data is read and written on the server with firebase-admin. The browser uses the Firebase SDK only for signing in. No Firestore reads or writes from the browser.
- Totals, balances, progress, overdue items, and monthly stats are computed on read from source documents. Nothing derived is stored, so nothing can drift. Revisit only if a single page needs more than about 2,000 document reads.
- Nothing is hard-deleted in v1. Clients, prospects, and projects are archived (archivedAt). Payment entries and schedule lines can be deleted, because they are just data entry.

## Stack
- Next.js latest stable (16.x), App Router, TypeScript strict, src/ directory. In Next 16 the middleware file is proxy.ts. If the latest major is not 16, tell me before continuing.
- Tailwind CSS v4 + shadcn/ui, lucide-react icons
- Firebase Web SDK (latest, modular), firebase/auth only. firebase-admin for all data access.
- Firestore on the Spark (free) plan. Do NOT use Cloud Functions, Firestore triggers, or Firebase Storage (all need Blaze).
- Cloudinary for files (agreement PDFs, signed PDFs, signatures, receipt images, revision attachments). Every asset is uploaded with type "authenticated".
- @react-pdf/renderer to generate agreement PDFs; pdf-lib to append the signature and audit page
- Resend for all email, sending from my verified domain
- zod for every input, react-hook-form for forms
- Recharts for charts, @dnd-kit for the prospects Kanban board
- react-signature-canvas for the drawn signature
- date-fns + date-fns-tz for dates
- vitest for unit tests, Firebase emulator for data-access tests
- Vercel hosting, Vercel Cron for one daily job
- Package manager: pnpm. Install packages with @latest and report the versions that actually resolved. Do not guess version numbers.

## Non-negotiable rules
1. All money is stored as integers in minor units (pence, cents, centavos). Forms accept decimals like 1500.50 and convert on the server. Format only at display time.
2. Every write goes through a server action or route handler that uses firebase-admin, validates with zod, and checks the session.
3. Every server action and every server data loader starts by verifying the session cookie and role. Anything a client can reach must also check that the target document belongs to the client's clientId. Put this in one shared data-access layer (src/server/data/) so no page queries Firestore directly.
4. Signed agreements are immutable. Server code rejects any edit to an agreement whose status is "signed".
5. "Overdue" is never stored. It is computed (see Payments logic).
6. Every state change writes one activity entry (see Activity).
7. Never expose Cloudinary URLs in HTML. Files are served through /api/files/[...] which checks the session and ownership, then redirects to a Cloudinary private download URL (cloudinary.utils.private_download_url with type "authenticated" and expires_at = now + 300 seconds). Standard signed delivery URLs do not expire, so do not use them.
8. No secrets in client code. Only NEXT_PUBLIC_FIREBASE_* values go to the browser.
9. Mobile-first UI. Every page must work cleanly at 375px wide.
10. UI text: no em dashes and no emojis.
11. Date-only fields (dueDate, paidOn, nextFollowUp, startDate, deadline) are stored as "YYYY-MM-DD" strings in Asia/Manila. Only real moments in time (createdAt, signedAt, sentAt, and so on) are Firestore Timestamps.
12. Every POST route handler checks that the Origin header matches APP_URL. Server actions already do this.

## Auth
- Admin signs in with Google (signInWithPopup) via Firebase Auth. Admin is identified by custom claim { role: "admin" }. Provide scripts/set-admin.ts to set the claim on my UID.
- Clients sign in with my own magic link, not Firebase email-link sign-in (which forces clients to re-type their email when they open the link on a different device):
  1. Client enters their email on /login, or I click "Invite to portal".
  2. If the email matches a client, the server creates a random token, stores only its SHA-256 hash in loginTokens/{hash} with { clientId, email, expiresAt (30 minutes), usedAt: null }, and sends the link via Resend with my branding. Always show the same "check your email" message, whether or not the email exists.
  3. On first use, create the Auth user if missing and set claims { role: "client", clientId }.
  4. /auth/callback?token=... verifies the hash, checks expiry and usedAt, marks it used, and returns a custom token (admin.auth().createCustomToken). The browser calls signInWithCustomToken.
- After any sign-in, the browser exchanges the ID token for a Firebase session cookie (14 days, httpOnly, secure, sameSite lax) via /api/auth/session, then signs out of the browser Firebase SDK. The cookie is the only session. Sign-out clears the cookie and revokes refresh tokens.
- proxy.ts redirects requests without a session cookie from /admin/* and /portal/* to /login. Real verification happens in server code with admin.auth().verifySessionCookie(cookie, true).
- /admin/* is admin only. /portal/* is client only.

## Data model (Firestore)
clients/{clientId}
  name, company, email (lowercased), defaultCurrency, notes, authUid, archivedAt, createdAt, updatedAt

prospects/{prospectId}
  name, company, email (lowercased), source ("referral"|"upwork"|"linkedin"|"cold_outreach"|"website"|"other"),
  service, estimatedValue (int, minor units; the monthly value for a retainer prospect), currency,
  engagementKind ("fixed"|"retainer"|"tasks", missing means "fixed"),
  rateUnit ("hour"|"day"|"week"|"month"|null) and rate (int, minor units per unit; retainer: the rate, tasks: the default price per task, otherwise 0),
  hoursPerDay and daysPerMonth (ints, hundredths: 800 is 8 hours, 2200 is 22 days; retainer prospects, default 800 and 2200),
  stage ("new"|"contacted"|"proposal_sent"|"waiting_for_client"|"negotiating"|"won"|"lost"),
  lostReason ("price"|"timing"|"no_response"|"went_elsewhere"|"other"|null), nextFollowUp ("YYYY-MM-DD"|null), notes,
  convertedClientId, convertedProjectId, archivedAt, createdAt, updatedAt, closedAt

projects/{projectId}
  clientId, title, description,
  status ("draft"|"agreement_sent"|"active"|"on_hold"|"completed"|"cancelled"),
  startDate, deadline, acceptedAt (Timestamp|null), currency, contractValue (int),
  revisionAllowance (int), archivedAt, createdAt, updatedAt,
  kind ("fixed"|"retainer"|"tasks", missing means "fixed"),
  rateUnit ("hour"|"day"|"week"|"month"|null) and rate (int, minor units per unit): retainers only, otherwise null and 0. For a tasks project, rate is the DEFAULT PRICE PER NEW TASK (0 means none, rateUnit null); it only prefills new tasks and never reprices existing ones.
  endDate ("YYYY-MM-DD"|null) and endDateAuto (bool): retainers, the last day of service. Flat (week/month) billing covers periods that start on or before min(today, endDate).
  hoursPerDay and daysPerMonth (ints, hundredths, default 800 and 2200 for any document without them): the retainer's working schedule.
  contractValue and revisionAllowance are 0 for retainer and tasks projects and are not shown for them.

projects/{projectId}/milestones/{id}   title, weight (int), order, done, doneAt
projects/{projectId}/schedule/{id}     label, kind ("deposit"|"milestone"|"final"|"change_order"), amountDue (int), dueDate, order
projects/{projectId}/payments/{id}     amount (int), paidOn, method ("bank"|"paypal"|"wise"|"gcash"|"other"),
                                       receiptPublicId (string|null), note, createdAt, updatedAt
projects/{projectId}/timeEntries/{id} date ("YYYY-MM-DD", Manila), quantityHundredths (int; 7.5 hours is 750), note, createdAt, updatedAt
                                       (retainers only)
projects/{projectId}/tasks/{id}        title, price (int, minor units), status ("todo"|"done"), order, doneAt (Timestamp|null), createdAt, updatedAt
                                       (tasks projects only)
projects/{projectId}/agreements/{id}   version, status ("draft"|"sent"|"viewed"|"signed"|"void"),
                                       snapshot (scope, price, schedule, revisionAllowance, timeline at generation time),
                                       pdfPublicId, pdfHash, signedPdfPublicId, signedPdfHash, signaturePublicId,
                                       sentAt, viewedAt, signedAt, signerName, signerEmail, signerIp, userAgent
projects/{projectId}/revisions/{id}    round, notes, attachmentPublicIds[],
                                       status ("awaiting_quote"|"awaiting_approval"|"requested"|"in_progress"|"delivered"|"approved"|"cancelled"),
                                       billable, price (int|null), changeOrderDecidedAt, requestedAt, updatedAt

activity/{id}
  type, message, actor ("admin"|"client"|"system"), visibility ("internal"|"client"),
  projectId|null, clientId|null, prospectId|null, createdAt

loginTokens/{tokenHash}
  clientId, email, expiresAt, usedAt

settings/app
  timezone, acceptedRule ("signed"|"deposit_paid"), defaultRevisionAllowance, businessName, businessEmail, agreementTemplate,
  fxOverrides ({ USD?: int, GBP?: int }: manual PHP per 1 unit stored in 1/10000 PHP, so 56.1234 is 561234; absent or missing key = use the live rate; valid range 1 to 10000000000 = 0.0001 to 1,000,000 PHP; old documents without it mean no overrides; no secrets)

standalonePayments/{id}   (top level, "payment only" entries: money received that belongs to no project, schedule line, retainer or task list)
  clientId (string|null), payerName (string, required when clientId is null, up to 120), note (up to 500), currency ("GBP"|"USD"|"PHP"), amount (int, minor units, greater than 0),
  paidOn ("YYYY-MM-DD" Manila, no later than tomorrow), method (same list as project payments), receiptPublicId (string|null, stored under pmt/standalone/receipts, admin only), createdAt, updatedAt

Time entries and tasks need no index: they are read per project, or with unfiltered collection-group scans (collection groups "timeEntries" and "tasks") on the dashboard, like payments and schedule.

Create firestore.indexes.json for every compound and collection-group query you use. firestore.rules denies all reads and writes from client SDKs (firebase-admin bypasses rules; the rules are a backstop in case the browser SDK is ever misused).

## Business logic (server, in src/lib/finance.ts and src/lib/projects.ts, pure functions with unit tests)
- Progress: sum of weights of done milestones, as a percentage of the total weight. When adding or removing a milestone, the form shows the current total and blocks saving until weights sum to 100.
- Paid: sum of payments[].amount. Pending: contractValue minus paid (can be negative, shown as "overpaid"). For retainer and tasks projects, pending is the billed total minus paid (see Retainers and Tasks).
- Schedule: the schedule must sum to contractValue. Saving a schedule or contract value that breaks this shows the difference and blocks saving. A project with no schedule is allowed; it simply has no due dates and nothing can be overdue.
- Allocation: payments are applied to schedule lines in dueDate order (oldest first). No manual allocation. A schedule line is "paid", "partly paid", or "unpaid" based on this.
- Overdue: a schedule line is overdue when dueDate < today (Asia/Manila) and it is not fully covered by the allocation.
- Monthly earnings: payments grouped by the month of paidOn, per currency.
- Bill lines: the allocation works on "bill lines" ({label, amountDue, dueDate}). A fixed project's stored schedule lines are bill lines. Retainer and tasks projects have no stored schedule: their lines are derived on read from time entries or done tasks and go through the same allocation (oldest due date first, paid / partly paid / unpaid, overdue when dueDate < today and not covered). Pure code: src/lib/finance.ts (allocateBills, billsFinance) and src/lib/billing.ts (derived lines, financeFor).
- Retainers: the owner logs time (date, hours or days with decimals, note). An entry is worth round(quantityHundredths * rate / 100) minor units, so rounding happens per entry. Billing is in arrears by Manila calendar month: each month with entries is one bill line (label "Nov 2026", amountDue the sum of that month's entries, dueDate the last day of the month, February and leap years included). The current month is "in progress" and cannot be overdue until its last day has passed. A retainer starts "active" with acceptedAt set to its start date (today when blank) and has no agreement or revisions. Status can be set to on_hold or completed (ended). Editing the rate re-prices all logged time because bills are derived from the current rate. The client sees a monthly summary and payments, never individual entries or notes.
- Flat retainers (rateUnit "month" or "week"): no time is logged. Every period from the one containing startDate up to and including the last one that STARTS on or before min(today, endDate) is billed in full (no proration of the first period) as one derived bill line: month = label "Nov 2026", amountDue = rate, dueDate = last day of that month (Manila); week (Monday to Sunday, Manila) = label "Week of 3 Nov 2026", amountDue = rate, dueDate = that Sunday. The current period is "in progress" and cannot be overdue until its last day passes. Changing the rate re-prices every period. Limitation: periods cannot be skipped or adjusted; use the end date to stop billing. Setting a flat retainer on_hold or completed with a blank endDate sets endDate to today (endDateAuto true); moving it back to active clears an auto-set endDate only, never one the owner typed or changed. Hour and day retainers are unchanged and ignore endDate for billing.
- Working schedule (retainers and retainer prospects): hoursPerDay (0.25 to 24, default 8) and daysPerMonth (0.5 to 31, default 22), stored as hundredths. Expected per month = hour: rate x hoursPerDay x daysPerMonth; day: rate x daysPerMonth; week: rate x 52 / 12; month: rate (Math.round to minor units). Equivalents from the monthly figure: hourly = monthly / (hoursPerDay x daysPerMonth), daily = monthly / daysPerMonth, weekly = monthly x 12 / 52 (zero divisors give 0). Billing is not affected; the schedule only drives the expected figures, the time log meter (logged vs expected hours or days for the current month: under below 90%, on track to 110%, over beyond) and the prefill of a new time entry (hoursPerDay hours, or 1 day). The retainer prospect form prefills "Estimated monthly value" from the expected monthly amount while the field is empty or still the last figure it filled in; a typed value is never overwritten.
- Tasks: a task has a title and a price and is todo or done. It is owed from the moment it is marked done: one bill line (label the task title, amountDue its price, dueDate the Manila date of doneAt). Marking it back to todo removes the line. A tasks project starts "active" with acceptedAt set to its start date and has no agreement, revisions, milestones or weights; progress is "x of y tasks done". The client sees the task list with price and status, and payments.
- Accepted counting: because retainer and tasks projects are accepted when created, they count in "accepted this month" (and all time) for the month of their start date.
- Accepted: acceptedAt is set once, by the server, at the moment the event happens. With rule "signed", signing sets it. With rule "deposit_paid", the payment entry that first makes the deposit lines fully covered sets it. Either way the project moves to "active" if it was "draft" or "agreement_sent". Deleting a payment never clears acceptedAt; I can clear it manually if I made a mistake.
- Project status: "agreement_sent" and "active" are set automatically by the flows above. "on_hold", "completed", "cancelled", and moving back to "active" are manual. "In revision" is not a status; show a badge when the project has an open revision.
- Prospects: "added this month" uses createdAt. Won and lost count in the month of closedAt. Moving out of won or lost clears closedAt and lostReason. Win rate = won / (won + lost) for the selected period. Stages in order: new, contacted, proposal_sent, waiting_for_client ("Waiting for client", teal badge with a dot), negotiating, won, lost. Everything except won and lost is OPEN: it counts in the pipeline, open counts, the top list and follow-ups, never in the win rate. A stored stage that is missing or unknown is shown as new. An open stage converts like any other. Pipeline value = sum of estimatedValue of open prospects (not won or lost), per currency, unweighted.
- Convert prospect: match an existing client by lowercased email first. Create one only if none exists. Create a project of the prospect's kind, then link both IDs back on the prospect. Fixed: a draft project with contractValue = estimatedValue and the prospect's currency (unchanged). Retainer: an active retainer with the prospect's rateUnit, rate and currency, acceptedAt = start date (today), no agreement. Tasks: an active project with an empty task list and the prospect's default price per task as its rate. Retainers also copy the working schedule (and any rate unit, including week and month). Conversion is refused if the prospect was already converted.
- Revisions:
  - Counted revisions = revisions whose status is not "cancelled". A new request gets round = counted + 1.
  - If round <= revisionAllowance: status "requested".
  - If round > revisionAllowance: billable = true, status "awaiting_quote". I set a price, status becomes "awaiting_approval", and the client is emailed.
  - Client approves: status "requested", a schedule line (kind "change_order", amountDue = price, dueDate = today) is added, and contractValue increases by price, in one transaction.
  - Client declines: status "cancelled", so it does not count toward the allowance.
  - A client can have at most 3 revisions in "awaiting_quote" or "requested" at once.

## Activity
Every state change writes one activity entry in the same transaction. Set visibility "client" only for entries the client should see (agreement sent, signed, milestone done, payment recorded, revision status changes, change order decisions, and for task projects: task added, updated, done, reopened or removed). Time logged, edited or removed on a retainer is internal: the client sees the monthly summary instead. Notes, prospect events, internal edits, and anything about follow-ups are "internal". The portal only ever loads visibility "client" for that client's projects.

## Agreement and e-sign flow
1. I create an agreement from settings.agreementTemplate merged with the project (scope, price, payment schedule, revision allowance, timeline). Store an immutable snapshot of these values.
2. Server renders the PDF with @react-pdf/renderer, computes SHA-256, uploads it to Cloudinary (resource_type raw, type authenticated), and stores pdfPublicId and pdfHash.
3. Send: status "sent", project status "agreement_sent". Email the client a sign-in link (the same magic link flow) that lands on the agreement page.
4. First time the client opens the agreement page: status "viewed", viewedAt set.
5. Sign page shows the PDF through /api/files, plus typed full name, drawn signature, and a required checkbox: "I have read and agree to this agreement and consent to sign electronically."
6. POST to the server with agreementId, version, and the pdfHash shown on the page. The server checks the agreement belongs to the client, is "sent" or "viewed", is the latest non-void version, and that the hash matches. It captures the IP (x-real-ip, else the first x-forwarded-for entry) and user agent, and uploads the signature PNG. With pdf-lib it appends a signature block and a final "Audit trail" page (agreement ID, version, signer name, email, timestamp in UTC and Asia/Manila, IP, user agent, original pdfHash). It uploads the signed PDF, stores signedPdfHash, sets status "signed", and applies the accepted logic if the rule is "signed".
7. Email both the client and me: the signed PDF as an attachment, plus a link to the portal or admin page. Never put a Cloudinary URL in an email.
8. Scope changes create a new version and set the old one to "void". Signed documents are never edited.

## File uploads
- The browser uploads directly to Cloudinary using parameters signed by a server action (folder fixed per project, type "authenticated", 10 MB limit checked in the browser). Files never pass through a Vercel function, because of the 4.5 MB request limit.
- After upload, the browser sends the public_id to a server action, which checks that it is inside the expected folder for that project and user before saving it.
- The drawn signature (small PNG) is the only file posted to my server directly.
- Use resource_type "raw" for PDFs and "image" for receipts, signatures, and image attachments. All are type "authenticated".

## Pages
Admin
- /admin: dashboard. Cards: earned this month and earned this year (per currency), projects accepted this month and all time, active projects, pending balance across active projects (per currency; billed but unpaid retainer months and done tasks are included, and for these two kinds also after the project is completed), recurring billed this month (retainer bill lines due in the current Manila month, in progress included, per currency; the same card shows "Expected this month": the sum of the expected monthly amounts of ACTIVE retainers only, on hold and completed excluded, per currency or in PHP), pipeline potential (see Pipeline), win rate (last 90 days).
- Earnings include payment-only entries: earned this month and year, the weekly and monthly charts, sparklines, deltas, per currency and PHP, all use project payments plus standalonePayments, bucketed by Manila paidOn and converted with the same rates and overrides. Payment-only entries never affect pending balance, overdue, project progress, accepted counts or the recurring KPIs. Recording, editing and deleting one writes an internal activity entry in the same batch or transaction (types standalone_payment.recorded, .updated, .deleted). The client portal never shows them, and the client detail page lists that client's entries in "Payments with no project".
- Pipeline: for OPEN prospects only (not won or lost), unweighted ("Not weighted by win chance"): one-off potential (estimated value of fixed and task prospects), monthly recurring potential (sum of retainer prospect monthly values, shown with "/mo"), first year potential = one-off + monthly x 12 (labelled a projection), open prospect counts by kind, a share bar (one-off versus recurring, animated, reduced motion respected) and the top 5 open prospects by potential (retainers rank by monthly x 12), each with kind, stage and amount ("/mo" for retainers), linking to the prospect. In PHP mode the pieces are converted separately and the first year is built from those rounded pieces, so the parts add up exactly; ranking uses PHP when rates exist. The old single "Pipeline value" figure is replaced. Charts: earnings per month for the last 12 months, and projects accepted per month for the last 12 months. Earnings uses one small bar chart per currency (amounts in different currencies cannot share an axis). Values are printed directly on every bar with Recharts LabelList; nothing is hidden in tooltips. A "Needs attention" list shows overdue schedule lines (and overdue retainer months and done tasks), follow-ups due today or earlier, and revisions waiting on me (awaiting_quote or requested).
- Retainer rates are shown together with the per-month figure wherever they appear (projects list rows and cards, project header and overview, client project list, portal retainer card for the client's own project, prospect board, table and detail): "$25.00 / hour" with "about $4,400.00 / month" beneath, from expectedMonthly with the project's hoursPerDay and daysPerMonth (defaults 8 and 22; week = rate x 52 / 12). A per-month rate shows once. Money stays in the project's own currency. The command palette lists pages and actions only and shows no rates.
- /admin/prospects (each prospect has a kind; the new prospect form picks the kind first, a retainer prospect also takes a rate, a unit (hour, day, week or month) and a working schedule, and its value is monthly, shown with a "/mo" suffix; a tasks prospect may take a default price per task; filter by kind): table view and Kanban view (drag between stages with @dnd-kit), filters by stage and source, overdue follow-ups pinned first. Moving a prospect to lost requires a reason.
- /admin/prospects/[id]: details, notes, "Convert to client" action.
- /admin/clients and /admin/clients/[id]: client info, invite to portal, their projects.
- /admin/projects and /admin/projects/[id]. The list has a kind filter and a kind badge; New project starts with a kind picker. Fixed projects have the tabs Overview (progress bar, milestones, status), Payments (contract value, schedule with paid, partly paid, unpaid, and overdue states, payments received list with add, edit, and delete, paid and pending totals), Agreement, Revisions, Activity. Retainers have Overview, Time log (add / edit / delete entries, grouped by month with subtotals), Payments, Activity. Task projects have Overview, Tasks (add, edit, delete, tick done with totals for done value, still to do, owed, paid and pending; shows the default price per task with a shortcut to change it, new tasks prefill their price from it, and "Add and add another" keeps the dialog open), Payments, Activity. Week and month retainers replace the Time log tab with Billing periods (newest first, with billed, paid and pending totals and paid / partly paid / unpaid / in progress / overdue states); creating a task project or prospect takes an optional default price per task. For retainer and tasks the Payments tab shows the derived bill lines instead of a schedule editor.
- /admin/payments: ALL money received, newest first: project payments and payment-only entries together, with filters (month, currency, client, source: all, project, payment only; kept in the URL), totals per currency and a PHP total (using your rates where set), a source badge ("Project: X" linking to the project, or "Payment only"), method, note, receipt link, edit and delete for payment-only entries (project payments link to their project to edit). "Record payment" is also on the dashboard header and in the command palette (Ctrl+K). The dialog first chooses "Payment only" (default and fastest: who paid, a client or "Someone else" plus a payer name; amount with currency, defaulting to the client's default currency or PHP; date, default today; method; note; receipt upload only when Cloudinary is configured, otherwise hidden) or "Attach to a project" (client, then project, then the normal project payment path with its allocation, acceptance and email logic unchanged). The sidebar has a Payments item.
- /admin/settings: exchange rates (see Exchange rates), timezone, acceptedRule, default revision allowance, business details, agreement template editor (plain text with {{placeholders}}), Export all data (JSON with time entries, tasks and payment-only entries included, payments CSV (project payments plus payment-only entries; a final source column says project or standalone, and payment-only rows have project_kind none and empty project columns), time log CSV, tasks CSV), list of backups (which include time entries, tasks and payment-only entries).

Client portal
- /portal: list of the client's projects.
- /portal/projects/[id]: for fixed projects: progress, milestones, payment schedule, payments received, pending balance, agreement (view and sign), revisions (request one with notes and files, approve or decline change orders), and activity (visibility "client" only). For retainers: a monthly summary (quantity and amount per month, paid, outstanding and status), payments, pending balance and activity. For task projects: the task list with price and status, payments, pending balance and activity. Internal notes are never shown.

Public
- /login: Google button for admin, email field for client magic link. /auth/callback completes client sign-in.

## Dashboard currency view
The dashboard has a toggle "PHP total | Original currencies" (default PHP total). The choice is the ?view= parameter and is remembered in a cookie that the server reads, so the page renders in the right mode on first paint.
- Original currencies: exactly the per-currency view, one block or chart per currency.
- PHP total: every money figure (earned this month and year, pending balance, recurring billed, pipeline value, weekly and monthly earnings charts, sparklines and deltas) is one PHP number or series. Counts such as accepted projects and win rate are unaffected, and the Needs attention list keeps each item's own currency. Each KPI names the original amounts it was converted from.
- Rates (src/lib/fx/*, server only). Source order for each currency to PHP: Wise (GET https://api.wise.com/v1/rates?source={CUR}&target=PHP, header Authorization: Bearer WISE_API_TOKEN, mid-market) only when the optional env var WISE_API_TOKEN is set; then https://open.er-api.com/v6/latest/{CUR}; then https://api.frankfurter.dev/v1/latest?base={CUR}&symbols=PHP. Each request has a 4 second timeout and uses Next's fetch cache with a 1 hour revalidate. PHP to PHP is exactly 1. The token is never logged, never put in a URL and never sent to the browser. Wise's official rates endpoint needs a personal API token that only the account owner can create; without one the free public sources are used and the page says "market rates" instead of "Wise mid-market rates".
- Rounding: amountPHP = round(minor * rate) per bucket (one currency in one period, for example USD payments in October), rounded half up after trimming float noise, then the buckets are summed. A chart's bars therefore add up to its total, and the year total is the sum of its converted months.
- Honest limitation, stated in the UI: this is a display conversion at the CURRENT rate applied to every payment, including old ones. It is not the rate on the day each payment was received, so historical PHP totals move as rates move. Nothing converted is stored.
- Failure: if no source can quote a needed currency the page falls back to original currencies and shows "Live rates unavailable, showing original currencies". If a source fails shortly after a good fetch, the last known rates (up to 24 hours old) are used and labelled as such. Rates never throw into the page.
- Under the header: "Converted at Wise mid-market rates, updated 12 minutes ago" (or "market rates" for the free sources) with a popover listing each rate used and its source per currency: "1 USD = 56.20 PHP (Wise, 5 minutes ago)", "(market, ...)" or "(your rate)". With a mix the line reads "Converted at your rates and Wise mid-market rates, updated ...", with only manual rates "Converted at the rates you set in Settings." (no "updated"). The past-payments note adapts: with a manual rate it says the rate you set applies to all past payments.

### Exchange rates (my own rates)
- Settings > Exchange rates: for USD and GBP a "Live rate | My rate" control. With "My rate" a decimal input "1 USD = ___ PHP" (up to 4 decimals, 0.0001 to 1,000,000), the current live rate as a hint ("Live now: 56.12, Wise" or "market") and a "Use live rate" reset. PHP to PHP is always 1 and not editable. Saved through saveSettings (zod, admin only, the existing "Settings updated" activity entry), stored in settings/app as fxOverrides in 1/10000 PHP; "live" deletes the key. Saving revalidates /admin and /admin/settings.
- Resolution (src/lib/fx/overrides.ts resolveRateTable, called by loadRateTable): a manual rate wins over Wise, the free sources and the remembered last-known rates for its currency. Only currencies WITHOUT a manual rate are asked of the network; when every needed currency has one, no network call is made at all. If live rates fail but every currency that needs them has a manual rate, the dashboard converts normally with no "Live rates unavailable" notice; a currency without a manual rate and without a live rate still falls back to original currencies as before. Overrides are applied after the cached live fetch and are never stored inside it, so a change shows on the next render.
- Manual quotes carry source "manual", have no publish time (ignored for "updated X ago") and are not counted when deciding "Wise" versus "market".

## Default agreement template
Write a plain, readable web development service agreement with these sections: Parties, Scope of Work, Timeline, Fees and Payment Schedule, Revisions (included rounds, and extra rounds billed via change order), Client Responsibilities, Intellectual Property (transfers on full payment), Confidentiality, Termination, Limitation of Liability, Electronic Signature consent, Governing Law placeholder. Use {{placeholders}} for all project-specific values. Add a comment at the top of the template file saying it is a starting draft to be reviewed before use with real clients.

## Email (Resend)
Templates: client sign-in link (used for invites and logins), agreement ready to sign, agreement signed (to both sides, PDF attached), revision status update, change order awaiting approval, payment recorded (confirmation to the client with amount, date, and new pending balance), daily admin digest.

## Daily cron
- vercel.json cron hitting /api/cron/daily once a day at 00:00 UTC (08:00 Manila). Protect it with Authorization: Bearer CRON_SECRET.
- Digest: send me one email listing follow-ups due today or overdue, overdue schedule lines, and revisions waiting on me. Skip the email if all three are empty.
- Backup: write a full JSON export to Cloudinary (resource_type raw, type authenticated, folder backups/, named YYYY-MM-DD.json). Keep the latest 30 and delete older ones. The Spark plan has no Firestore backups, so this is the only safety net.
- Delete loginTokens older than 7 days.

## Environment variables
Create .env.example containing:
NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_APP_ID,
FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY,
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAIL,
APP_URL, CRON_SECRET
Handle FIREBASE_ADMIN_PRIVATE_KEY newline escaping. Initialise firebase-admin once (singleton). Validate all env vars with zod at startup.

## Project structure
src/app/(public)/login, src/app/auth/callback, src/app/admin/..., src/app/portal/..., src/app/api/ (auth/session, files, cron/daily, agreements/sign)
src/proxy.ts
src/lib/firebase/client.ts (auth only), src/lib/firebase/admin.ts, src/lib/auth/session.ts, src/lib/money.ts, src/lib/dates.ts,
src/lib/finance.ts, src/lib/projects.ts, src/lib/cloudinary.ts, src/lib/email/, src/lib/pdf/, src/lib/env.ts, src/lib/validation/ (zod schemas)
src/server/data/ (all Firestore reads, with role and ownership checks)
src/server/actions/ (one file per domain: prospects, clients, projects, payments, agreements, revisions, settings)
src/components/ (ui from shadcn, plus feature components)
scripts/set-admin.ts
tests/ (vitest unit tests and emulator data-access tests)

## Build order
Work in phases. At the end of each phase: run pnpm typecheck, pnpm lint, pnpm test, and pnpm build, fix every error, commit with a clear message, then give me a short summary (what works, what is stubbed, any tradeoff you made) and wait for my go-ahead before starting the next phase.
1. git init, scaffold, Tailwind, shadcn, env validation, Firebase client (auth) and admin setup, session auth, admin claim script, proxy.ts, deny-all rules, data-access layer, layout and navigation, Clients CRUD with archive, Projects CRUD with archive, milestones and progress, activity log helper. Unit tests for money.ts and dates.ts.
2. Prospects: table, Kanban, follow-ups, lost reasons, conversion to client and project.
3. Payments: contract value, schedule, payments received, receipt upload, allocation, paid and pending, overdue, dashboard cards and charts. Unit tests for finance.ts (allocation, overdue, partial payments, overpayment, monthly grouping across the Manila month boundary).
4. Client magic link and portal, agreements: template in settings, PDF generation, send, view tracking, e-sign flow, signed PDF with audit page, accepted logic, /api/files. Emulator tests proving a client cannot load another client's project, payments, agreements, revisions, activity, or files.
5. Revisions and change orders, all email templates, daily cron (digest, backup, token cleanup).
6. Hardening: data export, empty and loading states, mobile pass at 375px, README with setup and deploy steps (Firebase project and region, Google sign-in provider and authorized domains, Cloudinary setup, Resend domain verification, Vercel env vars and cron, setting the admin claim, restoring from a backup).

## Before you write code
Reply with: the final folder tree, the list of packages you will install, and any point in this spec you think is wrong or risky. Then stop and wait for my answers before starting Phase 1.
