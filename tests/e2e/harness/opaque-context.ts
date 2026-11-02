/**
 * Opaque-Box E2E Test Harness & Spec Verifier
 * Authoritative Specifications: ORIGINAL_REQUEST.md & PROJECT.md
 */

export interface UserPair {
  userId: string;
  userType: "local" | "google";
  phone?: string;
  email?: string;
  plan: "free" | "pro";
  role: "user" | "admin" | "moderator";
  deletedAt?: number | null;
}

export type EntitlementState =
  | "ACTIVE"
  | "IN_GRACE_PERIOD"
  | "ON_HOLD"
  | "PAUSED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "REVOKED";

export interface SubscriptionRecord {
  platform: "android" | "ios";
  tokenOrTxId: string;
  originalTxId: string;
  productId: string;
  userId: string;
  userType: "local" | "google";
  status: EntitlementState;
  lastEventTime: number;
  expiresAt: number;
  gracePeriodExpiresAt?: number;
}

export interface OutboxMessage {
  id: string;
  recipientPhone: string;
  templateName: string;
  messageType: "reports" | "reminders" | "marketing" | "otp";
  payload: Record<string, any>;
  status: "queued" | "sent" | "delivered" | "failed" | "rejected_no_consent";
  createdAt: number;
  sentAt?: number;
}

export interface RecipientConsent {
  phone: string;
  userId: string;
  userType: "local" | "google";
  reportsConsent: boolean;
  remindersConsent: boolean;
  marketingConsent: boolean;
  optedOutAt?: number | null;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  adminType: "local" | "google";
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, any>;
  ipAddress: string;
  createdAt: number;
}

export interface AdCampaign {
  id: string;
  title: string;
  placement: "home_feed" | "category_view" | "reports_banner";
  platformTarget: "all" | "android" | "ios" | "web";
  planTarget: "all" | "free_only";
  frequencyCapPerDay: number;
  isKillSwitched: boolean;
  startAt: number;
  endAt: number;
}

export interface AdImpression {
  adId: string;
  userId: string;
  placement: string;
  impressionToken: string;
  recordedAt: number;
}

export interface UserSession {
  sessionId: string;
  userId: string;
  userType: "local" | "google";
  deviceName: string;
  ipAddress: string;
  fingerprint: string;
  createdAt: number;
  lastActiveAt: number;
  isRevoked: boolean;
}

/**
 * Entitlement State Machine Transition Engine
 * Implements authoritative rules from PROJECT.md § Interface Contracts #2
 */
export class EntitlementStateMachine {
  private subscriptions = new Map<string, SubscriptionRecord>();
  private processedEvents = new Set<string>(); // For idempotency tracking

  public getSubscription(key: string): SubscriptionRecord | undefined {
    return this.subscriptions.get(key);
  }

  public processStoreEvent(event: {
    platform: "android" | "ios";
    originalTxId: string;
    tokenOrTxId: string;
    productId: string;
    userId: string;
    userType: "local" | "google";
    eventType:
      | "PURCHASE"
      | "RENEWAL"
      | "GRACE_PERIOD"
      | "HOLD"
      | "CANCEL"
      | "EXPIRE"
      | "REFUND"
      | "REVOKE"
      | "RECOVER";
    eventTime: number;
    expiresAt?: number;
    eventId?: string;
  }): { success: boolean; state: EntitlementState; effectivePlan: "free" | "pro"; reason?: string } {
    const subKey = `${event.platform}:${event.originalTxId}`;
    const eventKey = event.eventId ?? `${subKey}:${event.eventType}:${event.eventTime}`;

    // 1. Idempotency Check: Replayed events must produce identical outcome without duplicate side-effects
    if (this.processedEvents.has(eventKey)) {
      const existing = this.subscriptions.get(subKey)!;
      return {
        success: true,
        state: existing.status,
        effectivePlan: this.isProEffective(existing.status) ? "pro" : "free",
        reason: "IDEMPOTENT_REPLAY_IGNORED",
      };
    }

    const current = this.subscriptions.get(subKey);

    // 2. Out-of-order check: If an event has older timestamp than last processed event, reject or ignore
    if (current && event.eventTime < current.lastEventTime) {
      return {
        success: false,
        state: current.status,
        effectivePlan: this.isProEffective(current.status) ? "pro" : "free",
        reason: "OUT_OF_ORDER_EVENT_DROPPED",
      };
    }

    // 3. State transitions
    let nextState: EntitlementState;
    const defaultExpiresAt = event.expiresAt ?? (event.eventTime + 30 * 24 * 60 * 60 * 1000);

    switch (event.eventType) {
      case "PURCHASE":
      case "RENEWAL":
      case "RECOVER":
        nextState = "ACTIVE";
        break;
      case "GRACE_PERIOD":
        nextState = "IN_GRACE_PERIOD";
        break;
      case "HOLD":
        nextState = "ON_HOLD";
        break;
      case "CANCEL":
        nextState = "CANCELLED";
        break;
      case "EXPIRE":
        nextState = "EXPIRED";
        break;
      case "REFUND":
        nextState = "REFUNDED";
        break;
      case "REVOKE":
        nextState = "REVOKED";
        break;
      default:
        throw new Error(`Unknown eventType: ${(event as any).eventType}`);
    }

    const updatedRecord: SubscriptionRecord = {
      platform: event.platform,
      originalTxId: event.originalTxId,
      tokenOrTxId: event.tokenOrTxId,
      productId: event.productId,
      userId: event.userId,
      userType: event.userType,
      status: nextState,
      lastEventTime: event.eventTime,
      expiresAt: defaultExpiresAt,
    };

    this.subscriptions.set(subKey, updatedRecord);
    this.processedEvents.add(eventKey);

    return {
      success: true,
      state: nextState,
      effectivePlan: this.isProEffective(nextState) ? "pro" : "free",
    };
  }

