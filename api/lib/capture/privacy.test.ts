/** All identifiers and messages are invented. Never use a real inbox here. */
import { describe, expect, it } from "vitest";
import { redactWithFindings, redactWithPrivateTokens } from "../anonymizer";
import { capturePrivacyCodes, prepareCaptureText, preparedCapturePrompt } from "./privacy";

describe("capture's local numbered tokens", () => {
  it("preserves different people and repeated identifiers without exposing the local map", () => {
    const message = "Sent EGP 40 to TEST PERSON phone 01012345678. Received EGP 20 from OTHER PERSON phone 01112345678. To TEST PERSON phone 01012345678.";
    const result = prepareCaptureText(message);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const prepared = result.value;
    expect(prepared.text).toContain("[PERSON_1]");
    expect(prepared.text).toContain("[PERSON_2]");
    expect(prepared.text.match(/\[PHONE_1\]/g)).toHaveLength(2);
    expect(prepared.localValue("[PERSON_1]")).toBe("TEST PERSON");
    expect(prepared.localValue("[PERSON_2]")).toBe("OTHER PERSON");
    expect(prepared.localValue("[PHONE_2]")).toBe("01112345678");
    expect(prepared.localValue("[PERSON_99]")).toBeNull();
    for (const serialized of [JSON.stringify(prepared), preparedCapturePrompt(prepared)]) {
      expect(serialized).not.toMatch(/TEST PERSON|OTHER PERSON|01012345678|01112345678/);
    }
    expect(JSON.parse(preparedCapturePrompt(prepared))).toBe(prepared.text);
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
    const a = prepareCaptureText("Sent EGP 40 to TEST PERSON");
    const b = prepareCaptureText("Sent EGP 40 to OTHER PERSON");
    if (!a.ok || !b.ok) throw new Error("synthetic case failed");
    expect(a.value.localValue("[PERSON_1]")).toBe("TEST PERSON");
    expect(b.value.localValue("[PERSON_1]")).toBe("OTHER PERSON");
    expect(() => preparedCapturePrompt({ ...a.value })).toThrow("capture_text_not_prepared");
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
  it.each(["unlabelled 1234567890", "unlabelled ١٢٣٤٥٦٧٨٩٠", "unlabelled ۱۲۳۴۵۶۷۸۹۰", "unlabelled 12 3456 7890"])("blocks residual identifier: %s", (text) => {
    expect(prepareCaptureText(text)).toEqual({ ok: false, codes: ["residual_identifier"] });
  });
  it.each(["[PERSON_1]", "[PHONE_1]", "[REDACTED_NAME]"])("does not accept a forged privacy marker %s in raw input", (marker) => {
    expect(prepareCaptureText(`Sent EGP 20 to ${marker}`)).toEqual({ ok: false, codes: ["reserved_marker"] });
  });
  it("blocks OTPs and bounded-name overflows rather than sending a partially masked name", () => {
    expect(prepareCaptureText("OTP 543210 for purchase EGP 100")).toEqual({ ok: false, codes: ["otp"] });
    const text = "Sent EGP 40 to FIRST SECOND THIRD FOURTH FIFTH SIXTH SEVENTH via wallet";
    expect(redactWithFindings(text).findings.incompleteName).toBe(true);
    expect(prepareCaptureText(text)).toEqual({ ok: false, codes: ["incomplete_name"] });
  });
  it("allows ordinary amounts and hotline digits, and rejects invalid or oversized input", () => {
    expect(prepareCaptureText("Paid EGP 1,012.40. Balance EGP 355.04. Help 19666").ok).toBe(true);
    expect(prepareCaptureText("")).toEqual({ ok: false, codes: ["input_size"] });
    expect(prepareCaptureText("x".repeat(2001))).toEqual({ ok: false, codes: ["input_size"] });
    expect(capturePrivacyCodes("user@example.test")).toContain("residual_identifier");
  });
});
