import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/dates";
import { winAnsiSafe } from "@/lib/pdf/text";

// Server only. Appends a signature page and a final audit trail page to the
// original agreement PDF. The original pages are copied untouched.

export type SignedPdfInput = {
  agreementId: string;
  version: number;
  signerName: string;
  signerEmail: string;
  signedAt: Date;
  ip: string;
  userAgent: string;
  /** SHA-256 (hex) of the original PDF, before these pages were added. */
  originalHash: string;
  signaturePng: Buffer;
  consentText: string;
};

const PAGE: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.4, 0.4, 0.4);

/** Break text into lines that fit maxWidth, splitting very long words by character. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  const flush = () => {
    if (current) lines.push(current);
    current = "";
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    flush();
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const char of word) {
      if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    current = chunk;
  }
  flush();
  return lines.length > 0 ? lines : [""];
}

export function utcStamp(date: Date): string {
  return `${formatInTimeZone(date, "UTC", "yyyy-MM-dd HH:mm:ss")} UTC`;
}

export function manilaStamp(date: Date): string {
  return `${formatInTimeZone(date, TZ, "yyyy-MM-dd HH:mm:ss")} ${TZ} (UTC${formatInTimeZone(date, TZ, "xxx")})`;
}

export async function appendSignaturePages(original: Buffer, input: SignedPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.load(original);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const contentWidth = PAGE[0] - MARGIN * 2;

  // ---- Signature page ----
  const sigPage = pdf.addPage(PAGE);
  let y = PAGE[1] - MARGIN;
  sigPage.drawText("Signature", { x: MARGIN, y: y - 16, size: 18, font: bold, color: INK });
  y -= 48;
  for (const line of wrap(
    winAnsiSafe(`Agreement version ${input.version}. ${input.consentText}`),
    regular,
    10.5,
    contentWidth,
  )) {
    sigPage.drawText(line, { x: MARGIN, y, size: 10.5, font: regular, color: INK });
    y -= 15;
  }
  y -= 24;

  const image = await pdf.embedPng(input.signaturePng);
  const box = { width: 260, height: 110 };
  const scale = Math.min(box.width / image.width, box.height / image.height, 1);
  const drawn = { width: image.width * scale, height: image.height * scale };
  y -= box.height;
  sigPage.drawImage(image, { x: MARGIN, y: y + (box.height - drawn.height), width: drawn.width, height: drawn.height });
  sigPage.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: MARGIN + box.width + 40, y: y - 4 }, thickness: 0.8, color: INK });
  y -= 22;
  sigPage.drawText(winAnsiSafe(input.signerName), { x: MARGIN, y, size: 12, font: bold, color: INK });
  y -= 18;
  sigPage.drawText(winAnsiSafe(input.signerEmail), { x: MARGIN, y, size: 10, font: regular, color: MUTED });
  y -= 18;
  sigPage.drawText(`Signed on ${utcStamp(input.signedAt)}`, { x: MARGIN, y, size: 10, font: regular, color: INK });
  y -= 15;
  sigPage.drawText(`(${manilaStamp(input.signedAt)})`, { x: MARGIN, y, size: 10, font: regular, color: MUTED });

  // ---- Audit trail page ----
  const auditPage = pdf.addPage(PAGE);
  y = PAGE[1] - MARGIN;
  auditPage.drawText("Audit trail", { x: MARGIN, y: y - 16, size: 18, font: bold, color: INK });
  y -= 48;
  const rows: { label: string; value: string; font: PDFFont; size: number }[] = [
    { label: "Agreement ID", value: input.agreementId, font: mono, size: 9.5 },
    { label: "Version", value: String(input.version), font: regular, size: 10 },
    { label: "Signer name", value: input.signerName, font: regular, size: 10 },
    { label: "Signer email", value: input.signerEmail, font: regular, size: 10 },
    { label: "Signed at (UTC)", value: utcStamp(input.signedAt), font: regular, size: 10 },
    { label: "Signed at (Manila)", value: manilaStamp(input.signedAt), font: regular, size: 10 },
    { label: "IP address", value: input.ip || "unknown", font: mono, size: 9.5 },
    { label: "User agent", value: input.userAgent || "unknown", font: regular, size: 9 },
    { label: "Consent", value: input.consentText, font: regular, size: 10 },
    { label: "Original document SHA-256", value: input.originalHash, font: mono, size: 9 },
  ];
  for (const row of rows) {
    auditPage.drawText(row.label, { x: MARGIN, y, size: 8.5, font: bold, color: MUTED });
    y -= 13;
    for (const line of wrap(winAnsiSafe(row.value), row.font, row.size, contentWidth)) {
      auditPage.drawText(line, { x: MARGIN, y, size: row.size, font: row.font, color: INK });
      y -= row.size + 4;
    }
    y -= 8;
  }
  y -= 8;
  for (const line of wrap(
    "The SHA-256 value identifies the exact agreement document the signer was shown. It was checked against the stored document before this page was added.",
    regular,
    9,
    contentWidth,
  )) {
    auditPage.drawText(line, { x: MARGIN, y, size: 9, font: regular, color: MUTED });
    y -= 13;
  }

  return Buffer.from(await pdf.save());
}
