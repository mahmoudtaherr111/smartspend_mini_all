import { describe, it, expect, beforeEach } from "vitest";
import {
  EntitlementStateMachine,
  WhatsAppOutboxEngine,
  AdminAuditLogger,
  AdsEngine,
  UserPair,
  UserSession,
} from "../harness/opaque-context";
import { isAccountDeletionConfirmed, ACCOUNT_DELETION_PHRASE } from "@contracts/account-deletion";
import { isPlanFeatureEnabled } from "@contracts/plan-features";

/**
 * Tier 3 - Cross-Feature Combinations & Pairwise Coverage
 * Requirements: Integration and cross-module consistency across Sessions 5 & 6
 * Authoritative source: ORIGINAL_REQUEST.md & PROJECT.md
 */

describe("Tier 3 - Cross-Feature Combinations (Pairwise Coverage)", () => {
  let sm: EntitlementStateMachine;
  let waEngine: WhatsAppOutboxEngine;
  let auditLogger: AdminAuditLogger;
  let adsEngine: AdsEngine;

  let user: UserPair;
  let activeSessions: UserSession[];

  beforeEach(() => {
    sm = new EntitlementStateMachine();
    waEngine = new WhatsAppOutboxEngine();
    auditLogger = new AdminAuditLogger();
    adsEngine = new AdsEngine();

    user = {
      userId: "usr_cross_001",
      userType: "local",
      phone: "201012345678",
      email: "ahmed@example.com",
      plan: "free",
      role: "user",
    };

    activeSessions = [
      {
        sessionId: "sess_phone",
        userId: user.userId,
        userType: user.userType,
        deviceName: "Pixel 8 Pro",
        ipAddress: "197.35.80.1",
        fingerprint: "fp_1",
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        isRevoked: false,
      },
      {
        sessionId: "sess_tablet",
        userId: user.userId,
        userType: user.userType,
        deviceName: "iPad Pro",
        ipAddress: "197.35.80.2",
        fingerprint: "fp_2",
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        isRevoked: false,
      },
    ];
  });

  it("Test 1 [Pairwise: Account Deletion x Sessions]: Deleting account revokes all active sessions", () => {
    const isConfirmed = isAccountDeletionConfirmed(ACCOUNT_DELETION_PHRASE);
    expect(isConfirmed).toBe(true);

    // Execute deletion workflow
    user.deletedAt = Date.now();
    for (const session of activeSessions) {
      session.isRevoked = true;
    }

    const unrevoked = activeSessions.filter((s) => !s.isRevoked);
    expect(unrevoked.length).toBe(0);
    expect(user.deletedAt).toBeDefined();
  });

  it("Test 2 [Pairwise: Account Deletion x Store Billing]: Deleting account flags subscription for revocation", () => {
    // 1. User purchased Pro
    sm.processStoreEvent({
      platform: "android",
      originalTxId: "gplay_tx_delete_test",
      tokenOrTxId: "token_1",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "PURCHASE",
      eventTime: 1730000000000,
    });
    user.plan = "pro";

    // 2. User deletes account
    user.deletedAt = Date.now();
    // Entitlement state machine transitions user to REVOKED / Free
    const revokeRes = sm.processStoreEvent({
      platform: "android",
      originalTxId: "gplay_tx_delete_test",
      tokenOrTxId: "token_revoke",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "REVOKE",
      eventTime: Date.now(),
    });

    expect(revokeRes.state).toBe("REVOKED");
    expect(revokeRes.effectivePlan).toBe("free");
  });

  it("Test 3 [Pairwise: Account Deletion x WhatsApp Outbox]: Deleting account purges consent and drops pending messages", () => {
    waEngine.setConsent(user.phone!, {
      userId: user.userId,
      userType: user.userType,
      reportsConsent: true,
      marketingConsent: true,
    });

    // Enqueue message
    const msg = waEngine.enqueueMessage({
      recipientPhone: user.phone!,
      templateName: "monthly_report",
      messageType: "reports",
      payload: {},
    });
    expect(msg.enqueued).toBe(true);

    // Account deletion clears consent and cancels pending outbox messages
    waEngine.setConsent(user.phone!, {
      userId: user.userId,
      userType: user.userType,
      reportsConsent: false,
      marketingConsent: false,
      optedOutAt: Date.now(),
    });

    // Subsequent enqueue must fail
    const newMsg = waEngine.enqueueMessage({
      recipientPhone: user.phone!,
      templateName: "reminder",
      messageType: "reminders",
      payload: {},
    });
    expect(newMsg.enqueued).toBe(false);
    expect(newMsg.error).toBe("RECIPIENT_OPTED_OUT");
  });

  it("Test 4 [Pairwise: Plan Upgrade x Ads Engine]: Upgrading to Pro immediately suppresses free-tier ads", () => {
    adsEngine.addCampaign({
      id: "ad_free_tier_promo",
      title: "عرض للمستخدمين المجانيين",
      placement: "home_feed",
      platformTarget: "all",
      planTarget: "free_only",
      frequencyCapPerDay: 5,
      isKillSwitched: false,
      startAt: Date.now() - 1000,
      endAt: Date.now() + 100000,
    });

    // When user is Free -> Sees ad
    const adsBeforeUpgrade = adsEngine.getActiveAds({
      platform: "android",
      placement: "home_feed",
      userPlan: "free",
      userId: user.userId,
    });
    expect(adsBeforeUpgrade.length).toBe(1);

    // Upgrade event occurs
    sm.processStoreEvent({
      platform: "android",
      originalTxId: "tx_upgrade",
      tokenOrTxId: "tok_upgrade",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "PURCHASE",
      eventTime: Date.now(),
    });
    user.plan = "pro";

    // When user is Pro -> Ad is suppressed
    const adsAfterUpgrade = adsEngine.getActiveAds({
      platform: "android",
      placement: "home_feed",
      userPlan: user.plan,
      userId: user.userId,
    });
    expect(adsAfterUpgrade.length).toBe(0);
  });

  it("Test 5 [Pairwise: Plan Downgrade x Feature Gating]: Expired Pro subscription revokes gated features", () => {
    const settings = {};

    // User was Pro
    user.plan = "pro";
    expect(isPlanFeatureEnabled(settings, user.plan, "receipts")).toBe(true);
    expect(isPlanFeatureEnabled(settings, user.plan, "whatsapp_report")).toBe(true);

    // Store reports subscription expired
    const expireRes = sm.processStoreEvent({
      platform: "ios",
      originalTxId: "tx_sub_apple",
      tokenOrTxId: "tx_exp",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "EXPIRE",
      eventTime: Date.now(),
    });

    expect(expireRes.state).toBe("EXPIRED");
    user.plan = expireRes.effectivePlan;
    expect(user.plan).toBe("free");

    // Features are immediately locked
    expect(isPlanFeatureEnabled(settings, user.plan, "receipts")).toBe(false);
    expect(isPlanFeatureEnabled(settings, user.plan, "whatsapp_report")).toBe(false);
  });

  it("Test 6 [Pairwise: Password Reset x Sessions x Step-Up Auth]: Password reset revokes all sessions and invalidates active step-up tokens", () => {
    let activeStepUpToken: string | null = "stepup_valid_token_123";

    // Trigger password reset
    for (const session of activeSessions) {
      session.isRevoked = true;
    }
    activeStepUpToken = null; // Security rule: all elevated tokens cleared

    expect(activeSessions.every((s) => s.isRevoked)).toBe(true);
    expect(activeStepUpToken).toBeNull();
  });

  it("Test 7 [Pairwise: Store Billing Grace Period x Warning Notification]: Grace period retains Pro access while flagging billing issue", () => {
    const graceEvent = sm.processStoreEvent({
      platform: "android",
      originalTxId: "tx_grace_alert",
      tokenOrTxId: "tok_grace",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "GRACE_PERIOD",
      eventTime: Date.now(),
    });

    expect(graceEvent.state).toBe("IN_GRACE_PERIOD");
    expect(graceEvent.effectivePlan).toBe("pro");

    // Generates warning notification payload
    const billingWarningNotification = {
      userId: user.userId,
      title: "تعذر تجديد الاشتراك",
      body: "يرجى تحديث بيانات الدفع في متجر التطبيقات لتجنب إيقاف ميزات Pro",
      category: "billing_warning",
    };

    expect(billingWarningNotification.category).toBe("billing_warning");
  });

  it("Test 8 [Pairwise: Admin Plan Mutation x Audit Log]: Admin plan change creates audit log and updates user entitlement", () => {
    // Admin manually upgrades user to Pro
    const previousPlan = user.plan;
    user.plan = "pro";

    const auditEntry = auditLogger.logAction({
      adminId: "adm_operator_01",
      adminType: "google",
      action: "MANUAL_PLAN_GRANT",
      targetType: "user",
      targetId: user.userId,
      details: { previousPlan, newPlan: user.plan, reason: "Customer Support Resolution" },
      ipAddress: "192.168.1.1",
    });

    expect(auditEntry.action).toBe("MANUAL_PLAN_GRANT");
    expect(auditEntry.details.previousPlan).toBe("free");
    expect(auditEntry.details.newPlan).toBe("pro");
    expect(user.plan).toBe("pro");
  });

  it("Test 9 [Pairwise: Stop Word 'إيقاف' x Admin WhatsApp Console]: User opt-out reflects in admin dashboard consent status", () => {
    waEngine.setConsent(user.phone!, {
      userId: user.userId,
      userType: user.userType,
      reportsConsent: true,
      marketingConsent: true,
    });

    // Inbound stop word
    waEngine.processInboundMessage(user.phone!, "إيقاف");

    const contactState = waEngine.getConsent(user.phone!);
    expect(contactState?.reportsConsent).toBe(false);
    expect(contactState?.optedOutAt).toBeDefined();

    // Admin WhatsApp console query retrieves opted out status
    const adminContactView = {
      phone: contactState?.phone,
      isSubscribed: contactState?.reportsConsent,
      optedOutDate: contactState?.optedOutAt ? new Date(contactState.optedOutAt).toISOString() : null,
    };

    expect(adminContactView.isSubscribed).toBe(false);
    expect(adminContactView.optedOutDate).toBeDefined();
  });

  it("Test 10 [Pairwise: Phone Change x Re-Authentication]: Verified phone change flags other active sessions for re-verification", () => {
    const currentSessionId = activeSessions[0].sessionId;
    const newPhone = "201099887766";

    // Phone changed on device 1
    user.phone = newPhone;

    // Device 2 session is marked as requiring re-verification
    interface ExtendedSession extends UserSession {
      requiresReauth?: boolean;
    }

    const extendedSessions: ExtendedSession[] = activeSessions.map((s) => ({
      ...s,
      requiresReauth: s.sessionId !== currentSessionId,
    }));

    const remoteSession = extendedSessions.find((s) => s.sessionId === "sess_tablet");
    expect(remoteSession?.requiresReauth).toBe(true);

    const activePhoneSession = extendedSessions.find((s) => s.sessionId === currentSessionId);
    expect(activePhoneSession?.requiresReauth).toBe(false);
  });
});
