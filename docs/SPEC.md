# Build: Client Project Tracker v1

You are building a production web app for me, Mark (a solo full-stack developer). I run client projects and need one private dashboard to track prospects, projects, progress, agreements, revisions, payments received, and monthly earnings, plus a client portal. Ship a working v1 fast. Keep running cost near zero. Flag tradeoffs instead of over-engineering. Do not add features that are not in this spec without asking.

This app does NOT process payments. Clients pay me outside the app (bank, PayPal, Wise, GCash). I type in what was received, and the app calculates paid, pending, and overdue amounts for visibility only.

## Decisions (fixed for v1)
- Firestore region: asia-southeast1 (Singapore). Vercel function region: sin1.
- Business time zone: Asia/Manila. All month buckets and "today" use this zone.
- A project counts as "accepted" when its agreement is signed. Switchable in settings (signed | deposit_paid). Changing the setting applies going forward only; it never rewrites past acceptedAt values.
- Clients can see their payment schedule, payments received, and pending balance in the portal.
- Single admin (me). Design roles so a "staff" role can be added later.
- Currencies: GBP, USD, PHP. No conversion. Totals are always shown per currency.
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
  service, estimatedValue (int, minor units), currency,
  stage ("new"|"contacted"|"proposal_sent"|"negotiating"|"won"|"lost"),
  lostReason ("price"|"timing"|"no_response"|"went_elsewhere"|"other"|null), nextFollowUp ("YYYY-MM-DD"|null), notes,
  convertedClientId, convertedProjectId, archivedAt, createdAt, updatedAt, closedAt

projects/{projectId}
  clientId, title, description,
  status ("draft"|"agreement_sent"|"active"|"on_hold"|"completed"|"cancelled"),
  startDate, deadline, acceptedAt (Timestamp|null), currency, contractValue (int),
  revisionAllowance (int), archivedAt, createdAt, updatedAt

projects/{projectId}/milestones/{id}   title, weight (int), order, done, doneAt
projects/{projectId}/schedule/{id}     label, kind ("deposit"|"milestone"|"final"|"change_order"), amountDue (int), dueDate, order
projects/{projectId}/payments/{id}     amount (int), paidOn, method ("bank"|"paypal"|"wise"|"gcash"|"other"),
                                       receiptPublicId (string|null), note, createdAt, updatedAt
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
  timezone, acceptedRule ("signed"|"deposit_paid"), defaultRevisionAllowance, businessName, businessEmail, agreementTemplate

Create firestore.indexes.json for every compound and collection-group query you use. firestore.rules denies all reads and writes from client SDKs (firebase-admin bypasses rules; the rules are a backstop in case the browser SDK is ever misused).

## Business logic (server, in src/lib/finance.ts and src/lib/projects.ts, pure functions with unit tests)
- Progress: sum of weights of done milestones, as a percentage of the total weight. When adding or removing a milestone, the form shows the current total and blocks saving until weights sum to 100.
- Paid: sum of payments[].amount. Pending: contractValue minus paid (can be negative, shown as "overpaid").
- Schedule: the schedule must sum to contractValue. Saving a schedule or contract value that breaks this shows the difference and blocks saving. A project with no schedule is allowed; it simply has no due dates and nothing can be overdue.
- Allocation: payments are applied to schedule lines in dueDate order (oldest first). No manual allocation. A schedule line is "paid", "partly paid", or "unpaid" based on this.
- Overdue: a schedule line is overdue when dueDate < today (Asia/Manila) and it is not fully covered by the allocation.
- Monthly earnings: payments grouped by the month of paidOn, per currency.
- Accepted: acceptedAt is set once, by the server, at the moment the event happens. With rule "signed", signing sets it. With rule "deposit_paid", the payment entry that first makes the deposit lines fully covered sets it. Either way the project moves to "active" if it was "draft" or "agreement_sent". Deleting a payment never clears acceptedAt; I can clear it manually if I made a mistake.
- Project status: "agreement_sent" and "active" are set automatically by the flows above. "on_hold", "completed", "cancelled", and moving back to "active" are manual. "In revision" is not a status; show a badge when the project has an open revision.
- Prospects: "added this month" uses createdAt. Won and lost count in the month of closedAt. Moving out of won or lost clears closedAt and lostReason. Win rate = won / (won + lost) for the selected period. Pipeline value = sum of estimatedValue of open prospects (not won or lost), per currency, unweighted.
- Convert prospect: match an existing client by lowercased email first. Create one only if none exists. Create a draft project with contractValue = estimatedValue and the prospect's currency, then link both IDs back on the prospect.
- Revisions:
  - Counted revisions = revisions whose status is not "cancelled". A new request gets round = counted + 1.
  - If round <= revisionAllowance: status "requested".
  - If round > revisionAllowance: billable = true, status "awaiting_quote". I set a price, status becomes "awaiting_approval", and the client is emailed.
  - Client approves: status "requested", a schedule line (kind "change_order", amountDue = price, dueDate = today) is added, and contractValue increases by price, in one transaction.
  - Client declines: status "cancelled", so it does not count toward the allowance.
  - A client can have at most 3 revisions in "awaiting_quote" or "requested" at once.

## Activity
Every state change writes one activity entry in the same transaction. Set visibility "client" only for entries the client should see (agreement sent, signed, milestone done, payment recorded, revision status changes, change order decisions). Notes, prospect events, internal edits, and anything about follow-ups are "internal". The portal only ever loads visibility "client" for that client's projects.

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
- /admin: dashboard. Cards: earned this month and earned this year (per currency), projects accepted this month and all time, active projects, pending balance across active projects (per currency), pipeline value (per currency), win rate (last 90 days). Charts: earnings per month for the last 12 months, and projects accepted per month for the last 12 months. Earnings uses one small bar chart per currency (amounts in different currencies cannot share an axis). Values are printed directly on every bar with Recharts LabelList; nothing is hidden in tooltips. A "Needs attention" list shows overdue schedule lines, follow-ups due today or earlier, and revisions waiting on me (awaiting_quote or requested).
- /admin/prospects: table view and Kanban view (drag between stages with @dnd-kit), filters by stage and source, overdue follow-ups pinned first. Moving a prospect to lost requires a reason.
- /admin/prospects/[id]: details, notes, "Convert to client" action.
- /admin/clients and /admin/clients/[id]: client info, invite to portal, their projects.
- /admin/projects and /admin/projects/[id] with tabs: Overview (progress bar, milestones, status), Payments (contract value, schedule with paid, partly paid, unpaid, and overdue states, payments received list with add, edit, and delete, paid and pending totals), Agreement, Revisions, Activity.
- /admin/settings: timezone, acceptedRule, default revision allowance, business details, agreement template editor (plain text with {{placeholders}}), Export all data (JSON and CSV), list of backups.

Client portal
- /portal: list of the client's projects.
- /portal/projects/[id]: progress, milestones, payment schedule, payments received, pending balance, agreement (view and sign), revisions (request one with notes and files, approve or decline change orders), and activity (visibility "client" only).

Public
- /login: Google button for admin, email field for client magic link. /auth/callback completes client sign-in.

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
