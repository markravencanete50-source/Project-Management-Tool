# Project Tracker

Private dashboard for tracking prospects, client projects, agreements, revisions and payments received, with a client portal. Built for one admin (Mark). The app does not process payments: you record what a client paid and it calculates paid, pending and overdue amounts.

- Next.js 16 (App Router, TypeScript strict) on Vercel, region `sin1`
- Firebase Auth + Firestore (Spark plan, `asia-southeast1`), accessed only from the server with firebase-admin
- Cloudinary for files (authenticated delivery, 5 minute download links)
- Resend for email
- All dates and month buckets use Asia/Manila

See `docs/SPEC.md` for the product spec and `docs/CONTRACT.md` for code conventions.

## Local development

```bash
corepack enable          # or: npm i -g pnpm
pnpm install
cp .env.example .env.local   # then fill it in (see below)
pnpm dev
```

Checks:

```bash
pnpm typecheck
pnpm lint
pnpm test            # unit tests
pnpm test:emulator   # data-access tests against the Firestore and Auth emulators (needs Java 21)
pnpm build
```

## Setup

### 1. Firebase

1. Create a Firebase project (Spark plan is fine).
2. **Firestore:** create the database in **asia-southeast1 (Singapore)**. The location cannot be changed later.
3. **Authentication:** enable the **Google** provider. Under Settings > Authorized domains, add your production domain (and `localhost` for development).
4. **Web app:** Project settings > General > Add app (Web). Copy `apiKey`, `authDomain`, `projectId`, `appId` into the `NEXT_PUBLIC_FIREBASE_*` variables.
5. **Service account:** Project settings > Service accounts > Generate new private key. Copy `project_id`, `client_email` and `private_key` into the `FIREBASE_ADMIN_*` variables. Keep the `\n` sequences in the key and wrap it in double quotes.
6. **Rules and indexes:** install the Firebase CLI (`npm i -g firebase-tools`), run `firebase login`, then:
   ```bash
   firebase use <project-id>
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   The rules deny all browser access. The app reads and writes through the server.

### 2. Cloudinary

1. Create a Cloudinary account and copy the cloud name, API key and API secret into `CLOUDINARY_*`.
2. All files are uploaded as type `authenticated` under the `pmt/` folder and served only through `/api/files/...`, which checks access and redirects to a 5 minute download link. Nothing is public.
3. Agreement PDFs are stored as `raw` files, so the "Allow delivery of PDF and ZIP files" security setting is not needed. Receipts and signatures are images.
4. Backups are written daily to `pmt/backups/` (the latest 30 are kept).

### 3. Resend

1. Add and verify your sending domain in Resend (add the DNS records it shows).
2. Create an API key and set `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to an address on the verified domain, e.g. `"Mark Raven <projects@yourdomain.com>"`, and `ADMIN_EMAIL` to where you want digests and signed agreements.
4. Without `RESEND_API_KEY` the app still runs and logs emails to the console instead of sending them.

### 4. Environment variables

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | Firebase web app config |
| `FIREBASE_ADMIN_PROJECT_ID`, `_CLIENT_EMAIL`, `_PRIVATE_KEY` | Firebase service account key |
| `CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET` | Cloudinary dashboard |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` | Resend |
| `APP_URL` | Full site URL, e.g. `https://tracker.yourdomain.com` (used in emails and Origin checks) |
| `CRON_SECRET` | Any random string of 16+ characters |

### 5. Vercel

1. Import the GitHub repo into Vercel. Framework preset: Next.js. Install command is detected from `pnpm-lock.yaml`.
2. Add every variable above under Project > Settings > Environment Variables (Production, and Preview if you use it). Paste `FIREBASE_ADMIN_PRIVATE_KEY` exactly as in the JSON key file.
3. `vercel.json` sets the function region to `sin1` and the daily cron (`0 0 * * *`, 08:00 Manila). Vercel sends `CRON_SECRET` automatically as a Bearer token.
4. Add your domain, then add it to Firebase Authorized domains and set `APP_URL` to it.
5. Plan note: Vercel's Hobby plan is for non-commercial use. A tool you run your business on is better on Pro.

### 6. Make yourself admin

1. Deploy (or run locally) and click "Sign in with Google" once. You will see "not an admin"; that creates your Auth user.
2. With the `FIREBASE_ADMIN_*` values in `.env.local`, run:
   ```bash
   pnpm set-admin you@gmail.com
   ```
3. Sign in again. You now land on `/admin`.

### 7. First run

1. Open Settings: set business name and email, choose when a project counts as accepted (agreement signed, or deposit paid), review the agreement template.
2. Add a client, then "Invite to portal" to email them a sign-in link.

## Restoring from a backup

Backups are full JSON exports (Settings > Backups, or Cloudinary `pmt/backups/`). There is no one-click restore in v1. To restore, write a short script with firebase-admin that reads the JSON and writes each collection back (projects include their milestones, schedule, payments, agreements and revisions as nested arrays). Test it against the emulator first.

## How things work

- **Auth:** admin signs in with Google and needs the `role: "admin"` custom claim. Clients get a one-time link by email (30 minutes, single use). Both end up with a 14 day httpOnly session cookie; the browser keeps no Firebase session.
- **Money:** stored as integers in minor units (pence, cents, centavos). Currencies are never converted; totals are shown per currency.
- **Payments:** a project has a contract value, an optional schedule of due amounts, and the payments you record. Payments settle schedule lines oldest due date first. A line is overdue when its due date has passed (Manila) and it is not fully covered. Nothing derived is stored.
- **Agreements:** generated as PDF from the template, hashed (SHA-256), sent, signed in the portal with typed name and drawn signature, then a signature page and audit trail page are appended. Signed agreements are immutable.
- **Daily cron:** emails a digest (follow-ups due, overdue payments, revisions waiting on you) if there is anything to report, writes a backup, and cleans up expired sign-in tokens.
