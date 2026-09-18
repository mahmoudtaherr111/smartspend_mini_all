/**
 * The provider keys the admin console stores in `ai_providers.api_key_encrypted`: which secret seals them,
 * which secrets can still open them, and how a stored key moves to a new secret without anyone re-entering it.
 *
 * A key is sealed with AES-256-GCM under SHA-256 of a secret and stored as `<iv>:<tag>:<data>` in hex — the
 * format every earlier version wrote, kept on purpose: a rollback, or an older replica during a deploy, still
 * reads what this version writes. What changed is which secrets take part:
 *
 *   - new keys are sealed with `AI_GATEWAY_SECRET`, or with `JWT_SECRET` while that is unset;
 *   - a stored key is opened with `AI_GATEWAY_SECRET`, then `AI_GATEWAY_SECRET_PREVIOUS`, then `JWT_SECRET`.
 *     GCM's tag makes a wrong secret fail rather than return noise, so trying them in turn is safe;
 *   - a key opened with anything but the sealing secret, or stored as plain text, is resealed by the gateway
 *     the next time it loads the providers (`api/lib/ai-gateway.ts`).
 *
 * Rotating `JWT_SECRET` used to turn every stored key into noise, because it was the only secret most
 * installations had and nothing recorded which secret a key was sealed with. Now: set `AI_GATEWAY_SECRET` and
 * deploy, and the keys move to it on their own; the console shows which secret each key is on. Rotating
 * `AI_GATEWAY_SECRET` itself: the old value into `AI_GATEWAY_SECRET_PREVIOUS`, the new one into
 * `AI_GATEWAY_SECRET`, deploy, and remove the old value once the console shows no key on it.
 *
 * A key that no secret opens is reported as unreadable — in the log and on the provider's card — instead of
 * disappearing from the chain without a word.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

export type KeySecret = "AI_GATEWAY_SECRET" | "AI_GATEWAY_SECRET_PREVIOUS" | "JWT_SECRET";

interface RingKey {
  secret: KeySecret;
  key: Buffer;
}

export interface KeyRing {
  /** The secret new keys are sealed with. */
  sealing: RingKey;
  /** Every secret tried when opening a stored key, in order. */
  opening: RingKey[];
}

export interface KeyRingSecrets {
  gatewaySecret?: string;
  previousGatewaySecret?: string;
  jwtSecret: string;
}

export type KeyState =
  /** Opened with the sealing secret. */
  | "sealed"
  /** Opened with an older secret; resealing moves it to the sealing one. */
  | "stale"
  /** Stored without encryption; resealing seals it. */
  | "plaintext"
  /** No secret in the ring opens it: the admin has to enter the key again. */
  | "unreadable"
  /** Nothing stored. */
  | "empty";

export interface OpenedKey {
  key: string;
  state: KeyState;
  /** The secret that opened it, when one did. */
  secret?: KeySecret;
}

function ringKey(secret: KeySecret, value: string): RingKey {
  return { secret, key: createHash("sha256").update(value).digest() };
}

/** An empty variable is an unset one, as it always was here. */
const present = (value: string | undefined): value is string => typeof value === "string" && value.length > 0;

export function buildKeyRing(secrets: KeyRingSecrets): KeyRing {
  const opening: RingKey[] = [];
  if (present(secrets.gatewaySecret)) opening.push(ringKey("AI_GATEWAY_SECRET", secrets.gatewaySecret));
  if (present(secrets.previousGatewaySecret)) {
    opening.push(ringKey("AI_GATEWAY_SECRET_PREVIOUS", secrets.previousGatewaySecret));
  }
  opening.push(ringKey("JWT_SECRET", secrets.jwtSecret));
  return { sealing: opening[0], opening };
}

let defaultRing: KeyRing | null = null;

/** The ring from the server's environment. `JWT_SECRET` is required by `api/lib/env.ts`, so it always has one. */
export function keyRing(): KeyRing {
  defaultRing ??= buildKeyRing({
    gatewaySecret: env.AI_GATEWAY_SECRET,
    previousGatewaySecret: env.AI_GATEWAY_SECRET_PREVIOUS,
    jwtSecret: env.JWT_SECRET,
  });
  return defaultRing;
}

export function sealProviderKey(plain: string, ring: KeyRing = keyRing()): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ring.sealing.key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
}

function tryOpen(key: Buffer, iv: string, tag: string, data: string): string | null {
  try {
    // Only a full tag: GCM would otherwise accept a shortened one, which is easier to forge.
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"), { authTagLength: 16 });
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function openProviderKey(stored: string | null | undefined, ring: KeyRing = keyRing()): OpenedKey {
  if (!stored) return { key: "", state: "empty" };
  // Three parts is a sealed key, however damaged: a value that will not open must not be sent to a provider
  // as if it were the key. Anything else was stored before keys were sealed.
  const parts = stored.split(":");
  if (parts.length !== 3) return { key: stored, state: "plaintext" };
  const [iv, tag, data] = parts;
  for (const candidate of ring.opening) {
    const key = tryOpen(candidate.key, iv, tag, data);
    if (key !== null) {
      return { key, state: candidate === ring.sealing ? "sealed" : "stale", secret: candidate.secret };
    }
  }
  return { key: "", state: "unreadable" };
}

/** Whether the gateway should write the key back sealed with the current secret. */
export function needsReseal(opened: OpenedKey): boolean {
  return opened.state === "stale" || opened.state === "plaintext";
}
