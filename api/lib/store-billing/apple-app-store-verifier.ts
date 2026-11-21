/**
 * Apple App Store Server Notifications v2 & StoreKit 2 ES256 JWS Verifier
 * Authoritative Specifications: ORIGINAL_REQUEST.md R2 & PROJECT.md § Interface Contracts #2
 */

import crypto from "crypto";
import { env } from "../env";
import type { EntitlementState } from "./entitlement";


export interface AppleJWSTransactionDecodedPayload {
  transactionId: string;
  originalTransactionId: string;
  webOrderLineItemId?: string;
  bundleId: string;
  productId: string;
  subscriptionGroupIdentifier?: string;
  purchaseDate: number;
  originalPurchaseDate?: number;
  expiresDate: number;
  quantity?: number;
  type?: string;
  inAppOwnershipType?: "PURCHASED" | "FAMILY_SHARED";
  signedDate: number;
  environment?: "Sandbox" | "Production";
  appAccountToken?: string;
  revocationDate?: number;
  revocationReason?: number;
}

export interface AppleJWSRenewalInfoDecodedPayload {
  originalTransactionId: string;
  autoRenewProductId: string;
  autoRenewStatus: 0 | 1;
  expirationIntent?: number;
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  signedDate: number;
  environment?: "Sandbox" | "Production";
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
    | "GRACE_PERIOD"
    | "PRICE_INCREASE";
  notificationUUID: string;
  version: "2.0";
  signedDate: number;
  data: {
    appAppleId?: number;
    bundleId: string;
    bundleVersion?: string;
    environment?: "Sandbox" | "Production";
    signedTransactionInfo: string;
    signedRenewalInfo?: string;
  };
}

export interface AppleASNEnvelope {
  signedPayload: string;
}

/**
 * Checks if bundle identifier matches allowed App Store bundle ID.
 */
export function verifyAppleBundle(bundleId: string): boolean {
  return bundleId === env.APPLE_BUNDLE_ID;
}

export function isAppStoreConfigured(): boolean {
  return env.APPLE_STORE_BILLING_ENABLED === "true";
}

export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

export const APPLE_APP_STORE_OID = "1.2.840.113635.100.6.11.1";
const APPLE_APP_STORE_OID_BYTES = Buffer.from("2a864886f76364060b01", "hex");

/**
 * Validates the Apple X.509 certificate chain (DEF-01):
 * 1. Checks leaf and intermediate validity dates (notBefore / notAfter).
 * 2. Verifies x5c[0] (leaf) is signed by x5c[1] (intermediate).
 * 3. Verifies x5c[1] (intermediate) is signed by Apple Root CA - G3.
 * 4. Verifies x5c[0] contains the Apple App Store OID extension (1.2.840.113635.100.6.11.1).
 */
export function verifyAppleCertificateChain(
  x5c: string[],
  trustedRootPem: string = APPLE_ROOT_CA_G3_PEM,
): crypto.KeyObject | null {
  if (!x5c || !Array.isArray(x5c) || x5c.length < 2) {
    return null;
  }

  try {
    const leafDer = Buffer.from(x5c[0], "base64");
    const intermediateDer = Buffer.from(x5c[1], "base64");

    const leafCert = new crypto.X509Certificate(leafDer);
    const intermediateCert = new crypto.X509Certificate(intermediateDer);
    const rootCert = new crypto.X509Certificate(trustedRootPem);

    const now = Date.now();
    const leafFrom = new Date(leafCert.validFrom).getTime();
    const leafTo = new Date(leafCert.validTo).getTime();
    if (now < leafFrom || now > leafTo) {
      return null;
    }

    const interFrom = new Date(intermediateCert.validFrom).getTime();
    const interTo = new Date(intermediateCert.validTo).getTime();
    if (now < interFrom || now > interTo) {
      return null;
    }

    // Verify leaf is signed by intermediate
    const leafSignedByInter = leafCert.verify(intermediateCert.publicKey);
    if (!leafSignedByInter) {
      return null;
    }

    // Verify intermediate is signed by Apple Root CA - G3
    const interSignedByRoot = intermediateCert.verify(rootCert.publicKey);
    if (!interSignedByRoot) {
      return null;
    }

    // If root cert is included in x5c[2], ensure it matches Apple Root CA - G3
    if (x5c.length >= 3) {
      const providedRootCert = new crypto.X509Certificate(Buffer.from(x5c[2], "base64"));
      if (
        !providedRootCert.raw.equals(rootCert.raw)
      ) {
        return null;
      }
    }

    // Verify Apple App Store OID extension 1.2.840.113635.100.6.11.1
    const rawLeaf = leafCert.raw;
    const hasOidExtension =
      rawLeaf.includes(APPLE_APP_STORE_OID_BYTES) ||
      (typeof leafCert.toString === "function" && leafCert.toString().includes(APPLE_APP_STORE_OID));

    if (!hasOidExtension) {
      return null;
    }

    return leafCert.publicKey;
  } catch {
    return null;
  }
}

/**
 * Decodes and verifies a JWS token.
 * Validates header algorithm is ES256, verifies signature integrity, and rejects tampered payloads.
 */
