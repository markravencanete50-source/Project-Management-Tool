# Build contract (for everyone working on this repo)

Read `docs/SPEC.md` first. This file explains how the foundation works and the
rules every work package follows. Do not modify files outside your package's
ownership list. If you need a change in a shared file, say so in your report
instead of editing it.

## Stack facts that differ from older habits

- **Next.js 16.** `params` and `searchParams` are Promises (`const { id } = await params`).
  Global types `PageProps<"/admin/projects/[id]">`, `LayoutProps<"/admin">`,
  `RouteContext<"/api/x/[id]">` exist after `next typegen` (run by `pnpm typecheck`).
  The middleware file is `src/proxy.ts`. Cache Components is OFF: pages are
  dynamic by default; do not add `"use cache"`.
- **shadcn/ui on Base UI** (style base-nova), not Radix. There is no `asChild`.
  Use the `render` prop instead, e.g. `<Button render={<Link href="/x" />}>Go</Button>`,
  `<DialogTrigger render={<Button />}>Open</DialogTrigger>`. Read the component
  file in `src/components/ui/` before using it. Forms: react-hook-form +
  `@hookform/resolvers/zod` + the `Field*` components in `ui/field.tsx`.
  Toasts: `sonner` (`toast` from "sonner"); a `<Toaster />` is in the root layout.
  If you need another shadcn component, do not add it; build from existing ones.
- **zod v4** (`z.email()`, `z.url()`, `error` instead of `message` where needed).
- **Recharts 3**, **lucide-react** icons, **date-fns v4** + **date-fns-tz v3**.

## Foundation (read these, do not edit)

| File | Use |
|---|---|
| `src/lib/types.ts` | Every document type, enums, `ActionResult<T>` |
| `src/lib/money.ts` | `toMinor`, `fromMinor`, `formatMoney`, `formatMoneyCompact`, `CURRENCIES`, `MoneyByCurrency`, `addMoney` |
| `src/lib/dates.ts` | `TZ`, `todayIso`, `isoDateSchema`, `monthKeyOf`, `monthKeyOfInstant`, `lastNMonths`, `formatIsoDate`, `formatInstant`, `formatMonthKey`, `addDaysIso` |
| `src/lib/finance.ts` | `projectFinance`, `allocate`, `depositCovered`, `earningsByMonth`, `sumPayments`, `sortSchedule` |
| `src/lib/projects.ts` | `progress`, `weightsValid`, `countedRevisions`, `nextRevisionRound`, `isBillableRound`, `REVISION_*` constants |
| `src/lib/auth/session.ts` | `getSession`, `requireAdmin`, `requireClient`, `requireAny`, `SESSION_COOKIE` |
| `src/lib/firebase/admin.ts` | `db()`, `adminAuth()` |
| `src/lib/firebase/client.ts` | `clientAuth()` (browser sign-in only) |
| `src/lib/env.ts` | `env()`, `appUrl(path)` |
| `src/server/data/refs.ts` | `col.*` collection references. Never hand-build paths. |
| `src/server/data/convert.ts` | `fromDoc<T>(snap)`, `fromDocs<T>(querySnap)` |
| `src/server/data/access.ts` | `getAccessibleProject(projectId)` (admin, or owning client; 404 otherwise), `canAccessProject` |
| `src/server/data/settings.ts` | `getSettings()`, `DEFAULT_SETTINGS` |
| `src/server/activity.ts` | `logActivity(txOrBatch, entry)` |
| `src/server/accepted.ts` | `markAccepted(tx, projectRef, project, reason, actor)` |
| `src/server/action.ts` | `run(fn)` wrapper returning `ActionResult`, `UserError` |
| `src/lib/cloudinary.ts` | `uploadBuffer`, `downloadBuffer`, `privateDownloadUrl`, `projectFolder`, `isInFolder`, `deleteAsset`, `listFolder`, `BACKUP_FOLDER` |
| `src/lib/files.ts` | `fileUrl(storedId)`: the only way to link to a file |
| `src/lib/upload-client.ts` | `uploadFile(file, { projectId, purpose })` browser upload, returns stored id |
| `src/lib/email/index.ts` | All email functions. Call these; the email package implements them. |
| `src/components/common/*` | `PageHeader`, `MoneyByCurrencyView`, `useAction()` |

## Rules

1. **Server actions** live in `src/server/actions/<domain>.ts` with `"use server"`.
   Every exported action: wraps its body in `run(async () => { ... })`, calls
   `requireAdmin()` / `requireClient()` / `getAccessibleProject()` first, parses
   input with a zod schema from `src/lib/validation/<domain>.ts`, and returns
   `ActionResult`. Clients get ownership checks on every target document.
2. **Data loaders** live in `src/server/data/<domain>.ts` with `import "server-only"`.
   Every exported loader calls the session check itself. Pages never query Firestore directly.
3. **Money** inputs are strings in forms; convert with `toMinor` in the zod schema
   (`z.string().transform(...)` that errors when `toMinor` returns null). Store integers.
4. **Date-only** fields are `"YYYY-MM-DD"` strings (`isoDateSchema`); use `<input type="date">`.
   Instants are Firestore Timestamps (write `FieldValue.serverTimestamp()` or `Timestamp.now()`).
