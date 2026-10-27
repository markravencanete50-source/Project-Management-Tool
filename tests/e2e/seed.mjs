// Seeds the Firestore and Auth emulators with a small but varied data set.
// Requires FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST to be set.
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const PROJECT_ID = "demo-pmt";

export const INTERNAL_NOTE = "INTERNAL-ONLY-NOTE slow payer, chase politely";
export const CLIENT_NOTE = "Deposit payment of 400.00 recorded";

export function manilaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ts = (iso) => Timestamp.fromDate(new Date(`${iso}T04:00:00Z`));

export const IDS = {
  clientA: "client-a",
  clientB: "client-b",
  adminUid: "admin-uid",
  authA: "auth-client-a",
  authB: "auth-client-b",
  projA1: "proj-a-active",
  projA2: "proj-a-draft",
  projB1: "proj-b-active",
  projB2: "proj-b-php",
};

export async function seed() {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  const auth = getAuth();
  db.settings({ ignoreUndefinedProperties: true });

  const today = manilaToday();
  const now = Timestamp.now();
  const base = { createdAt: now, updatedAt: now };

  await db.collection("settings").doc("app").set({
    acceptedRule: "signed",
    defaultRevisionAllowance: 2,
    businessName: "E2E Studio",
    businessEmail: "studio@example.com",
  });

  // Auth users and claims
  const users = [
    { uid: IDS.adminUid, email: "admin@example.com", claims: { role: "admin" } },
    { uid: IDS.authA, email: "alice@acme.test", claims: { role: "client", clientId: IDS.clientA } },
    { uid: IDS.authB, email: "bob@beta.test", claims: { role: "client", clientId: IDS.clientB } },
  ];
  for (const u of users) {
    await auth.createUser({ uid: u.uid, email: u.email, emailVerified: true });
    await auth.setCustomUserClaims(u.uid, u.claims);
  }

  const clients = [
    { id: IDS.clientA, name: "Alice Anders", company: "Acme Ltd", email: "alice@acme.test", defaultCurrency: "GBP", authUid: IDS.authA },
    { id: IDS.clientB, name: "Bob Brown", company: "Beta Corp", email: "bob@beta.test", defaultCurrency: "USD", authUid: IDS.authB },
  ];
  for (const c of clients) {
    const { id, ...rest } = c;
    await db.collection("clients").doc(id).set({ ...rest, notes: "", archivedAt: null, ...base });
  }

  const prospects = [
    { id: "pr-new", name: "Nina New", company: "Newco", stage: "new", source: "referral", estimatedValue: 150000, currency: "GBP", nextFollowUp: addDays(today, 5) },
    { id: "pr-due", name: "Carl Contacted", company: "Followup Inc", stage: "contacted", source: "linkedin", estimatedValue: 300000, currency: "USD", nextFollowUp: addDays(today, -3) },
    { id: "pr-prop", name: "Pia Proposal", company: "Proposal Co", stage: "proposal_sent", source: "upwork", estimatedValue: 8000000, currency: "PHP", nextFollowUp: addDays(today, 2) },
    { id: "pr-neg", name: "Nate Negotiating", company: "Deal Works", stage: "negotiating", source: "website", estimatedValue: 500000, currency: "USD", nextFollowUp: null },
    { id: "pr-won", name: "Will Won", company: "Winners", stage: "won", source: "cold_outreach", estimatedValue: 200000, currency: "GBP", nextFollowUp: null, closedAt: now },
    { id: "pr-lost", name: "Lena Lost", company: "Lostco", stage: "lost", source: "other", estimatedValue: 100000, currency: "GBP", nextFollowUp: null, lostReason: "price", closedAt: now },
  ];
  for (const p of prospects) {
    const { id, ...rest } = p;
    await db
      .collection("prospects")
      .doc(id)
      .set({
        email: `${id}@prospect.test`,
        service: "Website",
        notes: "",
        lostReason: null,
        closedAt: null,
        convertedClientId: null,
        convertedProjectId: null,
        archivedAt: null,
        ...rest,
        ...base,
      });
  }

  const projects = [
    {
      id: IDS.projA1, clientId: IDS.clientA, title: "Acme Website Rebuild", status: "active", currency: "GBP", contractValue: 100000,
      revisionAllowance: 1, acceptedAt: ts(addDays(today, -50)), startDate: addDays(today, -50), deadline: addDays(today, 40),
    },
    {
      id: IDS.projA2, clientId: IDS.clientA, title: "Acme Draft Brochure", status: "draft", currency: "GBP", contractValue: 50000,
      revisionAllowance: 2, acceptedAt: null, startDate: null, deadline: null,
    },
    {
      id: IDS.projB1, clientId: IDS.clientB, title: "Beta Portal Build", status: "active", currency: "USD", contractValue: 200000,
      revisionAllowance: 2, acceptedAt: ts(addDays(today, -60)), startDate: addDays(today, -60), deadline: addDays(today, 60),
    },
    {
      id: IDS.projB2, clientId: IDS.clientB, title: "Beta Peso Campaign", status: "active", currency: "PHP", contractValue: 5000000,
      revisionAllowance: 2, acceptedAt: ts(addDays(today, -80)), startDate: addDays(today, -80), deadline: addDays(today, 20),
    },
  ];
  for (const p of projects) {
    const { id, ...rest } = p;
    await db.collection("projects").doc(id).set({ description: `Scope for ${p.title}`, archivedAt: null, ...rest, ...base });
  }

  const sub = (pid, name, id, data) => db.collection("projects").doc(pid).collection(name).doc(id).set(data);

  // A1: three milestones, schedule with an overdue line, payments across months
  await sub(IDS.projA1, "milestones", "m1", { title: "Design approved", weight: 30, order: 0, done: true, doneAt: now });
  await sub(IDS.projA1, "milestones", "m2", { title: "Build complete", weight: 50, order: 1, done: false, doneAt: null });
  await sub(IDS.projA1, "milestones", "m3", { title: "Launch", weight: 20, order: 2, done: false, doneAt: null });
  await sub(IDS.projA1, "schedule", "s1", { label: "Deposit", kind: "deposit", amountDue: 40000, dueDate: addDays(today, -45), order: 0 });
  await sub(IDS.projA1, "schedule", "s2", { label: "Build milestone", kind: "milestone", amountDue: 30000, dueDate: addDays(today, -10), order: 1 });
  await sub(IDS.projA1, "schedule", "s3", { label: "Final payment", kind: "final", amountDue: 30000, dueDate: addDays(today, 30), order: 2 });
  await sub(IDS.projA1, "payments", "pay1", { amount: 40000, paidOn: addDays(today, -44), method: "bank", receiptPublicId: null, note: "Deposit", ...base });
  await sub(IDS.projA1, "payments", "pay2", { amount: 12000, paidOn: today, method: "paypal", receiptPublicId: null, note: "Part payment", ...base });
  await sub(IDS.projA1, "revisions", "r1", {
    round: 1, notes: "Change the header colours", attachmentPublicIds: [], status: "approved", billable: false, price: null,
    changeOrderDecidedAt: null, requestedAt: now, updatedAt: now,
  });
  await sub(IDS.projA1, "revisions", "r2", {
    round: 2, notes: "Add a new pricing page", attachmentPublicIds: [], status: "awaiting_quote", billable: true, price: null,
    changeOrderDecidedAt: null, requestedAt: now, updatedAt: now,
  });
  await sub(IDS.projA1, "agreements", "ag1", {
    version: 1, status: "signed",
    snapshot: {
      scope: "Scope for Acme Website Rebuild", price: 100000, currency: "GBP",
      schedule: [{ label: "Deposit", kind: "deposit", amountDue: 40000, dueDate: addDays(today, -45) }],
      revisionAllowance: 1, timeline: { startDate: addDays(today, -50), deadline: addDays(today, 40) },
    },
    pdfPublicId: `raw:pmt/projects/${IDS.projA1}/agreements/v1.pdf`, pdfHash: "a".repeat(64),
    signedPdfPublicId: `raw:pmt/projects/${IDS.projA1}/signed/v1.pdf`, signedPdfHash: "b".repeat(64), signaturePublicId: null,
    sentAt: now, viewedAt: now, signedAt: now, signerName: "Alice Anders", signerEmail: "alice@acme.test", signerIp: "203.0.113.5",
    userAgent: "e2e", createdAt: now,
  });

  // A2: draft, nothing else
  await sub(IDS.projA2, "milestones", "m1", { title: "Everything", weight: 100, order: 0, done: false, doneAt: null });

  // B1: USD, payments in earlier months and this month
  await sub(IDS.projB1, "milestones", "m1", { title: "Discovery", weight: 40, order: 0, done: true, doneAt: now });
  await sub(IDS.projB1, "milestones", "m2", { title: "Delivery", weight: 60, order: 1, done: false, doneAt: null });
  await sub(IDS.projB1, "schedule", "s1", { label: "Deposit", kind: "deposit", amountDue: 50000, dueDate: addDays(today, -55), order: 0 });
  await sub(IDS.projB1, "schedule", "s2", { label: "Final", kind: "final", amountDue: 150000, dueDate: addDays(today, 40), order: 1 });
  await sub(IDS.projB1, "payments", "pay1", { amount: 50000, paidOn: addDays(today, -40), method: "wise", receiptPublicId: `image:pmt/projects/${IDS.projB1}/receipts/x`, note: "Deposit", ...base });
  await sub(IDS.projB1, "payments", "pay2", { amount: 25000, paidOn: today, method: "bank", receiptPublicId: null, note: "Interim", ...base });

  // B2: PHP, older payment
  await sub(IDS.projB2, "milestones", "m1", { title: "Campaign", weight: 100, order: 0, done: false, doneAt: null });
  await sub(IDS.projB2, "schedule", "s1", { label: "Deposit", kind: "deposit", amountDue: 1500000, dueDate: addDays(today, -75), order: 0 });
  await sub(IDS.projB2, "schedule", "s2", { label: "Final", kind: "final", amountDue: 3500000, dueDate: addDays(today, 15), order: 1 });
  await sub(IDS.projB2, "payments", "pay1", { amount: 1500000, paidOn: addDays(today, -70), method: "gcash", receiptPublicId: null, note: "Deposit", ...base });

  const act = (id, data) => db.collection("activity").doc(id).set({ prospectId: null, clientId: null, projectId: null, createdAt: now, ...data });
  await act("a1", { type: "payment_recorded", message: CLIENT_NOTE, actor: "admin", visibility: "client", projectId: IDS.projA1, clientId: IDS.clientA });
  await act("a2", { type: "note", message: INTERNAL_NOTE, actor: "admin", visibility: "internal", projectId: IDS.projA1, clientId: IDS.clientA });
  await act("a3", { type: "prospect_created", message: "Prospect Nina New added", actor: "admin", visibility: "internal", prospectId: "pr-new" });
  await act("a4", { type: "payment_recorded", message: "Beta payment recorded", actor: "admin", visibility: "client", projectId: IDS.projB1, clientId: IDS.clientB });

  return { today };
}

/** A session cookie for the given uid, obtained through the real /api/auth/session route. */
export async function sessionCookieFor(uid, appBase, authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  const customToken = await getAuth().createCustomToken(uid);
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=any`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!body.idToken) throw new Error(`Custom token exchange failed: ${JSON.stringify(body)}`);
  const session = await fetch(`${appBase}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appBase },
    body: JSON.stringify({ idToken: body.idToken }),
  });
  const text = await session.text();
  if (session.status !== 200) throw new Error(`/api/auth/session ${session.status}: ${text}`);
  const setCookie = session.headers.getSetCookie().find((c) => c.startsWith("__session="));
  if (!setCookie) throw new Error("No __session cookie returned");
  return setCookie.split(";")[0].slice("__session=".length);
}
