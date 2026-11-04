/** Authenticated local identity-map storage. No plaintext fallback and no dependency on a process-local cache. */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { keyRing, type KeyRing } from "../provider-key-crypto";
import { capturePrivateSnapshot, restoreCaptureSnapshot, type PreparedCaptureText } from "./privacy";

const scopeSchema = z.strictObject({
  userId: z.number().int().positive(), userType: z.enum(["oauth", "local"]),
  deviceId: z.number().int().positive(), clientSignalId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});
export type CaptureVaultScope = z.infer<typeof scopeSchema>;
const domainKey = (key: Buffer) => createHmac("sha256", key).update("smartspend:capture-vault:v1").digest();
function binding(scope: CaptureVaultScope, text: string): Buffer {
  const row = scopeSchema.parse(scope);
  return Buffer.from(JSON.stringify(["capture-v1", row.userType, row.userId, row.deviceId, row.clientSignalId, createHash("sha256").update(text).digest("hex")]));
}

export function sealCaptureText(value: PreparedCaptureText, scope: CaptureVaultScope, ring: KeyRing = keyRing()): string {
  const snapshot = capturePrivateSnapshot(value);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", domainKey(ring.sealing.key), nonce);
  cipher.setAAD(binding(scope, value.text));
  const data = Buffer.concat([cipher.update(JSON.stringify(snapshot), "utf8"), cipher.final()]);
  return `cv1:${nonce.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
}

export function openCaptureText(envelope: unknown, text: string, scope: CaptureVaultScope, ring: KeyRing = keyRing()): PreparedCaptureText | null {
  if (typeof envelope !== "string" || envelope.length > 256_000 || !/^cv1:[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2})+$/u.test(envelope)) return null;
  const [, nonce, tag, data] = envelope.split(":");
  for (const candidate of ring.opening) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", domainKey(candidate.key), Buffer.from(nonce, "hex"), { authTagLength: 16 });
      decipher.setAAD(binding(scope, text));
      decipher.setAuthTag(Buffer.from(tag, "hex"));
      const plain = Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]).toString("utf8");
      const restored = restoreCaptureSnapshot(JSON.parse(plain));
      return restored?.text === text ? restored : null;
    } catch { /* Try rotation keys; never reveal the input, scope, or decrypted content. */ }
  }
  return null;
}
