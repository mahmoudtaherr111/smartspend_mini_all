/**
 * Store billing without a database: who may call the webhooks, what a push or a signed transaction is believed to
 * say, and which states grant the plan. Every case here attacks the real verifiers. Keys and an Apple-shaped
 * certificate chain are made locally, so a signature check that stops checking fails these tests.
 */
import { execFileSync } from "node:child_process";
import { createPrivateKey, sign as signBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  GOOGLE_PLAY_PUBSUB_AUDIENCE: "https://api.example.test/api/webhooks/google-play" as string | undefined,
  GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT: "pubsub@example.iam.gserviceaccount.com" as string | undefined,
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: undefined as string | undefined,
  GOOGLE_PLAY_PACKAGE_NAME: "com.smartspend.app",
  APPLE_BUNDLE_ID: "com.smartspend.app",
  APPLE_STORE_BILLING_ENABLED: "true",
  JWT_SECRET: "test-secret-test-secret-test-secret-test",
}));

vi.mock("../api/lib/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/lib/env")>();
  return { ...original, env: new Proxy(original.env, { get: (target, key) => (key in settings ? settings[key as keyof typeof settings] : target[key as keyof typeof target]) }) };
});

import { parseServerEnv } from "../api/lib/env";
import {
  fetchGoogleSubscription,
  grantsAccess,
  parseAndVerifyAppleASN,
  parseGooglePlayPush,
  storeAccountToken,
  verifyAppleStoreKitTransaction,
  verifyGooglePlayWebhookAuth,
} from "../api/lib/store-billing";

const AUDIENCE = settings.GOOGLE_PLAY_PUBSUB_AUDIENCE!;
const SERVICE_ACCOUNT = settings.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT!;
const inTheFuture = new Date("2099-01-01T00:00:00Z");

describe("the Google Play webhook", () => {
  let privateKey: CryptoKey;
  let otherKey: CryptoKey;
  let keys: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256", { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    otherKey = (await generateKeyPair("RS256")).privateKey as CryptoKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "google", alg: "RS256", use: "sig" };
    keys = createLocalJWKSet({ keys: [jwk] });
  });

  const token = (claims: Record<string, unknown>, key: CryptoKey = privateKey, audience = AUDIENCE) =>
    new SignJWT({ email: SERVICE_ACCOUNT, email_verified: true, ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "google" })
      .setIssuer("https://accounts.google.com")
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);

  it("accepts a token Google signed for this endpoint and account", async () => {
    await expect(verifyGooglePlayWebhookAuth(`Bearer ${await token({})}`, { keys })).resolves.toBe(true);
  });

  it("refuses the unsigned token that used to pass", async () => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const forged = `${part({ alg: "none" })}.${part({ iss: "https://accounts.google.com", exp: 9_999_999_999, email: SERVICE_ACCOUNT, aud: AUDIENCE })}.xxx`;
    await expect(verifyGooglePlayWebhookAuth(`Bearer ${forged}`, { keys })).resolves.toBe(false);
  });

  it("refuses a token signed by someone else, for another audience or by another account", async () => {
    await expect(verifyGooglePlayWebhookAuth(`Bearer ${await token({}, otherKey)}`, { keys })).resolves.toBe(false);
    await expect(
      verifyGooglePlayWebhookAuth(`Bearer ${await token({}, privateKey, "https://other.example")}`, { keys }),
    ).resolves.toBe(false);
    await expect(
      verifyGooglePlayWebhookAuth(`Bearer ${await token({ email: "evil@gserviceaccount.com" })}`, { keys }),
    ).resolves.toBe(false);
    await expect(
      verifyGooglePlayWebhookAuth(`Bearer ${await token({ email_verified: false })}`, { keys }),
    ).resolves.toBe(false);
  });

  it("is closed when it is not configured, and without a token", async () => {
    await expect(verifyGooglePlayWebhookAuth(undefined, { keys })).resolves.toBe(false);
    const saved = settings.GOOGLE_PLAY_PUBSUB_AUDIENCE;
    settings.GOOGLE_PLAY_PUBSUB_AUDIENCE = undefined;
    await expect(verifyGooglePlayWebhookAuth(`Bearer ${await token({})}`, { keys })).resolves.toBe(false);
    settings.GOOGLE_PLAY_PUBSUB_AUDIENCE = saved;
  });
});

