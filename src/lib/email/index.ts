import "server-only";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/email/send";

// Public email API. Every feature sends mail only through these functions.
// Branded layout lives in layout.ts, delivery in send.ts. When RESEND_API_KEY
// is missing, sendMail logs and returns, so the app runs before email is
// configured. Never put a Cloudinary URL in an email.

export type DigestData = {
  followUps: { name: string; company: string; nextFollowUp: string; url: string }[];
  overdue: { projectTitle: string; clientName: string; label: string; outstanding: string; dueDate: string; url: string }[];
  revisions: { projectTitle: string; round: number; status: string; url: string }[];
};

const REVISION_STATUS_TEXT: Record<string, { label: string; body: string }> = {
  awaiting_quote: { label: "Awaiting quote", body: "Your extra revision request has been received. A quote will follow shortly." },
  awaiting_approval: { label: "Awaiting your approval", body: "A quote is ready for your approval." },
  requested: { label: "Queued", body: "Your revision is queued and work will start soon." },
  in_progress: { label: "In progress", body: "Work has started on your revision." },
  delivered: { label: "Delivered", body: "Your revision is ready for review. Please open the portal to approve it." },
  approved: { label: "Approved", body: "This revision has been approved. Thank you." },
  cancelled: { label: "Cancelled", body: "This revision request has been cancelled." },
};

function statusText(status: string): { label: string; body: string } {
  return REVISION_STATUS_TEXT[status] ?? { label: status.replace(/_/g, " "), body: `The status of your revision is now: ${status.replace(/_/g, " ")}.` };
}

export async function sendSignInLink(args: { to: string; name: string; url: string; purpose: "invite" | "login" | "agreement" }): Promise<void> {
  const copy = {
    invite: {
      subject: "You have been invited to your client portal",
      heading: "Your client portal is ready",
      body: "You can now follow your project, see payments and send revision requests in your private portal. Use the button below to sign in.",
      cta: "Open the portal",
    },
    login: {
      subject: "Your sign-in link",
      heading: "Sign in to your client portal",
      body: "Use the button below to sign in. No password is needed.",
      cta: "Sign in",
    },
    agreement: {
      subject: "Your agreement is ready to sign",
      heading: "Your agreement is ready to sign",
      body: "Use the button below to sign in and review your agreement.",
      cta: "Review and sign",
    },
  }[args.purpose];

  await sendMail({
    to: args.to,
    subject: copy.subject,
    content: {
      preheader: copy.body,
      heading: copy.heading,
      paragraphs: [`Hi ${args.name},`, copy.body],
      cta: { label: copy.cta, url: args.url },
      note: "This link works once and expires in 30 minutes. If you did not ask for it, you can ignore this email.",
    },
    devLog: args.url,
  });
}

export async function sendAgreementReady(args: { to: string; clientName: string; projectTitle: string; url: string }): Promise<void> {
  await sendMail({
    to: args.to,
    subject: `Agreement ready to sign: ${args.projectTitle}`,
    content: {
      preheader: `Please review and sign the agreement for ${args.projectTitle}.`,
      heading: "Your agreement is ready to sign",
      paragraphs: [
        `Hi ${args.clientName},`,
        `The agreement for ${args.projectTitle} is ready for your review. Open it with the button below, read it through, and sign it electronically when you are happy with it.`,
      ],
      details: [["Project", args.projectTitle]],
      cta: { label: "Review and sign", url: args.url },
      note: "The button signs you in securely. It works once and expires in 30 minutes. You can request a new link from the sign-in page at any time.",
    },
    devLog: args.url,
  });
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
  // Two messages, so each side gets a link that works for their role.
  const base = {
    subject: `Agreement signed: ${args.projectTitle}`,
    attachments: [{ filename: args.filename, content: args.pdf }],
  };
  const details: [string, string][] = [
    ["Project", args.projectTitle],
    ["Signed by", args.signerName],
    ["Signed at", args.signedAt],
  ];
  // Each side gets a link that works for their role: the admin address gets
  // the admin link, everyone else gets the portal link.
  const adminAddress = env().ADMIN_EMAIL.toLowerCase();
  const adminEmails = args.to.filter((a) => a.toLowerCase() === adminAddress);
  const clientEmails = args.to.filter((a) => a.toLowerCase() !== adminAddress);

  if (clientEmails.length > 0) {
    await sendMail({
      ...base,
      to: clientEmails,
      content: {
        preheader: `The agreement for ${args.projectTitle} has been signed.`,
        heading: "Agreement signed",
        paragraphs: ["The agreement has been signed. A copy of the signed document is attached for your records."],
        details,
        cta: { label: "Open your portal", url: args.clientUrl },
      },
    });
  }
  if (adminEmails.length > 0) {
    await sendMail({
      ...base,
      to: adminEmails,
      content: {
        preheader: `The agreement for ${args.projectTitle} has been signed.`,
        heading: "Agreement signed",
        paragraphs: ["The agreement has been signed. A copy of the signed document is attached."],
        details,
        cta: { label: "Open the project", url: args.adminUrl },
      },
    });
  }
}

