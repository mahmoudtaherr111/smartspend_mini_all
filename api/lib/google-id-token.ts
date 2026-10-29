/**
 * Google ID tokens from the mobile app's native sign-in (decision 0022): the app signs in with the Google SDK of
 * the phone and hands the server the ID token it got, because a native app has no `google_session` cookie.
 *
 * A token is accepted only when Google signed it (its published keys), it is unexpired, Google issued it, it was
 * issued to one of the app's OAuth clients, and it carries a verified email. Who the token was issued to is two
 * claims, not one:
 *   - `aud`, the audience: the iOS client id when the iOS SDK signs in on its own, or the server's web client id
 *     (`GOOGLE_CLIENT_ID`) when the app asks for a token for the server. Android's Credential Manager always does
 *     that, and iOS does when the app gives it a server client id.
 *   - `azp`, the authorized party: the client that asked for it, the Android or iOS client id. When it is absent
 *     the audience asked for itself.
 * A token is native when that party is one of `GOOGLE_ANDROID_CLIENT_IDS` or `GOOGLE_IOS_CLIENT_IDS`. A token the
 * website obtained for itself (party = web client) is refused here: the website signs in through the redirect.
 *
 * A token is also bound to one sign-in: the app makes a random value for it, gives Google only its SHA-256 (the
 * token's `nonce` claim), and sends the value itself with the token. A token that leaked without that value signs
 * no one in, and the caller spends each value once (`auth.signInWithGoogle`).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { env } from "./env";

/** Where Google publishes the keys that sign its ID tokens (https://accounts.google.com/.well-known/openid-configuration). */
const GOOGLE_KEYS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
/** Allowed clock difference between Google and this server when reading `exp`, `iat` and `nbf`. */
const CLOCK_TOLERANCE_SECONDS = 60;

export type GoogleIdentity = {
  /** Google's stable id of the account; stored as `users.union_id`, the same value the redirect flow stores. */
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

export type GoogleClientIds = {
  /** The web client: the redirect flow's own, and the audience Android tokens are issued for. */
  web: string;
  android: string[];
  ios: string[];
};

/** Why a token was refused. Safe to log: it names a check, never the token or the person. */
export type GoogleIdTokenRejection =
  | "malformed"
  | "signature"
  | "expired"
  | "issuer"
  | "audience"
  | "client"
  | "claims"
  | "email"
  | "nonce";

export class GoogleIdTokenRejected extends Error {
  constructor(readonly reason: GoogleIdTokenRejection) {
    super(`Google ID token rejected: ${reason}`);
    this.name = "GoogleIdTokenRejected";
  }
}

/** Google's keys could not be fetched, so no token can be checked right now; the token itself may be fine. */
export class GoogleKeysUnavailable extends Error {
  constructor(cause: unknown) {
    super("Google signing keys are unavailable", { cause });
    this.name = "GoogleKeysUnavailable";
  }
}

function idList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function googleClientIdsFromEnv(source: typeof env = env): GoogleClientIds {
  return {
    web: source.GOOGLE_CLIENT_ID,
    android: idList(source.GOOGLE_ANDROID_CLIENT_IDS),
    ios: idList(source.GOOGLE_IOS_CLIENT_IDS),
  };
}

/** Whether any native client is configured; without one every token is refused. */
export function nativeGoogleSignInConfigured(clients: GoogleClientIds): boolean {
  return clients.android.length + clients.ios.length > 0;
}

let googleKeys: JWTVerifyGetKey | undefined;

/** jose caches the key set and fetches it again when a token names a key it has not seen (Google rotates them). */
function defaultGoogleKeys(): JWTVerifyGetKey {
  googleKeys ??= createRemoteJWKSet(GOOGLE_KEYS_URL);
  return googleKeys;
}

function rejectionFor(error: unknown): GoogleIdTokenRejection | null {
  if (error instanceof errors.JWTExpired) return "expired";
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === "iss") return "issuer";
    if (error.claim === "aud") return "audience";
    return "claims";
  }
  if (error instanceof errors.JWSSignatureVerificationFailed || error instanceof errors.JWKSNoMatchingKey) {
    return "signature";
  }
  if (
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported
  ) {
    return "malformed";
  }
  return null;
}

function audiencesOf(payload: JWTPayload): string[] {
  if (Array.isArray(payload.aud)) return payload.aud;
  return payload.aud ? [payload.aud] : [];
}

/** The token's `nonce` claim for the value the app made for one sign-in: its SHA-256, in lowercase hex. */
export function googleNonceHash(nonce: string): string {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Checks a Google ID token and returns who it names. `options.nonce` is the value the app made for this sign-in;
 * the token must carry its hash.
 *
 * Throws {@link GoogleIdTokenRejected} for a token that is not good, and {@link GoogleKeysUnavailable} when Google's
 * keys cannot be fetched.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clients: GoogleClientIds,
  options: { nonce: string; keys?: JWTVerifyGetKey; currentDate?: Date },
): Promise<GoogleIdentity> {
  const natives = [...clients.android, ...clients.ios];
  if (natives.length === 0) throw new GoogleIdTokenRejected("client");

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, options.keys ?? defaultGoogleKeys(), {
      issuer: GOOGLE_ISSUERS,
      audience: [clients.web, ...clients.ios],
      algorithms: ["RS256"],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ["sub", "exp", "iat"],
      currentDate: options.currentDate,
    }));
  } catch (error) {
    const reason = rejectionFor(error);
    if (reason) throw new GoogleIdTokenRejected(reason);
    throw new GoogleKeysUnavailable(error);
  }

  const audiences = audiencesOf(payload);
  const party = typeof payload.azp === "string" ? payload.azp : audiences.length === 1 ? audiences[0] : undefined;
  if (!party || !natives.includes(party)) throw new GoogleIdTokenRejected("client");
  if (!sameText(typeof payload.nonce === "string" ? payload.nonce : "", googleNonceHash(options.nonce))) {
    throw new GoogleIdTokenRejected("nonce");
  }

  const { sub, email, email_verified: emailVerified, name, picture } = payload as JWTPayload & {
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
    picture?: unknown;
  };
  if (typeof sub !== "string" || sub.length === 0 || sub.length > 255) throw new GoogleIdTokenRejected("claims");
  if (typeof email !== "string" || email.length === 0 || emailVerified !== true) {
    throw new GoogleIdTokenRejected("email");
  }

  return {
    sub,
    email,
    name: typeof name === "string" && name.trim() ? name.trim() : undefined,
    picture: typeof picture === "string" && picture ? picture : undefined,
  };
}