5. **Activity:** every state change calls `logActivity` inside the same transaction
   or batch. `visibility: "client"` only for things the client should see.
6. **Writes that depend on reads** (anything touching counts, schedules, acceptance)
   use `db().runTransaction`.
7. **Queries:** at this scale prefer single-field queries and filter in memory.
   If you add a compound or collection-group query, list it in your report so it
   goes into `firestore.indexes.json`.
8. **Files:** never put a Cloudinary URL in HTML or email; use `fileUrl()`.
   Validate any browser-supplied stored id with `isInFolder()` before saving.
9. **UI:** mobile first, must work at 375px wide. Tables collapse to stacked cards
   or scroll inside their own container (never the page). No em dashes and no emojis
   in any UI text or email copy. Use `PageHeader` at the top of pages.
   Plain, calm, professional look using the shadcn theme tokens; no gradients.
10. **Empty and loading states:** every list has an empty state (`ui/empty.tsx`);
    add `loading.tsx` with `Skeleton` for each route segment you own.
11. **Archive, do not delete** clients, prospects and projects (`archivedAt`). Lists
    hide archived items by default with a "Show archived" toggle.
12. **Checks:** run `pnpm typecheck` and `pnpm lint` and fix every error in YOUR
    files. Errors in files other packages own are not yours; mention them. Do NOT
    run `pnpm build` or `pnpm dev` (other packages are building in parallel), and
    do NOT run any git commands.

## Routes and ownership

| Package | Owns |
|---|---|
| A Prospects | `src/app/admin/prospects/**`, `src/components/prospects/**`, `src/server/{data,actions}/prospects.ts`, `src/lib/validation/prospects.ts` |
| B Core | `src/app/admin/layout.tsx`, `src/app/admin/clients/**`, `src/app/admin/projects/**`, `src/app/portal/layout.tsx`, `src/app/portal/page.tsx`, `src/app/portal/projects/[id]/page.tsx` (+ loading), `src/components/{shell,clients,projects-core,activity}/**`, `src/server/{data,actions}/{clients,projects,milestones}.ts`, `src/server/data/activity.ts`, `src/lib/validation/{clients,projects}.ts` |
| C Payments and dashboard | `src/app/admin/page.tsx` (+ loading), `src/components/projects/payments-tab.tsx`, `src/components/portal/payments-section.tsx`, `src/components/{payments,dashboard}/**`, `src/server/{data,actions}/payments.ts`, `src/server/data/dashboard.ts`, `src/lib/validation/payments.ts` |
| D Auth and agreements | `src/app/(public)/**`, `src/app/auth/**`, `src/app/api/auth/**`, `src/app/api/agreements/**`, `src/app/portal/projects/[id]/agreement/**`, `src/components/projects/agreement-tab.tsx`, `src/components/portal/agreement-section.tsx`, `src/components/{auth,agreements}/**`, `src/lib/pdf/**`, `src/server/actions/{auth,agreements}.ts`, `src/server/data/agreements.ts`, `src/lib/validation/agreements.ts` |
| E Revisions, email, cron, settings | `src/components/projects/revisions-tab.tsx`, `src/components/portal/revisions-section.tsx`, `src/components/{revisions,settings}/**`, `src/lib/email/**`, `src/app/api/cron/**`, `src/app/api/export/**`, `src/app/admin/settings/**`, `src/server/{data,actions}/{revisions,settings}.ts`, `src/server/export.ts`, `src/lib/validation/{revisions,settings}.ts` |

## Cross-package interfaces (fixed signatures)

- Project detail page (B) renders tabs: Overview (B), Payments `<PaymentsTab projectId>` (C),
  Agreement `<AgreementTab projectId>` (D), Revisions `<RevisionsTab projectId>` (E),
  Activity (B). Portal project page (B) renders progress, milestones, then
  `<PortalPaymentsSection projectId>` (C), `<PortalAgreementSection projectId>` (D),
  `<PortalRevisionsSection projectId>` (E), then client-visible activity (B).
  Each of those components is an async server component that loads its own data
  and does its own access check. Keep the exported names and props exactly.
- `inviteClientToPortal(clientId): Promise<ActionResult>` in `src/server/actions/auth.ts` (D) is
  called by B's client detail page.
- Admin navigation (B): Dashboard `/admin`, Prospects `/admin/prospects`, Clients
  `/admin/clients`, Projects `/admin/projects`, Settings `/admin/settings`, plus Sign out.
  Sign out posts `DELETE /api/auth/session` (D) then navigates to `/login`.
- Contract value and payment schedule are edited together in the Payments tab (C)
  so the "schedule sums to contract value" rule can be enforced in one save. B's
  project create form sets the initial contractValue; B's edit form does not change it.
- Project status: B owns manual changes (`MANUAL_PROJECT_STATUSES`). D sets
  `agreement_sent` on send. `markAccepted` sets `active`.
- `sendPaymentRecorded` is called by C after a payment is added (not on edit/delete).
- Data used across packages that another package owns: read it with your own
  small loader in your own data file (e.g. C may query `col.clients()` to show names).
