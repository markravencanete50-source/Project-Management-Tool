import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { DEFAULT_SETTINGS, getSettings } from "@/server/data/settings";
import { renderEmail, type EmailContent } from "@/lib/email/layout";

let client: Resend | undefined;

async function brand(): Promise<{ name: string; replyTo?: string }> {
  try {
    const s = await getSettings();
    return { name: s.businessName || DEFAULT_SETTINGS.businessName, replyTo: s.businessEmail || undefined };
  } catch {
    return { name: DEFAULT_SETTINGS.businessName };
  }
}

/**
 * Render and send one email. With no RESEND_API_KEY it logs and returns, so
 * the app runs before email is configured. Throws when Resend rejects the
 * message; callers decide whether that is fatal.
 */
export async function sendMail(args: {
  to: string | string[];
  subject: string;
  content: EmailContent;
  attachments?: { filename: string; content: Buffer }[];
  /** Extra text for the dev log only (for example the sign-in link). */
  devLog?: string;
}): Promise<void> {
  const key = env().RESEND_API_KEY;
  if (!key) {
    console.info("[email] RESEND_API_KEY not set, not sending:", args.subject, "to", args.to, args.devLog ?? "");
    return;
  }
  const b = await brand();
  const { html, text } = renderEmail(args.content, b.name);
  client ??= new Resend(key);
  const { error } = await client.emails.send({
    from: env().EMAIL_FROM,
    to: args.to,
    subject: args.subject,
    html,
    text,
    replyTo: b.replyTo,
    attachments: args.attachments,
  });
  if (error) throw new Error(`Email failed: ${error.message}`);
}
