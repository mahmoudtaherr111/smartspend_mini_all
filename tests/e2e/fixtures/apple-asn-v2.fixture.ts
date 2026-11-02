/**
 * Apple App Store Server Notifications v2 & StoreKit 2 ES256 JWS Fixtures
 * Authoritative Source: Apple App Store Server Notifications v2 Documentation & PROJECT.md § Interface Contracts #2
 */

export interface AppleJWSTransactionDecodedPayload {
  transactionId: string;
  originalTransactionId: string;
  webOrderLineItemId: string;
  bundleId: string;
  productId: string;
  subscriptionGroupIdentifier: string;
  purchaseDate: number; // millisecond timestamp
  originalPurchaseDate: number;
  expiresDate: number;
  quantity: number;
  type: "Auto-Renewable Subscription";
  inAppOwnershipType: "PURCHASED" | "FAMILY_SHARED";
  signedDate: number;
  environment: "Sandbox" | "Production";
  revocationDate?: number;
  revocationReason?: number;
}

export interface AppleJWSRenewalInfoDecodedPayload {
  originalTransactionId: string;
  autoRenewProductId: string;
  autoRenewStatus: 0 | 1; // 0 = off, 1 = on
  expirationIntent?: number;
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  signedDate: number;
  environment: "Sandbox" | "Production";
}

export interface AppleASNServerNotificationV2Payload {
  notificationType:
    | "SUBSCRIBED"
    | "DID_RENEW"
    | "DID_FAIL_TO_RENEW"
    | "EXPIRED"
    | "GRACE_PERIOD_EXPIRED"
    | "REFUND"
    | "REVOKE"
    | "DID_CHANGE_RENEWAL_STATUS";
  subtype?:
    | "INITIAL_BUY"
    | "RESUBSCRIBE"
    | "AUTO_RENEW_ENABLED"
    | "AUTO_RENEW_DISABLED"
    | "VOLUNTARY"
    | "BILLING_RETRY"
    | "PRICE_INCREASE";
  notificationUUID: string;
  version: "2.0";
  signedDate: number;
  data: {
    appAppleId: number;
    bundleId: string;
    bundleVersion: string;
    environment: "Sandbox" | "Production";
    signedTransactionInfo: string; // JWS token string
    signedRenewalInfo?: string; // JWS token string
  };
}

export interface AppleASNEnvelope {
  signedPayload: string; // JWS token string encoding AppleASNServerNotificationV2Payload
}

/**
 * Creates a mock JWS token (Base64Url(Header).Base64Url(Payload).Base64Url(Signature))
 */
export function createMockJWS<T extends object>(payload: T, options: { header?: object; signature?: string } = {}): string {
  const header = options.header ?? {
    alg: "ES256",
    x5c: ["MIIB...mock_root_ca_certificate..."],
    typ: "JWT",
  };
  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const b64Sig = options.signature ?? Buffer.from("mock_valid_es256_signature").toString("base64url");
  return `${b64Header}.${b64Payload}.${b64Sig}`;
}

export function decodeMockJWS<T>(jws: string): { header: any; payload: T; signature: string } {
  const parts = jws.split(".");
  if (parts.length !== 3) {
    throw new Error(`Invalid JWS format: expected 3 parts, got ${parts.length}`);
  }
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8")) as T;
  return { header, payload, signature: parts[2] };
}

