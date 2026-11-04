/** Capture's outbound boundary. Local token values are never request fields. */
import { CAPTURE_TEXT_MAX } from "../../../contracts/capture-intake";
import { asciiDigits, redactWithPrivateTokens, type NumberedRedactedText } from "../anonymizer";
import { z } from "zod";

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

const privateSnapshotSchema = z.strictObject({
  text: z.string().min(1).max(CAPTURE_TEXT_MAX),
  tokens: z.array(z.strictObject({
    marker: z.string().regex(/^\[(?:PERSON|PHONE|CARD|ACCOUNT|REF|IBAN|EMAIL|OTP)_[1-9]\d{0,3}\]$/),
    kind: z.enum(["PERSON", "PHONE", "CARD", "ACCOUNT", "REF", "IBAN", "EMAIL", "OTP"]),
    value: z.string().min(1).max(CAPTURE_TEXT_MAX),
  })).max(500),
  cardLast4: z.array(z.string().regex(/^\d{4}$/)).max(500),
});

/** Only the authenticated vault may persist this private snapshot, encrypted and scoped to its signal. */
export function capturePrivateSnapshot(value: PreparedCaptureText): unknown {
  if (!issued.has(value)) throw new Error("capture_text_not_prepared");
  return { text: value.text, tokens: value.markers.map(({ marker, kind }) => ({ marker, kind, value: value.localValue(marker)! })), cardLast4: value.localCardLast4() };
}

/** Re-run structural and residual checks after authenticated decryption, never on arbitrary API input. */
export function restoreCaptureSnapshot(raw: unknown): PreparedCaptureText | null {
  const parsed = privateSnapshotSchema.safeParse(raw);
  if (!parsed.success || capturePrivacyCodes(parsed.data.text).length) return null;
  const row = parsed.data;
  const values = new Map<string, string>();
  for (const token of row.tokens) {
    if (values.has(token.marker) || !token.marker.startsWith(`[${token.kind}_`) || !row.text.includes(token.marker)) return null;
    values.set(token.marker, token.value);
  }
  for (const marker of row.text.match(/\[(?:PERSON|PHONE|CARD|ACCOUNT|REF|IBAN|EMAIL|OTP)_\d+\]/gu) ?? []) {
    if (!values.has(marker)) return null;
  }
  if (/\[REDACTED_[A-Z]+\]/u.test(row.text)) return null;
  const value = Object.freeze({
    text: row.text,
    markers: Object.freeze(row.tokens.map(({ marker, kind }) => Object.freeze({ marker, kind }))),
    incompleteName: false,
    localValue: (marker: string) => values.get(marker) ?? null,
    localCardLast4: () => [...row.cardLast4],
    toJSON: () => ({ text: row.text }),
  });
  issued.add(value);
  return value;
}