  /**
   * Authority on which entitlement states grant Pro access:
   * ACTIVE: Yes
   * IN_GRACE_PERIOD: Yes (retained during grace window)
   * ON_HOLD: No (suspended)
   * PAUSED: No (suspended)
   * CANCELLED: Yes until expiresAt, then Free
   * EXPIRED: No
   * REFUNDED: No
   * REVOKED: No
   */
  public isProEffective(state: EntitlementState, currentTime: number = Date.now(), expiresAt?: number): boolean {
    if (state === "ACTIVE" || state === "IN_GRACE_PERIOD") {
      return true;
    }
    if (state === "CANCELLED") {
      if (expiresAt && currentTime <= expiresAt) {
        return true;
      }
      return false;
    }
    return false;
  }
}

/**
 * WhatsApp Cloud API Consent & Outbox Verification Engine
 * Implements authoritative rules from PROJECT.md § Interface Contracts #3 & ORIGINAL_REQUEST.md R3
 */
export class WhatsAppOutboxEngine {
  private contacts = new Map<string, RecipientConsent>();
  private outbox: OutboxMessage[] = [];

  public setConsent(phone: string, consent: Partial<RecipientConsent> & { userId: string; userType: "local" | "google" }): void {
    const existing = this.contacts.get(phone) ?? {
      phone,
      userId: consent.userId,
      userType: consent.userType,
      reportsConsent: true,
      remindersConsent: true,
      marketingConsent: true,
      optedOutAt: null,
    };
    this.contacts.set(phone, { ...existing, ...consent });
  }

  public getConsent(phone: string): RecipientConsent | undefined {
    return this.contacts.get(phone);
  }

  public processInboundMessage(phone: string, text: string): { optedOut: boolean } {
    const trimmed = text.trim();
    // Stop words check: "إيقاف", "STOP", "الغاء", etc.
    const isStopWord = /^(إيقاف|ايقاف|الغاء|إلغاء|STOP|stop)$/i.test(trimmed);

    if (isStopWord) {
      const contact = this.contacts.get(phone);
      if (contact) {
        contact.reportsConsent = false;
        contact.remindersConsent = false;
        contact.marketingConsent = false;
        contact.optedOutAt = Date.now();
        this.contacts.set(phone, contact);
      }
      return { optedOut: true };
    }

    return { optedOut: false };
  }

