/**
 * A provider key survives a change of secret. It opens with any secret the ring still holds, it is marked for
 * resealing when that secret is not the current one, and when nothing opens it the answer says so — instead of
 * an empty string the gateway used to drop without a word.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildKeyRing, needsReseal, openProviderKey, sealProviderKey } from "./provider-key-crypto";

const sha256 = (secret: string) => createHash("sha256").update(secret).digest();

/** A key sealed the way every earlier version did: AES-256-GCM under sha256(secret), `iv:tag:data` in hex. */
function sealedByEarlierVersion(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sha256(secret), iv);
  let data = cipher.update(plain, "utf8", "hex");
  data += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data}`;
}

/** How the earlier version opened a key, to prove a rollback still reads what this one writes. */
function openedByEarlierVersion(stored: string, secret: string): string {
  const [iv, tag, data] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", sha256(secret), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return decipher.update(data, "hex", "utf8") + decipher.final("utf8");
}

describe("sealing provider keys", () => {
  it("opens what it seals, with the secret that sealed it", () => {
    const ring = buildKeyRing({ gatewaySecret: "gateway-secret", jwtSecret: "jwt-secret" });
    const stored = sealProviderKey("sk-live-1234", ring);

    expect(stored).not.toContain("sk-live-1234");
    expect(openProviderKey(stored, ring)).toEqual({ key: "sk-live-1234", state: "sealed", secret: "AI_GATEWAY_SECRET" });
  });

  it("writes the format earlier versions read, so rolling back loses no key", () => {
    const ring = buildKeyRing({ gatewaySecret: "gateway-secret", jwtSecret: "jwt-secret" });
    expect(openedByEarlierVersion(sealProviderKey("sk-live-1234", ring), "gateway-secret")).toBe("sk-live-1234");
  });

  it("seals with JWT_SECRET only while AI_GATEWAY_SECRET is unset, and treats an empty variable as unset", () => {
    expect(buildKeyRing({ jwtSecret: "jwt-secret" }).sealing.secret).toBe("JWT_SECRET");
    expect(buildKeyRing({ gatewaySecret: "", jwtSecret: "jwt-secret" }).sealing.secret).toBe("JWT_SECRET");
    expect(buildKeyRing({ gatewaySecret: "gateway-secret", jwtSecret: "jwt-secret" }).sealing.secret).toBe(
      "AI_GATEWAY_SECRET",
    );
  });
});

describe("a change of secret", () => {
  it("still opens a key sealed with JWT_SECRET once AI_GATEWAY_SECRET is set, and asks for it to be moved", () => {
    const stored = sealedByEarlierVersion("sk-live-1234", "jwt-secret");
    const opened = openProviderKey(stored, buildKeyRing({ gatewaySecret: "gateway-secret", jwtSecret: "jwt-secret" }));

    expect(opened).toEqual({ key: "sk-live-1234", state: "stale", secret: "JWT_SECRET" });
    expect(needsReseal(opened)).toBe(true);
  });

  it("rotates AI_GATEWAY_SECRET through AI_GATEWAY_SECRET_PREVIOUS without anyone entering a key again", () => {
    const before = buildKeyRing({ gatewaySecret: "old-gateway", jwtSecret: "jwt-secret" });
    const stored = sealProviderKey("sk-live-1234", before);

    const during = buildKeyRing({ gatewaySecret: "new-gateway", previousGatewaySecret: "old-gateway", jwtSecret: "jwt-secret" });
    const opened = openProviderKey(stored, during);
    expect(opened).toMatchObject({ key: "sk-live-1234", state: "stale", secret: "AI_GATEWAY_SECRET_PREVIOUS" });

    const resealed = sealProviderKey(opened.key, during);
    const after = buildKeyRing({ gatewaySecret: "new-gateway", jwtSecret: "rotated-jwt" });
    expect(openProviderKey(resealed, after)).toEqual({ key: "sk-live-1234", state: "sealed", secret: "AI_GATEWAY_SECRET" });
  });

  it("says a key is unreadable when no secret opens it, which is what rotating JWT_SECRET too early does", () => {
    const stored = sealedByEarlierVersion("sk-live-1234", "jwt-secret");
    const opened = openProviderKey(stored, buildKeyRing({ jwtSecret: "rotated-jwt" }));

    expect(opened).toEqual({ key: "", state: "unreadable" });
    expect(needsReseal(opened)).toBe(false);
  });

  it("refuses a key whose ciphertext was altered", () => {
    const ring = buildKeyRing({ gatewaySecret: "gateway-secret", jwtSecret: "jwt-secret" });
    const [iv, tag, data] = sealProviderKey("sk-live-1234", ring).split(":");
    const altered = `${iv}:${tag}:${data.slice(0, -2)}${data.endsWith("00") ? "01" : "00"}`;

    expect(openProviderKey(altered, ring).state).toBe("unreadable");
  });
});

describe("what is stored", () => {
  it("reads a key stored as plain text and asks for it to be sealed", () => {
    const opened = openProviderKey("sk-plain-5678", buildKeyRing({ jwtSecret: "jwt-secret" }));
    expect(opened).toEqual({ key: "sk-plain-5678", state: "plaintext" });
    expect(needsReseal(opened)).toBe(true);
  });

  it("has nothing to open when nothing is stored", () => {
    expect(openProviderKey("", buildKeyRing({ jwtSecret: "jwt-secret" }))).toEqual({ key: "", state: "empty" });
    expect(sealProviderKey("", buildKeyRing({ jwtSecret: "jwt-secret" }))).toBe("");
  });
});
