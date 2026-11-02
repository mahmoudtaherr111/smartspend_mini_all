/**
 * Google Play Developer API v3 RTDN (Real-time Developer Notifications) Fixtures
 * Authoritative Source: Google Play Billing RTDN Specification & PROJECT.md § Interface Contracts #2
 */

export interface GooglePlaySubscriptionNotification {
  version: string;
  notificationType: number;
  purchaseToken: string;
  subscriptionId: string;
}

export interface GooglePlayDeveloperNotification {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: GooglePlaySubscriptionNotification;
  testNotification?: {
    version: string;
  };
}

export interface GooglePlayPubSubMessage {
  message: {
    data: string; // base64 encoded JSON string of GooglePlayDeveloperNotification
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

export const GOOGLE_PLAY_NOTIFICATION_TYPES = {
  SUBSCRIPTION_RECOVERED: 1,
  SUBSCRIPTION_RENEWED: 2,
  SUBSCRIPTION_CANCELED: 3,
  SUBSCRIPTION_PURCHASED: 4,
  SUBSCRIPTION_ON_HOLD: 5,
  SUBSCRIPTION_IN_GRACE_PERIOD: 6,
  SUBSCRIPTION_RESTARTED: 7,
  SUBSCRIPTION_PRICE_CHANGE_CONFIRMED: 8,
  SUBSCRIPTION_DEFERRED: 9,
  SUBSCRIPTION_PAUSED: 10,
  SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED: 11,
  SUBSCRIPTION_REVOKED: 12,
  SUBSCRIPTION_EXPIRED: 13,
} as const;

export function encodePubSubData(payload: GooglePlayDeveloperNotification): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decodePubSubData(base64Data: string): GooglePlayDeveloperNotification {
  const jsonStr = Buffer.from(base64Data, "base64").toString("utf-8");
  return JSON.parse(jsonStr);
}

export function createGooglePlayPubSubMessage(
  notificationType: number,
  options: {
    packageName?: string;
    subscriptionId?: string;
    purchaseToken?: string;
    eventTimeMillis?: number;
    messageId?: string;
  } = {}
): GooglePlayPubSubMessage {
  const packageName = options.packageName ?? "com.smartspend.app";
  const subscriptionId = options.subscriptionId ?? "pro_monthly";
  const purchaseToken = options.purchaseToken ?? `token_${Math.random().toString(36).substring(2, 12)}`;
  const eventTimeMillis = options.eventTimeMillis ?? Date.now();
  const messageId = options.messageId ?? `pubsub_msg_${Math.random().toString(36).substring(2, 10)}`;

  const notification: GooglePlayDeveloperNotification = {
    version: "1.0",
    packageName,
    eventTimeMillis: String(eventTimeMillis),
    subscriptionNotification: {
      version: "1.0",
      notificationType,
      purchaseToken,
      subscriptionId,
    },
  };

  return {
    message: {
      data: encodePubSubData(notification),
      messageId,
      publishTime: new Date(eventTimeMillis).toISOString(),
    },
    subscription: "projects/smartspend-prod/subscriptions/play-billing-rtdn",
  };
}

// Pre-generated static fixture instances for deterministic tests
export const GOOGLE_PLAY_FIXTURES = {
  purchase: createGooglePlayPubSubMessage(GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_PURCHASED, {
    purchaseToken: "gplay_token_purchase_001",
    subscriptionId: "pro_monthly",
    eventTimeMillis: 1730000000000,
    messageId: "msg_purchase_001",
  }),
  renewal: createGooglePlayPubSubMessage(GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED, {
    purchaseToken: "gplay_token_purchase_001",
    subscriptionId: "pro_monthly",
    eventTimeMillis: 1732600000000,
    messageId: "msg_renewal_001",
  }),
  gracePeriod: createGooglePlayPubSubMessage(GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_IN_GRACE_PERIOD, {
    purchaseToken: "gplay_token_purchase_001",
    subscriptionId: "pro_monthly",
    eventTimeMillis: 1735200000000,
    messageId: "msg_grace_001",
  }),
  onHold: createGooglePlayPubSubMessage(GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_ON_HOLD, {
    purchaseToken: "gplay_token_purchase_001",
    subscriptionId: "pro_monthly",
    eventTimeMillis: 1735800000000,
    messageId: "msg_hold_001",
  }),
  recovered: createGooglePlayPubSubMessage(GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_RECOVERED, {
    purchaseToken: "gplay_token_purchase_001",
    subscriptionId: "pro_monthly",
    eventTimeMillis: 1736000000000,
    messageId: "msg_recovered_001",
  }),
  cancel: createGooglePlayPubSubMessage(GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_CANCELED, {
    purchaseToken: "gplay_token_purchase_001",
    subscriptionId: "pro_monthly",
    eventTimeMillis: 1736200000000,
    messageId: "msg_cancel_001",
  }),
  expired: createGooglePlayPubSubMessage(GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED, {
    purchaseToken: "gplay_token_purchase_001",
    subscriptionId: "pro_monthly",
    eventTimeMillis: 1737800000000,
    messageId: "msg_expired_001",
  }),
  refunded: createGooglePlayPubSubMessage(GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_REVOKED, {
    purchaseToken: "gplay_token_purchase_001",
    subscriptionId: "pro_monthly",
    eventTimeMillis: 1738000000000,
    messageId: "msg_revoked_001",
  }),
  forgedPackageName: createGooglePlayPubSubMessage(GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_PURCHASED, {
    packageName: "com.malicious.fakeapp",
    purchaseToken: "gplay_token_forged_001",
    messageId: "msg_forged_001",
  }),
};
