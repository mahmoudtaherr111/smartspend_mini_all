/**
 * Google Play: who may call the webhook, and what a purchase really is.
 *
 * Two rules. The webhook is believed only after its Google-signed OIDC token is verified, and even then a
 * notification only says "look at this purchase": its state always comes from the Play Developer API, so nothing in
 * a request can extend a subscription.
 */
import { createHash } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { env } from "../env";
import { STORE_PRODUCT_IDS, type EntitlementState } from "./entitlement";

const GOOGLE_CERTS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const PUBLISHER_API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

/** The Play notification that means the money went back. Its v2 state reads only as expired. */
const SUBSCRIPTION_REVOKED = 12;

export function isGooglePlayConfigured(): boolean {
  return Boolean(
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON &&
      env.GOOGLE_PLAY_PUBSUB_AUDIENCE &&
      env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT,
  );
}

/** A purchase token can pass 255 characters, so its row is keyed by the token's hash. */
export function googlePurchaseKey(purchaseToken: string): string {
  return createHash("sha256").update(purchaseToken).digest("hex");
}

export function validateTokenInput(token: string): boolean {
  return typeof token === "string" && token.trim().length > 0 && token.length <= 2048 && !token.includes("\0");
}

let googleKeys: JWTVerifyGetKey | undefined;

/** Verifies the bearer token Pub/Sub sends: Google's signature, this endpoint's audience, our service account. */
export async function verifyGooglePlayWebhookAuth(
  authorization: string | undefined,
  options: { keys?: JWTVerifyGetKey } = {},
): Promise<boolean> {
  if (!env.GOOGLE_PLAY_PUBSUB_AUDIENCE || !env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT) return false;
  if (!authorization?.startsWith("Bearer ")) return false;
  googleKeys ??= createRemoteJWKSet(GOOGLE_CERTS_URL);
  try {
    const { payload } = await jwtVerify(authorization.slice("Bearer ".length).trim(), options.keys ?? googleKeys, {
      issuer: GOOGLE_ISSUERS,
      audience: env.GOOGLE_PLAY_PUBSUB_AUDIENCE,
    });
    return payload.email === env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT && payload.email_verified === true;
  } catch {
    return false;
  }
}

export interface GooglePlayPush {
  messageId: string;
  purchaseToken: string;
  notificationType: number;
  eventTime: Date;
}

/** Reads a Pub/Sub push. Null for anything that is not a subscription notification of this app. */
export function parseGooglePlayPush(body: unknown): GooglePlayPush | null {
  const message = (body as { message?: { data?: unknown; messageId?: unknown } } | null)?.message;
  if (typeof message?.data !== "string" || typeof message.messageId !== "string") return null;
  try {
    const decoded = JSON.parse(Buffer.from(message.data, "base64").toString("utf8"));
    const notification = decoded?.subscriptionNotification;
    if (decoded?.packageName !== env.GOOGLE_PLAY_PACKAGE_NAME || !notification) return null;
    if (!validateTokenInput(notification.purchaseToken) || typeof notification.notificationType !== "number") {
      return null;
    }
    const eventTime = new Date(Number(decoded.eventTimeMillis));
    if (Number.isNaN(eventTime.getTime())) return null;
    return {
      messageId: message.messageId,
      purchaseToken: notification.purchaseToken,
      notificationType: notification.notificationType,
      eventTime,
    };
  } catch {
    return null;
  }
}

export interface GoogleSubscription {
  state: EntitlementState;
  productId: string;
  expiresAt: Date | null;
  orderId: string | null;
  acknowledged: boolean;
  linkedPurchaseToken: string | null;
  accountToken: string | null;
}

type Fetch = typeof fetch;

let cachedAccess: { token: string; expiresAt: number } | undefined;

async function accessToken(fetcher: Fetch): Promise<string> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) return cachedAccess.token;
  const account = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? "{}") as {
    client_email?: string;
    private_key?: string;
  };
  if (!account.client_email || !account.private_key) throw new Error("Google Play service account is not configured");
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: PUBLISHER_SCOPE })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(account.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Google token request failed with ${response.status}`);
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccess = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

function readState(subscriptionState: string, notificationType?: number): EntitlementState {
  if (notificationType === SUBSCRIPTION_REVOKED) return "refunded";
  switch (subscriptionState) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      return "active";
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "in_grace_period";
    case "SUBSCRIPTION_STATE_ON_HOLD":
      return "on_hold";
    case "SUBSCRIPTION_STATE_PAUSED":
      return "paused";
    case "SUBSCRIPTION_STATE_CANCELED":
      return "cancelled";
    case "SUBSCRIPTION_STATE_PENDING":
      return "pending";
    default:
      return "expired";
  }
}

/** The purchase as Google records it, or null when Google does not know the token. */
export async function fetchGoogleSubscription(
  purchaseToken: string,
  options: { notificationType?: number; fetcher?: Fetch } = {},
): Promise<GoogleSubscription | null> {
  const fetcher = options.fetcher ?? fetch;
  const url = `${PUBLISHER_API}/${env.GOOGLE_PLAY_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await fetcher(url, {
    headers: { authorization: `Bearer ${await accessToken(fetcher)}` },
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error(`Google Play answered ${response.status}`);
  const body = (await response.json()) as {
    subscriptionState?: string;
    acknowledgementState?: string;
    latestOrderId?: string;
    linkedPurchaseToken?: string;
    externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
    lineItems?: { productId?: string; expiryTime?: string }[];
  };
  const item = body.lineItems?.[0];
  if (!item?.productId || !(STORE_PRODUCT_IDS as readonly string[]).includes(item.productId)) return null;
  return {
    state: readState(body.subscriptionState ?? "", options.notificationType),
    productId: item.productId,
    expiresAt: item.expiryTime ? new Date(item.expiryTime) : null,
    orderId: body.latestOrderId ?? null,
    acknowledged: body.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    linkedPurchaseToken: body.linkedPurchaseToken ?? null,
    accountToken: body.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
  };
}

/** Google refunds a subscription that stays unacknowledged for three days. */
export async function acknowledgeGooglePurchase(
  purchaseToken: string,
  productId: string,
  fetcher: Fetch = fetch,
): Promise<void> {
  const url = `${PUBLISHER_API}/${env.GOOGLE_PLAY_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const response = await fetcher(url, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken(fetcher)}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`Google Play acknowledge answered ${response.status}`);
}
