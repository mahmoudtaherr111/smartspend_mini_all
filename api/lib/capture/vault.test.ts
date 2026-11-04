import { describe, expect, it } from "vitest";
import { prepareCaptureText, preparedCapturePrompt, capturePrivateSnapshot, restoreCaptureSnapshot } from "./privacy";
import { sealCaptureText, openCaptureText } from "./vault";
import { buildKeyRing, sealProviderKey } from "../provider-key-crypto";

const ring = buildKeyRing({ gatewaySecret: "synthetic-capture-key", jwtSecret: "synthetic-session-key" });
const scope = { userId: 42, userType: "oauth" as const, deviceId: 7, clientSignalId: "synthetic_signal_1" };
const raw = "Sent EGP 40 to TEST PERSON phone 01012345678";
function prepared() { const result = prepareCaptureText(raw); if (!result.ok) throw new Error("synthetic fixture"); return result.value; }
describe("durable capture identity vault", () => {
  it("restores numbered local values on another worker without plaintext in the stored envelope", () => {
    const text = prepared();
    const sealed = sealCaptureText(text, scope, ring);
    expect(sealed).not.toMatch(/TEST PERSON|01012345678/);
    const restored = openCaptureText(sealed, text.text, scope, ring)!;
    expect(restored.localValue("[PERSON_1]")).toBe("TEST PERSON");
    expect(JSON.parse(preparedCapturePrompt(restored))).toBe(text.text);
    expect(JSON.stringify(restored)).not.toMatch(/TEST PERSON|01012345678/);
    expect(sealCaptureText(text, scope, ring)).not.toBe(sealed);
  });
  it.each([{ userType: "local" as const }, { userId: 43 }, { deviceId: 8 }, { clientSignalId: "synthetic_signal_2" }])("rejects a different owner or signal scope %j", (change) => {
    const text = prepared();
    expect(openCaptureText(sealCaptureText(text, scope, ring), text.text, { ...scope, ...change }, ring)).toBeNull();
  });
  it("rejects edited ciphertext, a changed message and shortened tags", () => {
    const text = prepared(); const sealed = sealCaptureText(text, scope, ring);
    expect(openCaptureText(`${sealed.slice(0, -2)}${sealed.endsWith("00") ? "01" : "00"}`, text.text, scope, ring)).toBeNull();
    expect(openCaptureText(sealed, `${text.text}.`, scope, ring)).toBeNull();
    const parts = sealed.split(":"); parts[2] = parts[2].slice(0, -2);
    expect(openCaptureText(parts.join(":"), text.text, scope, ring)).toBeNull();
  });
  it("supports key rotation but never plaintext or provider-key ciphertext", () => {
    const text = prepared(); const sealed = sealCaptureText(text, scope, ring);
    const rotated = buildKeyRing({ gatewaySecret: "new-synthetic-key", previousGatewaySecret: "synthetic-capture-key", jwtSecret: "synthetic-session-key" });
    expect(openCaptureText(sealed, text.text, scope, rotated)).not.toBeNull();
    expect(openCaptureText(raw, text.text, scope, ring)).toBeNull();
    expect(openCaptureText(sealProviderKey(raw, ring), text.text, scope, ring)).toBeNull();
  });
  it("rejects inconsistent or incomplete snapshots", () => {
    const text = prepared();
    const saved = capturePrivateSnapshot(text) as { tokens: unknown[]; text: string };
    expect(restoreCaptureSnapshot({ ...saved, tokens: [] })).toBeNull();
    expect(restoreCaptureSnapshot({ ...saved, tokens: [...saved.tokens, saved.tokens[0]] })).toBeNull();
    expect(restoreCaptureSnapshot({ ...saved, text: "Unmasked 1234567890" })).toBeNull();
  });
});
