/** All identifiers and messages are invented. Never use a real inbox here. */
import { describe, expect, it } from "vitest";
import { redactWithFindings, redactWithPrivateTokens } from "../anonymizer";
import { capturePrivacyCodes, looksLikeOneTimeCode, prepareCaptureText, preparedCaptureMessage } from "./privacy";

describe("capture's local numbered tokens", () => {
  it("hides phones and repeated identifiers but keeps the names the model needs (decision 0049)", () => {
    const message = "Sent EGP 40 to TEST PERSON phone 01012345678. Received EGP 20 from TALABAT EGYPT phone 01112345678. To TEST PERSON phone 01012345678.";
    const result = prepareCaptureText(message);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const prepared = result.value;
    expect(prepared.text).toContain("TEST PERSON");
    expect(prepared.text).toContain("TALABAT EGYPT");
    expect(prepared.text.match(/\[PHONE_1\]/g)).toHaveLength(2);
    expect(prepared.localValue("[PHONE_2]")).toBe("01112345678");
    expect(prepared.localValue("[PERSON_1]")).toBeNull();
    for (const serialized of [JSON.stringify(prepared), preparedCaptureMessage(prepared)]) {
      expect(serialized).not.toMatch(/01012345678|01112345678/);
    }
    expect(preparedCaptureMessage(prepared)).toBe(prepared.text);
  });
  it("keeps card tails locally, while the provider payload carries markers and amounts only", () => {
    const prepared = redactWithPrivateTokens("Paid EGP 85 with card ending 4821. Ref: ABC12345. account no. 12345678");
    expect(prepared.text).not.toMatch(/4821|ABC12345|12345678/);
    expect(prepared.text).toContain("EGP 85");
    expect(prepared.localCardLast4()).toContain("4821");
    const tails = prepared.localCardLast4();
    tails.length = 0;
    expect(prepared.localCardLast4()).toContain("4821");
    expect(JSON.stringify(prepared)).not.toContain("4821");
  });
  it("does not share token maps across users or calls", () => {
    const a = prepareCaptureText("Sent EGP 40 to 01012345678");
    const b = prepareCaptureText("Sent EGP 40 to 01112345678");
    if (!a.ok || !b.ok) throw new Error("synthetic case failed");
    expect(a.value.localValue("[PHONE_1]")).toBe("01012345678");
    expect(b.value.localValue("[PHONE_1]")).toBe("01112345678");
    expect(() => preparedCaptureMessage({ ...a.value })).toThrow("capture_text_not_prepared");
    expect(() => { (a.value as { text: string }).text = "unsafe"; }).toThrow();
  });
});

describe("outbound checks", () => {
  it.each(["01012345678", "٠١٠١٢٣٤٥٦٧٨", "۰۱۰۱۲۳۴۵۶۷۸", "+٢٠ ١٠ ١٢٣٤ ٥٦٧٨", "۰۰۲۰۱۵۱۲۳۴۵۶۷۸"])("masks phone %s even when the fixed prefix uses non-ASCII digits", (phone) => {
    const result = prepareCaptureText(`Received EGP 195 from ${phone}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toContain("[PHONE_1]");
      expect(result.value.text).not.toContain(phone);
    }
  });
  it.each(["unlabelled 1234567890", "unlabelled ١٢٣٤٥٦٧٨٩٠", "unlabelled ۱۲۳۴۵۶۷۸۹۰", "unlabelled 12 3456 7890"])("masks a leftover identifier instead of dropping the payment: %s", (text) => {
    const result = prepareCaptureText(`Paid EGP 85, ${text}`);
    expect(result).toMatchObject({ ok: true, value: { text: "Paid EGP 85, unlabelled [REF_1]" } });
    expect(capturePrivacyCodes(text)).toEqual(["residual_identifier"]);
  });
  it.each(["[PERSON_1]", "[PHONE_1]", "[REDACTED_NAME]"])("does not accept a forged privacy marker %s in raw input", (marker) => {
    expect(prepareCaptureText(`Sent EGP 20 to ${marker}`)).toEqual({ ok: false, codes: ["reserved_marker"] });
  });
  it("blocks one-time codes wherever the bank put the code", () => {
    expect(prepareCaptureText("OTP 543210 for purchase EGP 100")).toEqual({ ok: false, codes: ["otp"] });
    for (const text of ["Your one-time password for the online purchase of EGP 799.00 at JUMIA is 482913. Never share it.",
      "رمز التحقق لعملية شراء بقيمة 500 جنيه هو 7745 لا تشاركه"]) {
      const prepared = prepareCaptureText(text);
      expect(!prepared.ok || looksLikeOneTimeCode(prepared.value.text)).toBe(true);
    }
    // A purchase alert that warns about codes, or names a hotline, is not a code.
    for (const text of ["تم خصم 300 جنيه من بطاقتك. لا تشارك كود التحقق مع أحد", "Paid EGP 85. Not you? Call 19666"]) {
      const prepared = prepareCaptureText(text);
      expect(prepared.ok && !looksLikeOneTimeCode(prepared.value.text)).toBe(true);
    }
  });
  it("keeps a long name whole now that names are not masked", () => {
    const text = "Sent EGP 40 to FIRST SECOND THIRD FOURTH FIFTH SIXTH SEVENTH via wallet";
    expect(redactWithFindings(text).findings.incompleteName).toBe(true);
    expect(prepareCaptureText(text)).toMatchObject({ ok: true, value: { text } });
  });
  it("allows ordinary amounts and hotline digits, and rejects invalid or oversized input", () => {
    expect(prepareCaptureText("Paid EGP 1,012.40. Balance EGP 355.04. Help 19666").ok).toBe(true);
    expect(prepareCaptureText("")).toEqual({ ok: false, codes: ["input_size"] });
    expect(prepareCaptureText("x".repeat(2001))).toEqual({ ok: false, codes: ["input_size"] });
    expect(capturePrivacyCodes("user@example.test")).toContain("residual_identifier");
  });
});