export async function sendRevisionUpdate(args: { to: string; projectTitle: string; round: number; status: string; url: string }): Promise<void> {
  const text = statusText(args.status);
  await sendMail({
    to: args.to,
    subject: `Revision ${args.round} update: ${args.projectTitle}`,
    content: {
      preheader: text.body,
      heading: `Revision ${args.round}: ${text.label}`,
      paragraphs: [text.body],
      details: [
        ["Project", args.projectTitle],
        ["Revision", String(args.round)],
        ["Status", text.label],
      ],
      cta: { label: "Open the portal", url: args.url },
    },
  });
}

export async function sendChangeOrderAwaitingApproval(args: { to: string; projectTitle: string; round: number; price: string; url: string }): Promise<void> {
  await sendMail({
    to: args.to,
    subject: `Approval needed: extra revision for ${args.projectTitle}`,
    content: {
      preheader: `Revision ${args.round} is outside the included rounds. A quote of ${args.price} needs your approval.`,
      heading: "A quote needs your approval",
      paragraphs: [
        `Revision ${args.round} goes beyond the revision rounds included in your agreement, so it is quoted separately. Work starts once you approve the quote. If you decline, nothing is charged.`,
      ],
      details: [
        ["Project", args.projectTitle],
        ["Revision", String(args.round)],
        ["Quote", args.price],
      ],
      cta: { label: "Review the quote", url: args.url },
    },
  });
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
  await sendMail({
    to: args.to,
    subject: `Payment received: ${args.projectTitle}`,
    content: {
      preheader: `We recorded a payment of ${args.amount}. Thank you.`,
      heading: "Payment received",
      paragraphs: [`Hi ${args.clientName},`, "Thank you. We have recorded your payment."],
      details: [
        ["Project", args.projectTitle],
        ["Amount", args.amount],
        ["Date", args.paidOn],
        ["Balance remaining", args.pending],
      ],
      cta: { label: "View payments", url: args.url },
    },
  });
}

export async function sendAdminDigest(data: DigestData): Promise<void> {
  const total = data.followUps.length + data.overdue.length + data.revisions.length;
  await sendMail({
    to: env().ADMIN_EMAIL,
    subject: `Daily digest: ${total} item${total === 1 ? "" : "s"} need attention`,
    content: {
      preheader: `${data.followUps.length} follow-ups, ${data.overdue.length} overdue payments, ${data.revisions.length} revisions.`,
      heading: "Needs your attention today",
      paragraphs: [
        `${data.followUps.length} follow-up${data.followUps.length === 1 ? "" : "s"} due, ${data.overdue.length} overdue payment${data.overdue.length === 1 ? "" : "s"}, ${data.revisions.length} revision${data.revisions.length === 1 ? "" : "s"} waiting on you.`,
      ],
      sections: [
        {
          title: "Follow-ups due",
          items: data.followUps.map((f) => ({
            primary: f.company ? `${f.name} (${f.company})` : f.name,
            secondary: `Follow up by ${f.nextFollowUp}`,
            url: f.url,
          })),
        },
        {
          title: "Overdue payments",
          items: data.overdue.map((o) => ({
            primary: `${o.projectTitle}: ${o.label}`,
            secondary: `${o.clientName}, ${o.outstanding} outstanding, due ${o.dueDate}`,
            url: o.url,
          })),
        },
        {
          title: "Revisions waiting on you",
          items: data.revisions.map((r) => ({
            primary: `${r.projectTitle}: revision ${r.round}`,
            secondary: statusText(r.status).label,
            url: r.url,
          })),
        },
      ],
    },
  });
}
