/** Capture's outbound boundary. Local token values are never request fields. */
import { CAPTURE_TEXT_MAX } from "../../../contracts/capture-intake";
import { asciiDigits, redactWithPrivateTokens, type NumberedRedactedText } from "../anonymizer";

export type CapturePrivacyCode = "input_size" | "reserved_marker" | "otp" | "incomplete_name" | "residual_identifier";
export type PreparedCaptureText = NumberedRedactedText;
export type CapturePrivacyResult = { ok: true; value: PreparedCaptureText } | { ok: false; codes: CapturePrivacyCode[] };
const issued = new WeakSet<object>();
const RESERVED = /\[(?:(?:PERSON|PHONE|CARD|ACCOUNT|REF|IBAN|EMAIL|OTP)_\d+|REDACTED_[A-Z]+)\]/u;

/** Works on legacy or numbered redacted text. It detects known residues, not arbitrary names in every language. */
export function capturePrivacyCodes(text: string, incompleteName = false): CapturePrivacyCode[] {
  const codes: CapturePrivacyCode[] = [];
  if (!text || text.length > CAPTURE_TEXT_MAX) codes.push("input_size");
  if (incompleteName) codes.push("incomplete_name");
  if (/\[(?:OTP_\d+|REDACTED_OTP)\]/u.test(text)) codes.push("otp");
  const visible = asciiDigits(text).replace(/\[(?:[A-Z]+_\d+|REDACTED_[A-Z]+)\]/gu, "");
  if (/(?:\d[\s-]*){10,}/u.test(visible) || /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(visible)
    || /\b[A-Z]{2}\d{2}(?:[A-Z0-9] ?){11,}\b/u.test(visible)) codes.push("residual_identifier");
  return codes;
}

/** Call once on raw input. A stored redacted message must be revalidated separately, not treated as raw input. */
export function prepareCaptureText(text: string): CapturePrivacyResult {
  if (typeof text !== "string" || !text || text.length > CAPTURE_TEXT_MAX) return { ok: false, codes: ["input_size"] };
  if (RESERVED.test(text)) return { ok: false, codes: ["reserved_marker"] };
  const value = redactWithPrivateTokens(text);
  const codes = capturePrivacyCodes(value.text, value.incompleteName);
  if (codes.length) return { ok: false, codes };
  issued.add(value);
  return { ok: true, value };
}

/** Reject a forged object; only locally prepared, immutable text can build this provider payload. */
export function preparedCapturePrompt(value: PreparedCaptureText): string {
  if (!value || !issued.has(value)) throw new Error("capture_text_not_prepared");
  return JSON.stringify(value.text);
}
