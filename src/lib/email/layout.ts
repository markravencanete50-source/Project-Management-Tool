import "server-only";

// Shared branded layout for every email: one simple table based column with
// inline styles (email clients ignore stylesheets), plus a plain text twin.
// No gradients, no emojis, no images. Every interpolated value is escaped.

export type EmailSection = {
  title: string;
  items: { primary: string; secondary?: string; url?: string }[];
};

export type EmailContent = {
  /** Short preview line shown by inbox lists. */
  preheader?: string;
  heading: string;
  paragraphs: string[];
  /** Label and value pairs shown in a small summary table. */
  details?: [label: string, value: string][];
  cta?: { label: string; url: string };
  sections?: EmailSection[];
  /** Small print under the button. */
  note?: string;
};

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http and https links are allowed in href attributes. */
export function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "#";
  } catch {
    return "#";
  }
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

function sectionHtml(section: EmailSection): string {
  const rows = section.items
    .map((item) => {
      const primary = item.url
        ? `<a href="${esc(safeUrl(item.url))}" style="color:${INK};text-decoration:underline;font-weight:600;">${esc(item.primary)}</a>`
        : `<span style="font-weight:600;">${esc(item.primary)}</span>`;
      const secondary = item.secondary
        ? `<div style="color:${MUTED};font-size:14px;line-height:20px;margin-top:2px;">${esc(item.secondary)}</div>`
        : "";
      return `<tr><td style="padding:10px 0;border-top:1px solid ${LINE};font-size:15px;line-height:22px;">${primary}${secondary}</td></tr>`;
    })
    .join("");
  return `<h2 style="margin:24px 0 4px;font-size:16px;line-height:24px;color:${INK};">${esc(section.title)} (${section.items.length})</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
}

export function renderEmail(content: EmailContent, businessName: string): { html: string; text: string } {
  const paragraphs = content.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${INK};">${esc(p)}</p>`)
    .join("");

  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 20px;">${content.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 0;border-top:1px solid ${LINE};font-size:14px;line-height:20px;color:${MUTED};width:40%;vertical-align:top;">${esc(label)}</td><td style="padding:8px 0;border-top:1px solid ${LINE};font-size:15px;line-height:20px;color:${INK};vertical-align:top;">${esc(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const cta = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="background:${INK};border-radius:6px;"><a href="${esc(safeUrl(content.cta.url))}" style="display:inline-block;padding:12px 22px;font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(content.cta.label)}</a></td></tr></table>
<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:${MUTED};">If the button does not work, copy this link into your browser:<br><a href="${esc(safeUrl(content.cta.url))}" style="color:${MUTED};word-break:break-all;">${esc(content.cta.url)}</a></p>`
    : "";

  const sections = (content.sections ?? []).filter((s) => s.items.length > 0).map(sectionHtml).join("");
  const note = content.note ? `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:${MUTED};">${esc(content.note)}</p>` : "";
  const preheader = content.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(content.preheader)}</div>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:8px;">
<tr><td style="padding:20px 24px;border-bottom:1px solid ${LINE};font-size:15px;line-height:20px;font-weight:700;color:${INK};">${esc(businessName)}</td></tr>
<tr><td style="padding:24px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:${INK};">${esc(content.heading)}</h1>
${paragraphs}${details}${cta}${sections}${note}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${LINE};font-size:12px;line-height:18px;color:${MUTED};">Sent by ${esc(businessName)}. Please do not forward links from this email.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const lines: string[] = [content.heading, "", ...content.paragraphs.flatMap((p) => [p, ""])];
  if (content.details?.length) {
    lines.push(...content.details.map(([l, v]) => `${l}: ${v}`), "");
  }
  if (content.cta) lines.push(`${content.cta.label}: ${content.cta.url}`, "");
  for (const section of content.sections ?? []) {
    if (section.items.length === 0) continue;
    lines.push(`${section.title} (${section.items.length})`);
    for (const item of section.items) {
      lines.push(`- ${item.primary}${item.secondary ? `, ${item.secondary}` : ""}${item.url ? ` ${item.url}` : ""}`);
    }
    lines.push("");
  }
  if (content.note) lines.push(content.note, "");
  lines.push(`Sent by ${businessName}.`);

  return { html, text: lines.join("\n") };
}
