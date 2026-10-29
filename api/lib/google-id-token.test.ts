/**
 * The check behind `auth.signInWithGoogle` (decision 0022): a Google ID token from the phone's Google SDK is
 * accepted only when Google signed it, it has not expired, it was issued to one of the mobile app's own clients, and
 * it carries the hash of the value the app made for this sign-in. Tokens are signed here with a key pair standing in
 * for Google's.
 */
import { exportJWK, generateKeyPair, createLocalJWKSet, SignJWT, type JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  GoogleIdTokenRejected,
  GoogleKeysUnavailable,
  googleClientIdsFromEnv,
  googleNonceHash,
  verifyGoogleIdToken,
  type GoogleClientIds,
} from "./google-id-token";

const WEB = "web-client.apps.googleusercontent.com";
const ANDROID = "android-client.apps.googleusercontent.com";
const IOS = "ios-client.apps.googleusercontent.com";
const clients: GoogleClientIds = { web: WEB, android: [ANDROID], ios: [IOS] };
/** The value the app made for this sign-in; Google puts its hash in the token. */
const NONCE = "q5Jr0dTzYxW1n8Kc3vB6mP2sA9eH4uLg7fZoXi_Rk-M";

let keys: ReturnType<typeof createLocalJWKSet>;
let signingKey: CryptoKey;
let strangerKey: CryptoKey;

beforeAll(async () => {
  const google = await generateKeyPair("RS256");
  const stranger = await generateKeyPair("RS256");
  signingKey = google.privateKey;
  strangerKey = stranger.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(google.publicKey)), kid: "google-1", alg: "RS256" }] });
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

async function idToken(overrides: JWTPayload = {}, options: { key?: CryptoKey; kid?: string } = {}) {
  const claims: JWTPayload = {
    iss: "https://accounts.google.com",
    aud: WEB,
    azp: ANDROID,
    sub: "109876543210",
    email: "mona@example.com",
    email_verified: true,
    name: "Mona",
    picture: "https://lh3.googleusercontent.com/a/photo",
    nonce: googleNonceHash(NONCE),
    iat: nowSeconds() - 10,
    exp: nowSeconds() + 3_600,
    ...overrides,
  };
  for (const [name, value] of Object.entries(claims)) if (value === undefined) delete claims[name];
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: options.kid ?? "google-1", typ: "JWT" })
    .sign(options.key ?? signingKey);
}

const verify = (token: string, ids: GoogleClientIds = clients, nonce = NONCE) =>
  verifyGoogleIdToken(token, ids, { keys, nonce });

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(GoogleIdTokenRejected);
  return (error as GoogleIdTokenRejected).reason;
}

describe("checking a Google ID token", () => {
  it("accepts an Android token: issued for the server's web client, asked for by the Android app", async () => {
    await expect(verify(await idToken())).resolves.toEqual({
      sub: "109876543210",
      email: "mona@example.com",
      name: "Mona",
      picture: "https://lh3.googleusercontent.com/a/photo",
    });
  });

  it("accepts an iOS token, with or without a server client id", async () => {
    await expect(verify(await idToken({ aud: IOS, azp: IOS }))).resolves.toMatchObject({ sub: "109876543210" });
    await expect(verify(await idToken({ aud: IOS, azp: undefined }))).resolves.toMatchObject({ sub: "109876543210" });
    await expect(verify(await idToken({ aud: WEB, azp: IOS }))).resolves.toMatchObject({ sub: "109876543210" });
  });

  it("accepts any of several ids per platform (the store build and the dev build)", async () => {
    const ids = { ...clients, android: ["dev-android.apps.googleusercontent.com", ANDROID] };
    await expect(verify(await idToken(), ids)).resolves.toMatchObject({ sub: "109876543210" });
  });

  it("refuses a token the website obtained for itself", async () => {
    expect(await rejection(verify(await idToken({ azp: WEB })))).toBe("client");
    expect(await rejection(verify(await idToken({ azp: undefined })))).toBe("client");
  });

  it("refuses a token issued to another app", async () => {
    expect(await rejection(verify(await idToken({ aud: "someone-else.apps.googleusercontent.com" })))).toBe(
      "audience",
    );
    expect(await rejection(verify(await idToken({ azp: "someone-else.apps.googleusercontent.com" })))).toBe(
      "client",
    );
  });

  it("refuses every token while no mobile client id is configured", async () => {
    expect(await rejection(verify(await idToken(), { web: WEB, android: [], ios: [] }))).toBe("client");
  });

  it("refuses an expired token", async () => {
    const token = await idToken({ iat: nowSeconds() - 7_200, exp: nowSeconds() - 3_600 });
    expect(await rejection(verify(token))).toBe("expired");
  });

  it("refuses a token Google did not sign", async () => {
    expect(await rejection(verify(await idToken({}, { key: strangerKey })))).toBe("signature");
    expect(await rejection(verify(await idToken({}, { kid: "unknown-key" })))).toBe("signature");
  });

  it("refuses a token from another issuer", async () => {
    expect(await rejection(verify(await idToken({ iss: "https://evil.example" })))).toBe("issuer");
  });

  it("refuses an account whose email Google has not verified", async () => {
    expect(await rejection(verify(await idToken({ email_verified: false })))).toBe("email");
    expect(await rejection(verify(await idToken({ email: undefined })))).toBe("email");
  });

  it("refuses an unsigned or symmetric token and plain garbage", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ sub: "1", aud: WEB, azp: ANDROID })).toString("base64url");
    expect(await rejection(verify(`${header}.${body}.`))).toBe("malformed");
    const symmetric = await new SignJWT({ sub: "1", aud: WEB, azp: ANDROID, iss: "https://accounts.google.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-secret-anyone-could-guess-123456"));
    expect(await rejection(verify(symmetric))).toBe("malformed");
    expect(await rejection(verify("not-a-token"))).toBe("malformed");
  });

  it("tells a key outage apart from a bad token", async () => {
    const offline = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(verifyGoogleIdToken(await idToken(), clients, { keys: offline, nonce: NONCE })).rejects.toBeInstanceOf(
      GoogleKeysUnavailable,
    );
  });

  it("refuses a token without the hash of this sign-in's value", async () => {
    expect(await rejection(verify(await idToken({ nonce: undefined })))).toBe("nonce");
    expect(await rejection(verify(await idToken({ nonce: googleNonceHash("another sign-in's value, 32 chars") })))).toBe(
      "nonce",
    );
    // The hash itself is not the value: a token that leaked carries the hash, never what the app sent.
    expect(await rejection(verify(await idToken(), clients, googleNonceHash(NONCE)))).toBe("nonce");
    expect(await rejection(verify(await idToken({ nonce: NONCE })))).toBe("nonce");
  });
});

describe("the nonce hash", () => {
  it("is SHA-256 in lowercase hex, as the app computes it", () => {
    expect(googleNonceHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("reading the client ids from the environment", () => {
  it("splits comma-separated lists and drops blanks", () => {
    const ids = googleClientIdsFromEnv({
      GOOGLE_CLIENT_ID: WEB,
      GOOGLE_ANDROID_CLIENT_IDS: ` ${ANDROID}, dev-android.apps.googleusercontent.com ,`,
      GOOGLE_IOS_CLIENT_IDS: undefined,
    } as Parameters<typeof googleClientIdsFromEnv>[0]);
    expect(ids).toEqual({ web: WEB, android: [ANDROID, "dev-android.apps.googleusercontent.com"], ios: [] });
  });
});
