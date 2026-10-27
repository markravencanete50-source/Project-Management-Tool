// Text safety for the PDF toolchain. Both @react-pdf/renderer and pdf-lib use the
// built-in Helvetica font here, which only covers the WinAnsi (Windows-1252)
// character set. pdf-lib throws on anything else, so unsupported characters are
// replaced with "?" before drawing. The original text is always kept in Firestore.

const WIN_ANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

function isWinAnsi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WIN_ANSI_EXTRAS.has(char);
}

/** Single-line, WinAnsi-only text. Control characters become spaces. */
export function winAnsiSafe(input: string): string {
  let out = "";
  for (const char of input.replace(/[\u0000-\u001f\u007f]/g, " ")) {
    out += isWinAnsi(char) ? char : "?";
  }
  return out;
}
