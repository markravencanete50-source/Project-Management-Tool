import "server-only";

// Public email API. Every feature sends mail only through these functions.
// The email work package implements them with Resend and branded templates.
// When RESEND_API_KEY is missing they log and return, so the app runs before
// email is configured.

export type DigestData = {
  followUps: { name: string; company: string; nextFollowUp: string; url: string }[];
  overdue: { projectTitle: string; clientName: string; label: string; outstanding: string; dueDate: string; url: string }[];
  revisions: { projectTitle: string; round: number; status: string; url: string }[];
};

export async function sendSignInLink(args: { to: string; name: string; url: string; purpose: "invite" | "login" | "agreement" }): Promise<void> {
  console.info("[email] sign-in link", args.to, args.purpose, args.url);
}

export async function sendAgreementReady(args: { to: string; clientName: string; projectTitle: string; url: string }): Promise<void> {
  console.info("[email] agreement ready", args.to, args.projectTitle);
}

export async function sendAgreementSigned(args: {
  to: string[];
  projectTitle: string;
  signerName: string;
  signedAt: string;
  pdf: Buffer;
  filename: string;
  clientUrl: string;
  adminUrl: string;
}): Promise<void> {
  console.info("[email] agreement signed", args.to, args.projectTitle);
}

export async function sendRevisionUpdate(args: { to: string; projectTitle: string; round: number; status: string; url: string }): Promise<void> {
  console.info("[email] revision update", args.to, args.projectTitle, args.status);
}

export async function sendChangeOrderAwaitingApproval(args: { to: string; projectTitle: string; round: number; price: string; url: string }): Promise<void> {
  console.info("[email] change order", args.to, args.projectTitle, args.price);
}

export async function sendPaymentRecorded(args: {
  to: string;
  clientName: string;
  projectTitle: string;
  amount: string;
  paidOn: string;
  pending: string;
  url: string;
}): Promise<void> {
  console.info("[email] payment recorded", args.to, args.projectTitle, args.amount);
}

export async function sendAdminDigest(data: DigestData): Promise<void> {
  console.info("[email] digest", data.followUps.length, data.overdue.length, data.revisions.length);
}