  public enqueueMessage(message: {
    recipientPhone: string;
    templateName: string;
    messageType: "reports" | "reminders" | "marketing" | "otp";
    payload: Record<string, any>;
  }): { enqueued: boolean; error?: string; messageId?: string } {
    const consent = this.contacts.get(message.recipientPhone);

    // OTP messages bypass marketing consent, but respect valid phone requirement
    if (message.messageType !== "otp") {
      if (!consent) {
        return { enqueued: false, error: "RECIPIENT_CONSENT_REQUIRED_NO_RECORD" };
      }

      if (consent.optedOutAt) {
        return { enqueued: false, error: "RECIPIENT_OPTED_OUT" };
      }

      if (message.messageType === "reports" && !consent.reportsConsent) {
        return { enqueued: false, error: "RECIPIENT_DECLINED_REPORTS_CONSENT" };
      }

      if (message.messageType === "marketing" && !consent.marketingConsent) {
        return { enqueued: false, error: "RECIPIENT_DECLINED_MARKETING_CONSENT" };
      }
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const outboxItem: OutboxMessage = {
      id: messageId,
      recipientPhone: message.recipientPhone,
      templateName: message.templateName,
      messageType: message.messageType,
      payload: message.payload,
      status: "queued",
      createdAt: Date.now(),
    };

    this.outbox.push(outboxItem);
    return { enqueued: true, messageId };
  }

  public getOutbox(): OutboxMessage[] {
    return [...this.outbox];
  }
}

/**
 * Admin Action Audit Logging Engine
 * Implements authoritative rules from PROJECT.md § Interface Contracts #4 & GAP-36
 */
export class AdminAuditLogger {
  private logs: AdminAuditLog[] = [];

  public logAction(entry: {
    adminId: string;
    adminType: "local" | "google";
    action: string;
    targetType: string;
    targetId: string;
    details: Record<string, any>;
    ipAddress: string;
  }): AdminAuditLog {
    if (!entry.adminId || !entry.action || !entry.targetType) {
      throw new Error("Invalid audit log entry: adminId, action and targetType are mandatory");
    }

    const log: AdminAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      adminId: entry.adminId,
      adminType: entry.adminType,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      details: entry.details,
      ipAddress: entry.ipAddress,
      createdAt: Date.now(),
    };

    this.logs.push(log);
    return log;
  }

  public queryLogs(filter: { targetType?: string; targetId?: string; action?: string; adminId?: string }): AdminAuditLog[] {
    return this.logs.filter((log) => {
      if (filter.targetType && log.targetType !== filter.targetType) return false;
      if (filter.targetId && log.targetId !== filter.targetId) return false;
      if (filter.action && log.action !== filter.action) return false;
      if (filter.adminId && log.adminId !== filter.adminId) return false;
      return true;
    });
  }
}

/**
 * Ads Engine & Impression Tracker
 * Implements authoritative rules from PROJECT.md § Interface Contracts #4 & ADS-01/ADS-02
 */
export class AdsEngine {
  private campaigns: AdCampaign[] = [];
  private impressions: AdImpression[] = [];

  public addCampaign(campaign: AdCampaign): void {
    this.campaigns.push(campaign);
  }

  public getActiveAds(params: {
    platform: "android" | "ios" | "web";
    placement: AdCampaign["placement"];
    userPlan: "free" | "pro";
    userId: string;
    now?: number;
  }): AdCampaign[] {
    const now = params.now ?? Date.now();

    return this.campaigns.filter((ad) => {
      // 1. Placement match
      if (ad.placement !== params.placement) return false;

      // 2. Kill switch active
      if (ad.isKillSwitched) return false;

      // 3. Schedule window
      if (now < ad.startAt || now > ad.endAt) return false;

      // 4. Platform target
      if (ad.platformTarget !== "all" && ad.platformTarget !== params.platform) return false;

      // 5. Plan target (Pro users do NOT see ads if ad is targeted to free_only)
      if (ad.planTarget === "free_only" && params.userPlan === "pro") return false;

      // 6. Frequency capping per user/day
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      const userImpressionsToday = this.impressions.filter(
        (imp) => imp.adId === ad.id && imp.userId === params.userId && imp.recordedAt >= todayStart
      ).length;

      if (ad.frequencyCapPerDay > 0 && userImpressionsToday >= ad.frequencyCapPerDay) {
        return false;
      }

      return true;
    });
  }

  public recordImpression(entry: {
    adId: string;
    userId: string;
    placement: string;
    impressionToken: string;
    now?: number;
  }): { recorded: boolean; error?: string } {
    if (!entry.impressionToken) {
      return { recorded: false, error: "MISSING_IMPRESSION_TOKEN" };
    }

    // Deduplicate identical impression token to prevent double-counting
    const existing = this.impressions.find((imp) => imp.impressionToken === entry.impressionToken);
    if (existing) {
      return { recorded: false, error: "DUPLICATE_IMPRESSION_IGNORED" };
    }

    this.impressions.push({
      adId: entry.adId,
      userId: entry.userId,
      placement: entry.placement,
      impressionToken: entry.impressionToken,
      recordedAt: entry.now ?? Date.now(),
    });

    return { recorded: true };
  }

  public getImpressionsCount(adId: string): number {
    return this.impressions.filter((i) => i.adId === adId).length;
  }
}