describe("a Google Play push", () => {
  const push = (data: object, messageId: unknown = "m1") => ({
    message: { data: Buffer.from(JSON.stringify(data)).toString("base64"), messageId },
  });
  const subscription = { purchaseToken: "token", notificationType: 2 };

  it("reads a notification of this app", () => {
    const parsed = parseGooglePlayPush(
      push({ packageName: "com.smartspend.app", eventTimeMillis: "1800000000000", subscriptionNotification: subscription }),
    );
    expect(parsed).toMatchObject({ messageId: "m1", purchaseToken: "token", notificationType: 2 });
  });

  it("ignores another app, a test message, broken data and a bad time", () => {
    expect(parseGooglePlayPush(push({ packageName: "com.other", eventTimeMillis: "1", subscriptionNotification: subscription }))).toBeNull();
    expect(parseGooglePlayPush(push({ packageName: "com.smartspend.app", testNotification: {} }))).toBeNull();
    expect(parseGooglePlayPush({ message: { data: "%%%", messageId: "m" } })).toBeNull();
    expect(parseGooglePlayPush(null)).toBeNull();
    expect(parseGooglePlayPush(push({ packageName: "com.smartspend.app", eventTimeMillis: "soon", subscriptionNotification: subscription }))).toBeNull();
  });
});

describe("what Google says a purchase is", () => {
  const answering = (status: number, body: unknown) =>
    vi.fn(async (url: string | URL | Request) =>
      String(url).includes("oauth2.googleapis.com")
        ? new Response(JSON.stringify({ access_token: "a", expires_in: 3600 }))
        : new Response(JSON.stringify(body), { status }),
    ) as unknown as typeof fetch;

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const { exportPKCS8 } = await import("jose");
    settings.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "play@example.iam.gserviceaccount.com",
      private_key: await exportPKCS8(privateKey),
    });
  });

  const active = {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    latestOrderId: "GPA.1",
    lineItems: [{ productId: "pro_monthly", expiryTime: "2099-01-01T00:00:00Z" }],
  };

  it("reads the state and the end of the period from Google", async () => {
    await expect(fetchGoogleSubscription("t", { fetcher: answering(200, active) })).resolves.toMatchObject({
      state: "active",
      productId: "pro_monthly",
      expiresAt: inTheFuture,
      acknowledged: false,
    });
  });

  it("treats a revoked notification as refunded, and unknown tokens and products as nothing", async () => {
    const expired = { ...active, subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" };
    await expect(
      fetchGoogleSubscription("t", { notificationType: 12, fetcher: answering(200, expired) }),
    ).resolves.toMatchObject({ state: "refunded" });
    await expect(fetchGoogleSubscription("t", { fetcher: answering(404, {}) })).resolves.toBeNull();
    await expect(
      fetchGoogleSubscription("t", { fetcher: answering(200, { ...active, lineItems: [{ productId: "other" }] }) }),
    ).resolves.toBeNull();
  });

  it("fails loudly when Google is down, so the store retries instead of a wrong state being saved", async () => {
    await expect(fetchGoogleSubscription("t", { fetcher: answering(503, {}) })).rejects.toThrow("503");
  });
});

