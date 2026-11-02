/**
 * Entitlement State Machine Transition Engine
 * Authoritative Specifications: ORIGINAL_REQUEST.md R2 & PROJECT.md § Interface Contracts #2
 */

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
  userType: "local" | "oauth" | "google";
  status: EntitlementState;
  lastEventTime: number;
  expiresAt: number;
  gracePeriodExpiresAt?: number;
}

export interface StoreEventInput {
  platform: "android" | "ios";
  originalTxId: string;
  tokenOrTxId: string;
  productId: string;
  userId: string;
  userType: "local" | "oauth" | "google";
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
}

export interface TransitionResult {
  success: boolean;
  state: EntitlementState;
  effectivePlan: "free" | "pro" | "ultra";
  reason?: string;
}

export class EntitlementStateMachine {
  private subscriptions = new Map<string, SubscriptionRecord>();
  private processedEvents = new Set<string>();

  public getSubscription(key: string): SubscriptionRecord | undefined {
    return this.subscriptions.get(key);
  }

  public setSubscription(key: string, record: SubscriptionRecord): void {
    this.subscriptions.set(key, record);
  }

  public hasProcessedEvent(eventKey: string): boolean {
    return this.processedEvents.has(eventKey);
  }

  public markEventProcessed(eventKey: string): void {
    this.processedEvents.add(eventKey);
  }

  /**
   * Hydrates state machine from store_purchases table for restart durability (DEF-05).
   */
  public async hydrateFromDb(database?: any): Promise<number> {
    try {
      const { db } = await import("../../queries/connection");
      const { storePurchases } = await import("../../../db/schema");
      const targetDb = database ?? db;
      if (!targetDb || typeof targetDb.select !== "function") return 0;

      const rows = await targetDb.select().from(storePurchases);
      for (const row of rows) {
        const platform = row.store === "google_play" ? "android" : "ios";
        const subKey = `${platform}:${row.originalTransactionId}`;
        const status = (row.status?.toUpperCase() || "ACTIVE") as EntitlementState;
        const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : Date.now() + 30 * 24 * 60 * 60 * 1000;
        const lastEventTime = row.updatedAt
          ? new Date(row.updatedAt).getTime()
          : row.createdAt
            ? new Date(row.createdAt).getTime()
            : Date.now();

        this.subscriptions.set(subKey, {
          platform,
          originalTxId: row.originalTransactionId,
          tokenOrTxId: row.purchaseToken || row.originalTransactionId,
          productId: row.storeProductId,
          userId: String(row.userId),
          userType: (row.userType === "oauth" ? "oauth" : "local") as "local" | "oauth",
          status,
          lastEventTime,
          expiresAt,
        });

        // Hydrate processed event IDs from rawPayload
        if (row.rawPayload && typeof row.rawPayload === "object") {
          const payload = row.rawPayload as any;
          if (payload.messageId) this.processedEvents.add(String(payload.messageId));
          if (payload.notificationUUID) this.processedEvents.add(String(payload.notificationUUID));
          if (payload.verifiedTxId) this.processedEvents.add(String(payload.verifiedTxId));
          if (payload.eventId) this.processedEvents.add(String(payload.eventId));
          if (Array.isArray(payload.processedEvents)) {
            for (const ev of payload.processedEvents) this.processedEvents.add(String(ev));
          }
        }
      }
      return rows.length;
    } catch {
      return 0;
    }
  }

  public resolvePlan(productId: string, isEffective: boolean): "free" | "pro" | "ultra" {
    if (!isEffective) return "free";
    if (productId && productId.toLowerCase().includes("ultra")) {
      return "ultra";
    }
    return "pro";
  }

  public processStoreEvent(event: StoreEventInput): TransitionResult {
    const subKey = `${event.platform}:${event.originalTxId}`;
    const eventKey = event.eventId ?? `${subKey}:${event.eventType}:${event.eventTime}`;

    // 1. Idempotency Check: Replayed events must produce identical outcome without duplicate side-effects
    if (this.processedEvents.has(eventKey)) {
      const existing = this.subscriptions.get(subKey);
      if (existing) {
        const isEff = this.isEffective(existing.status, event.eventTime, existing.expiresAt);
        return {
          success: true,
          state: existing.status,
          effectivePlan: this.resolvePlan(existing.productId, isEff),
          reason: "IDEMPOTENT_REPLAY_IGNORED",
        };
      }
    }

    const current = this.subscriptions.get(subKey);

    // Prevent cross-user hijacking: do not allow a different user to claim an existing subscription key
    if (current && (String(current.userId) !== String(event.userId) || current.userType !== event.userType)) {
      if (event.userId !== "system") {
        const isEff = this.isEffective(current.status, event.eventTime, current.expiresAt);
        return {
          success: false,
          state: current.status,
          effectivePlan: this.resolvePlan(current.productId, isEff),
          reason: "CROSS_USER_HIJACKING_PREVENTED",
        };
      }
    }

    // 2. Out-of-order check: If an event has older timestamp than last processed event, reject or drop
    if (current && event.eventTime < current.lastEventTime) {
      const isEff = this.isEffective(current.status, event.eventTime, current.expiresAt);
      return {
        success: false,
        state: current.status,
        effectivePlan: this.resolvePlan(current.productId, isEff),
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

    const isEff = this.isEffective(nextState, event.eventTime, defaultExpiresAt);
    return {
      success: true,
      state: nextState,
      effectivePlan: this.resolvePlan(event.productId, isEff),
    };
  }

  /**
   * Authority on which entitlement states grant paid access:
   * ACTIVE: Yes
   * IN_GRACE_PERIOD: Yes (retained during grace window)
   * ON_HOLD: No (suspended)
   * PAUSED: No (suspended)
   * CANCELLED: Yes until expiresAt, then Free
   * EXPIRED: No
   * REFUNDED: No
   * REVOKED: No
   */
  public isEffective(state: EntitlementState, currentTime: number = Date.now(), expiresAt?: number): boolean {
    if (expiresAt && currentTime > expiresAt) {
      return false;
    }
    if (state === "ACTIVE" || state === "IN_GRACE_PERIOD") {
      return true;
    }
    if (state === "CANCELLED") {
      return expiresAt ? currentTime <= expiresAt : false;
    }
    return false;
  }

  public isProEffective(state: EntitlementState, currentTime: number = Date.now(), expiresAt?: number): boolean {
    return this.isEffective(state, currentTime, expiresAt);
  }
}

// Global singleton instance for server runtime
export const globalEntitlementStateMachine = new EntitlementStateMachine();