export function decodeAndVerifyJWS<T>(
  jws: string,
  trustedRootPem?: string,
): { payload: T } | null {
  if (!jws || typeof jws !== "string") return null;
  const parts = jws.split(".");
  if (parts.length !== 3) return null;

  try {
    const headerStr = Buffer.from(parts[0], "base64url").toString("utf-8");
    const header = JSON.parse(headerStr);

    if (header.alg !== "ES256") {
      return null;
    }

    const payloadStr = Buffer.from(parts[1], "base64url").toString("utf-8");
    const payload = JSON.parse(payloadStr) as T;

    // Verify signature integrity: signature must not be empty or tampered
    const signature = parts[2];
    if (!signature || signature.length === 0) {
      return null;
    }

    // Validate that payload conforms to an authentic Apple App Store notification or StoreKit transaction structure
    const p = payload as Record<string, unknown> & { data?: { bundleId?: string } };
    const isValidApplePayload =
      Boolean(p && typeof p === "object") &&
      (
        Boolean(p.notificationType && p.notificationUUID && p.data && p.data.bundleId) || // Apple ASN v2
        Boolean(p.transactionId && p.originalTransactionId && p.bundleId) || // StoreKit 2 Transaction
        Boolean(p.originalTransactionId && p.autoRenewProductId) // StoreKit 2 Renewal
      );

    if (!isValidApplePayload) {
      return null;
    }

    // Authentic x5c certificate chain verification for production StoreKit 2 transactions (DEF-01)
    if (header.x5c && Array.isArray(header.x5c) && header.x5c.length > 0) {
      try {
        const leafPublicKey = verifyAppleCertificateChain(header.x5c, trustedRootPem);
        if (leafPublicKey) {
          const isValid = crypto.verify(
            "sha256",
            Buffer.from(`${parts[0]}.${parts[1]}`),
            { key: leafPublicKey, dsaEncoding: "ieee-p1363" },
            Buffer.from(signature, "base64url"),
          );
          if (isValid) {
            return { payload };
          }
        }
      } catch {
        return null;
      }
    }

    // Any other signature (including forged / untrusted strings) is strictly rejected
    return null;
  } catch {
    return null;
  }
}

export interface ParsedAppleEvent {
  notificationUUID: string;
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  expiresAt: Date | null;
  signedAt: Date;
  accountToken: string | null;
  notificationType: string;
  state: EntitlementState;
}

/** The state a notification leaves the subscription in. Null for a notification that changes nothing we track. */
function stateOf(notification: AppleASNServerNotificationV2Payload): EntitlementState | null {
  switch (notification.notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW":
      return "active";
    case "DID_FAIL_TO_RENEW":
      return notification.subtype === "GRACE_PERIOD" ? "in_grace_period" : "on_hold";
    case "GRACE_PERIOD_EXPIRED":
      return "on_hold";
    case "DID_CHANGE_RENEWAL_STATUS":
      return notification.subtype === "AUTO_RENEW_DISABLED" ? "cancelled" : "active";
    case "EXPIRED":
      return "expired";
    case "REFUND":
      return "refunded";
    case "REVOKE":
      return "revoked";
    default:
      return null;
  }
}

/**
 * Verifies an App Store Server Notification v2. Returns null if a signature is invalid, the bundle is another
 * app's, or the notification changes nothing tracked.
 */
export function parseAndVerifyAppleASN(envelope: AppleASNEnvelope, trustedRootPem?: string): ParsedAppleEvent | null {
  if (!envelope?.signedPayload) return null;
  const verifiedEnvelope = decodeAndVerifyJWS<AppleASNServerNotificationV2Payload>(
    envelope.signedPayload,
    trustedRootPem,
  );
  if (!verifiedEnvelope) return null;

  const notification = verifiedEnvelope.payload;
  if (!notification?.data?.bundleId || !verifyAppleBundle(notification.data.bundleId)) return null;

  const verifiedTx = decodeAndVerifyJWS<AppleJWSTransactionDecodedPayload>(
    notification.data.signedTransactionInfo,
    trustedRootPem,
  );
  const tx = verifiedTx?.payload;
  if (!tx?.bundleId || !verifyAppleBundle(tx.bundleId)) return null;

  const state = stateOf(notification);
  if (!state) return null;
  return {
    notificationUUID: notification.notificationUUID,
    originalTransactionId: tx.originalTransactionId,
    transactionId: tx.transactionId,
    productId: tx.productId,
    expiresAt: tx.expiresDate ? new Date(tx.expiresDate) : null,
    signedAt: new Date(notification.signedDate),
    accountToken: tx.appAccountToken ?? null,
    notificationType: notification.notificationType,
    state,
  };
}

export interface VerifiedAppleTransaction {
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  expiresAt: Date | null;
  accountToken: string | null;
  revoked: boolean;
}

/** Verifies a StoreKit 2 signed transaction from the app. There is no unsigned form. */
export function verifyAppleStoreKitTransaction(jws: string, trustedRootPem?: string): VerifiedAppleTransaction | null {
  if (!jws || jws.length > 16_384 || jws.includes("\0")) return null;
  const tx = decodeAndVerifyJWS<AppleJWSTransactionDecodedPayload>(jws, trustedRootPem)?.payload;
  if (!tx || !verifyAppleBundle(tx.bundleId)) return null;
  return {
    originalTransactionId: tx.originalTransactionId,
    transactionId: tx.transactionId,
    productId: tx.productId,
    expiresAt: tx.expiresDate ? new Date(tx.expiresDate) : null,
    accountToken: tx.appAccountToken ?? null,
    revoked: Boolean(tx.revocationDate),
  };
}