describe("App Store signatures", () => {
  let rootPem: string;
  let x5c: string[];
  let leafKeyPem: string;
  let foreignX5c: string[];

  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

  function jws(payload: object, chain = x5c, keyPem = leafKeyPem) {
    const head = `${b64({ alg: "ES256", x5c: chain })}.${b64(payload)}`;
    const signature = signBytes("sha256", Buffer.from(head), {
      key: createPrivateKey(keyPem),
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
    return `${head}.${signature}`;
  }

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), "apple-chain-"));
    const openssl = (...args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
    const der = (name: string) =>
      execFileSync("openssl", ["x509", "-in", name, "-outform", "DER"], { cwd: dir }).toString("base64");

    const makeChain = (prefix: string, leafOid: boolean) => {
      const ca = "basicConstraints=critical,CA:TRUE";
      openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", `${prefix}root.key`);
      openssl("req", "-x509", "-new", "-key", `${prefix}root.key`, "-subj", "/CN=root", "-days", "2", "-out", `${prefix}root.pem`);
      openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", `${prefix}ca.key`);
      openssl("req", "-new", "-key", `${prefix}ca.key`, "-subj", "/CN=ca", "-out", `${prefix}ca.csr`);
      writeFileSync(join(dir, `${prefix}ca.ext`), ca);
      openssl("x509", "-req", "-in", `${prefix}ca.csr`, "-CA", `${prefix}root.pem`, "-CAkey", `${prefix}root.key`, "-CAcreateserial", "-days", "2", "-extfile", `${prefix}ca.ext`, "-out", `${prefix}ca.pem`);
      openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", `${prefix}leaf.key`);
      openssl("pkcs8", "-topk8", "-nocrypt", "-in", `${prefix}leaf.key`, "-out", `${prefix}leaf.p8`);
      openssl("req", "-new", "-key", `${prefix}leaf.key`, "-subj", "/CN=leaf", "-out", `${prefix}leaf.csr`);
      writeFileSync(join(dir, `${prefix}leaf.ext`), leafOid ? "1.2.840.113635.100.6.11.1=ASN1:NULL" : "basicConstraints=CA:FALSE");
      openssl("x509", "-req", "-in", `${prefix}leaf.csr`, "-CA", `${prefix}ca.pem`, "-CAkey", `${prefix}ca.key`, "-CAcreateserial", "-days", "2", "-extfile", `${prefix}leaf.ext`, "-out", `${prefix}leaf.pem`);
      return { chain: [der(`${prefix}leaf.pem`), der(`${prefix}ca.pem`)], root: readFileSync(join(dir, `${prefix}root.pem`), "utf8"), key: readFileSync(join(dir, `${prefix}leaf.p8`), "utf8") };
    };

    const trusted = makeChain("a-", true);
    x5c = trusted.chain;
    rootPem = trusted.root;
    leafKeyPem = trusted.key;
    foreignX5c = makeChain("b-", true).chain;
  });

  const transaction = {
    transactionId: "t1",
    originalTransactionId: "o1",
    bundleId: "com.smartspend.app",
    productId: "pro_monthly",
    expiresDate: inTheFuture.getTime(),
    signedDate: 1,
    purchaseDate: 1,
  };

  it("accepts a transaction signed through the trusted chain", () => {
    expect(verifyAppleStoreKitTransaction(jws(transaction), rootPem)).toMatchObject({
      originalTransactionId: "o1",
      productId: "pro_monthly",
      revoked: false,
    });
  });

  it("refuses a changed payload, another root, another app and the old test doors", () => {
    const [head, , signature] = jws(transaction).split(".");
    const tampered = `${head}.${b64({ ...transaction, expiresDate: inTheFuture.getTime() + 1 })}.${signature}`;
    expect(verifyAppleStoreKitTransaction(tampered, rootPem)).toBeNull();
    expect(verifyAppleStoreKitTransaction(jws(transaction, foreignX5c), rootPem)).toBeNull();
    expect(verifyAppleStoreKitTransaction(jws({ ...transaction, bundleId: "com.other" }), rootPem)).toBeNull();
    expect(verifyAppleStoreKitTransaction("apple_tx_mock_1", rootPem)).toBeNull();
    const mock = Buffer.from("mock_valid_es256_signature").toString("base64url");
    expect(verifyAppleStoreKitTransaction(`${b64({ alg: "ES256" })}.${b64(transaction)}.${mock}`, rootPem)).toBeNull();
    expect(verifyAppleStoreKitTransaction(jws(transaction))).toBeNull();
  });

  it("reads a notification, and ignores one that changes nothing tracked", () => {
    const notification = (notificationType: string, subtype?: string) => ({
      signedPayload: jws({
        notificationType,
        subtype,
        notificationUUID: "n1",
        version: "2.0",
        signedDate: 1_800_000_000_000,
        data: { bundleId: "com.smartspend.app", signedTransactionInfo: jws(transaction) },
      }),
    });
    expect(parseAndVerifyAppleASN(notification("REFUND"), rootPem)?.state).toBe("refunded");
    expect(parseAndVerifyAppleASN(notification("DID_FAIL_TO_RENEW", "GRACE_PERIOD"), rootPem)?.state).toBe("in_grace_period");
    expect(parseAndVerifyAppleASN(notification("DID_FAIL_TO_RENEW"), rootPem)?.state).toBe("on_hold");
    expect(parseAndVerifyAppleASN(notification("TEST"), rootPem)).toBeNull();
  });
});

describe("which states pay", () => {
  const now = new Date("2026-11-02T00:00:00Z");
  const later = new Date("2026-12-02T00:00:00Z");
  const before = new Date("2026-10-02T00:00:00Z");

  it("grants the plan only while it is paid for", () => {
    expect(grantsAccess("active", later, now)).toBe(true);
    expect(grantsAccess("active", before, now)).toBe(false);
    expect(grantsAccess("active", null, now)).toBe(false);
    expect(grantsAccess("cancelled", later, now)).toBe(true);
    expect(grantsAccess("cancelled", before, now)).toBe(false);
    expect(grantsAccess("in_grace_period", before, now)).toBe(true);
    for (const state of ["on_hold", "paused", "expired", "refunded", "revoked", "pending"] as const) {
      expect(grantsAccess(state, later, now)).toBe(false);
    }
  });
});

describe("the safety rails", () => {
  it("refuses to start production with billing simulation on", () => {
    const base = {
      NODE_ENV: "production",
      DATABASE_URL: "mysql://u:p@127.0.0.1:3306/d",
      JWT_SECRET: "x".repeat(40),
      GEMINI_API_KEY: "k",
      GOOGLE_CLIENT_ID: "c",
      GOOGLE_CLIENT_SECRET: "s",
      GOOGLE_REDIRECT_URI: "https://example.test/cb",
    };
    expect(() => parseServerEnv({ ...base, BILLING_SIMULATE: "true" })).toThrow(/BILLING_SIMULATE/);
  });

  it("gives each account a stable token that does not reveal it", () => {
    const token = storeAccountToken({ userId: 42, userType: "local" });
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(storeAccountToken({ userId: 42, userType: "local" })).toBe(token);
    expect(storeAccountToken({ userId: 42, userType: "oauth" })).not.toBe(token);
  });
});