export function createAppleASNv2Notification(
  notificationType: AppleASNServerNotificationV2Payload["notificationType"],
  options: {
    subtype?: AppleASNServerNotificationV2Payload["subtype"];
    originalTransactionId?: string;
    transactionId?: string;
    productId?: string;
    bundleId?: string;
    purchaseDate?: number;
    expiresDate?: number;
    signedDate?: number;
    environment?: "Sandbox" | "Production";
    isInBillingRetryPeriod?: boolean;
    gracePeriodExpiresDate?: number;
    revocationDate?: number;
    revocationReason?: number;
  } = {}
): { envelope: AppleASNEnvelope; decodedNotification: AppleASNServerNotificationV2Payload; decodedTx: AppleJWSTransactionDecodedPayload } {
  const now = options.signedDate ?? Date.now();
  const bundleId = options.bundleId ?? "com.smartspend.app";
  const originalTransactionId = options.originalTransactionId ?? `apple_orig_tx_${Math.random().toString(36).substring(2, 10)}`;
  const transactionId = options.transactionId ?? `apple_tx_${Math.random().toString(36).substring(2, 10)}`;
  const productId = options.productId ?? "pro_monthly";
  const purchaseDate = options.purchaseDate ?? now;
  const expiresDate = options.expiresDate ?? (now + 30 * 24 * 60 * 60 * 1000);
  const environment = options.environment ?? "Sandbox";

  const txPayload: AppleJWSTransactionDecodedPayload = {
    transactionId,
    originalTransactionId,
    webOrderLineItemId: `wol_${transactionId}`,
    bundleId,
    productId,
    subscriptionGroupIdentifier: "smartspend_pro",
    purchaseDate,
    originalPurchaseDate: purchaseDate,
    expiresDate,
    quantity: 1,
    type: "Auto-Renewable Subscription",
    inAppOwnershipType: "PURCHASED",
    signedDate: now,
    environment,
    ...(options.revocationDate ? { revocationDate: options.revocationDate, revocationReason: options.revocationReason ?? 1 } : {}),
  };

  const renewalPayload: AppleJWSRenewalInfoDecodedPayload = {
    originalTransactionId,
    autoRenewProductId: productId,
    autoRenewStatus: options.subtype === "AUTO_RENEW_DISABLED" ? 0 : 1,
    signedDate: now,
    environment,
    ...(options.isInBillingRetryPeriod ? { isInBillingRetryPeriod: true } : {}),
    ...(options.gracePeriodExpiresDate ? { gracePeriodExpiresDate: options.gracePeriodExpiresDate } : {}),
  };

  const signedTransactionInfo = createMockJWS(txPayload);
  const signedRenewalInfo = createMockJWS(renewalPayload);

  const notificationPayload: AppleASNServerNotificationV2Payload = {
    notificationType,
    ...(options.subtype ? { subtype: options.subtype } : {}),
    notificationUUID: `uuid_${Math.random().toString(36).substring(2, 12)}`,
    version: "2.0",
    signedDate: now,
    data: {
      appAppleId: 6472019283,
      bundleId,
      bundleVersion: "2.1.0",
      environment,
      signedTransactionInfo,
      signedRenewalInfo,
    },
  };

  const envelope: AppleASNEnvelope = {
    signedPayload: createMockJWS(notificationPayload),
  };

  return {
    envelope,
    decodedNotification: notificationPayload,
    decodedTx: txPayload,
  };
}

export const APPLE_ASN_FIXTURES = {
  subscribed: createAppleASNv2Notification("SUBSCRIBED", {
    subtype: "INITIAL_BUY",
    originalTransactionId: "orig_apple_tx_001",
    transactionId: "apple_tx_sub_001",
    productId: "pro_monthly",
    signedDate: 1730000000000,
  }),
  renewed: createAppleASNv2Notification("DID_RENEW", {
    originalTransactionId: "orig_apple_tx_001",
    transactionId: "apple_tx_renew_002",
    productId: "pro_monthly",
    signedDate: 1732600000000,
  }),
  gracePeriod: createAppleASNv2Notification("DID_FAIL_TO_RENEW", {
    subtype: "BILLING_RETRY",
    originalTransactionId: "orig_apple_tx_001",
    transactionId: "apple_tx_renew_002",
    productId: "pro_monthly",
    signedDate: 1735200000000,
    isInBillingRetryPeriod: true,
    gracePeriodExpiresDate: 1736400000000,
  }),
  gracePeriodExpired: createAppleASNv2Notification("GRACE_PERIOD_EXPIRED", {
    originalTransactionId: "orig_apple_tx_001",
    signedDate: 1736400001000,
  }),
  cancelled: createAppleASNv2Notification("DID_CHANGE_RENEWAL_STATUS", {
    subtype: "AUTO_RENEW_DISABLED",
    originalTransactionId: "orig_apple_tx_001",
    signedDate: 1736500000000,
  }),
  expired: createAppleASNv2Notification("EXPIRED", {
    subtype: "VOLUNTARY",
    originalTransactionId: "orig_apple_tx_001",
    signedDate: 1737800000000,
  }),
  refunded: createAppleASNv2Notification("REFUND", {
    originalTransactionId: "orig_apple_tx_001",
    signedDate: 1738000000000,
    revocationDate: 1738000000000,
    revocationReason: 1,
  }),
  revoked: createAppleASNv2Notification("REVOKE", {
    originalTransactionId: "orig_apple_tx_001",
    signedDate: 1738100000000,
    revocationDate: 1738100000000,
    revocationReason: 2,
  }),
  forgedBundleId: createAppleASNv2Notification("SUBSCRIBED", {
    bundleId: "com.malicious.hackedapp",
    originalTransactionId: "orig_forged_apple_001",
  }),
};
