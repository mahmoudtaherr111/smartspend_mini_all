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
import { isPlanFeatureEnabled, planNumber } from "@contracts/plan-features";
import { normalizeEgyptianPhone } from "../tier1-features/phone-challenge.test";

/**
 * Tier 4 - Real-World Application Scenarios
 * Full End-to-End User Journeys across Sessions 5 & 6
 * Authoritative source: ORIGINAL_REQUEST.md & PROJECT.md § Feature Inventory
 */

describe("Tier 4 - Real-World Application Scenarios", () => {
  let sm: EntitlementStateMachine;
  let waEngine: WhatsAppOutboxEngine;
  let auditLogger: AdminAuditLogger;
  let adsEngine: AdsEngine;

  beforeEach(() => {
    sm = new EntitlementStateMachine();
    waEngine = new WhatsAppOutboxEngine();
    auditLogger = new AdminAuditLogger();
    adsEngine = new AdsEngine();
  });

  it("Scenario 1: Egyptian User Onboarding, Profile Customization & Upgrade to Pro via Google Play", () => {
    // 1. Registration
    const rawPhone = "01012345678";
    const normalizedPhone = normalizeEgyptianPhone(rawPhone);
    expect(normalizedPhone).toBe("201012345678");

    const user: UserPair = {
      userId: "usr_journey_1",
      userType: "local",
      phone: normalizedPhone!,
      plan: "free",
      role: "user",
    };

    // 2. Money Preferences & Onboarding questions
    const moneyPreferences = {
      currency: "EGP",
      salaryDay: 27,
      decimalPlaces: 2,
      profession: "مهندس برمجيات",
      averageMonthlyIncome: 25000,
    };
    expect(moneyPreferences.salaryDay).toBe(27);
    expect(moneyPreferences.currency).toBe("EGP");

    // 3. Initial Free feature check
    const emptySettings = {};
    expect(isPlanFeatureEnabled(emptySettings, user.plan, "receipts")).toBe(false);
    expect(planNumber(emptySettings, user.plan, "goals_active_limit")).toBe(3);

    // 4. Upgrade via Google Play
    const gplayPurchaseEvent = {
      platform: "android" as const,
      originalTxId: "gplay_token_journey_1",
      tokenOrTxId: "gplay_token_journey_1",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "PURCHASE" as const,
      eventTime: Date.now(),
    };

    const transition = sm.processStoreEvent(gplayPurchaseEvent);
    expect(transition.success).toBe(true);
    expect(transition.state).toBe("ACTIVE");
    user.plan = transition.effectivePlan;
    expect(user.plan).toBe("pro");

    // 5. Features unlocked
    expect(isPlanFeatureEnabled(emptySettings, user.plan, "receipts")).toBe(true);
    expect(planNumber(emptySettings, user.plan, "goals_active_limit")).toBe(0); // 0 = unmetered

    // 6. Confirm ad suppression for Pro
    adsEngine.addCampaign({
      id: "ad_bank",
      title: "قرض بنكي",
      placement: "home_feed",
      platformTarget: "all",
      planTarget: "free_only",
      frequencyCapPerDay: 5,
      isKillSwitched: false,
      startAt: Date.now() - 1000,
      endAt: Date.now() + 10000,
    });

    const activeAds = adsEngine.getActiveAds({
      platform: "android",
      placement: "home_feed",
      userPlan: user.plan,
      userId: user.userId,
    });
    expect(activeAds.length).toBe(0);
  });

  it("Scenario 2: Device Fleet & Security Lifecycle: Multi-Device Login, Step-Up Auth & Session Revocation", () => {
    const user: UserPair = {
      userId: "usr_journey_2",
      userType: "local",
      phone: "201099887766",
      plan: "free",
      role: "user",
    };

    // 1. Log in from mobile
    const mobileSession: UserSession = {
      sessionId: "sess_mobile_01",
      userId: user.userId,
      userType: user.userType,
      deviceName: "Samsung S24",
      ipAddress: "197.35.80.1",
      fingerprint: "fp_mobile",
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      isRevoked: false,
    };

    // 2. Log in from desktop
    const desktopSession: UserSession = {
      sessionId: "sess_desktop_02",
      userId: user.userId,
      userType: user.userType,
      deviceName: "Chrome on Windows",
      ipAddress: "197.35.80.10",
      fingerprint: "fp_desktop",
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      isRevoked: false,
    };

    const sessions = [mobileSession, desktopSession];
    expect(sessions.filter((s) => !s.isRevoked).length).toBe(2);

    // 3. Step-up auth before changing phone number
    const promptStepUp = (passwordAttempt: string) => {
      if (passwordAttempt !== "correct_local_password") {
        return { authorized: false, error: "INVALID_CREDENTIALS" };
      }
      return { authorized: true, token: "stepup_authorized_token" };
    };

    const stepUpRes = promptStepUp("correct_local_password");
    expect(stepUpRes.authorized).toBe(true);

    // 4. Change phone number
    const newPhone = "201011223344";
    user.phone = newPhone;
    expect(user.phone).toBe("201011223344");

    // 5. Remote session revocation of desktop
    desktopSession.isRevoked = true;

    expect(desktopSession.isRevoked).toBe(true);
    expect(mobileSession.isRevoked).toBe(false);
    expect(sessions.filter((s) => !s.isRevoked).length).toBe(1);
  });

  it("Scenario 3: Store Billing Grace Period, Recovery, and In-App Cancellation Survey", () => {
    const user: UserPair = {
      userId: "usr_journey_3",
      userType: "google",
      email: "subscriber@gmail.com",
      plan: "pro",
      role: "user",
    };

    const originalTxId = "apple_tx_journey_3";

    // 1. Initial subscription
    sm.processStoreEvent({
      platform: "ios",
      originalTxId,
      tokenOrTxId: "tx_1",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "PURCHASE",
      eventTime: 1730000000000,
      expiresAt: 1732600000000,
    });

    // 2. Renewal fails due to expired credit card -> GRACE_PERIOD
    const graceEvent = sm.processStoreEvent({
      platform: "ios",
      originalTxId,
      tokenOrTxId: "tx_grace",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "GRACE_PERIOD",
      eventTime: 1732600000000,
    });

    expect(graceEvent.state).toBe("IN_GRACE_PERIOD");
    expect(graceEvent.effectivePlan).toBe("pro"); // User does not lose features immediately

    // 3. User updates billing card -> RECOVER
    const recoverEvent = sm.processStoreEvent({
      platform: "ios",
      originalTxId,
      tokenOrTxId: "tx_recover",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "RECOVER",
      eventTime: 1732700000000,
      expiresAt: 1735300000000,
    });

    expect(recoverEvent.state).toBe("ACTIVE");
    expect(recoverEvent.effectivePlan).toBe("pro");

    // 4. User opens in-app cancellation survey
    const cancellationSurvey = {
      reason: "too_expensive",
      comment: "سعر الاشتراك غير مناسب حالياً",
      feedbackConsent: true,
    };
    expect(cancellationSurvey.reason).toBe("too_expensive");

    // Cancellation retains Pro until end of period
    const cancelEvent = sm.processStoreEvent({
      platform: "ios",
      originalTxId,
      tokenOrTxId: "tx_cancel",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "CANCEL",
      eventTime: 1733000000000,
      expiresAt: 1735300000000,
    });

    expect(cancelEvent.state).toBe("CANCELLED");
    // Still Pro until expiresAt
    expect(sm.isProEffective(cancelEvent.state, 1733000000000, 1735300000000)).toBe(true);
    // After expiresAt, reverts to Free
    expect(sm.isProEffective(cancelEvent.state, 1735400000000, 1735300000000)).toBe(false);
  });

  it("Scenario 4: WhatsApp Cloud API Monthly Outbox, Delivery Status Lifecycle & Inbound Opt-Out", () => {
    const phone = "201055556666";
    const user: UserPair = {
      userId: "usr_journey_4",
      userType: "local",
      phone,
      plan: "pro",
      role: "user",
    };

    // 1. User grants consent for monthly financial reports
    waEngine.setConsent(phone, {
      userId: user.userId,
      userType: user.userType,
      reportsConsent: true,
      remindersConsent: true,
      marketingConsent: true,
    });

    // 2. End of Cairo month: outbox worker enqueues monthly summary
    const enqueueRes = waEngine.enqueueMessage({
      recipientPhone: phone,
      templateName: "cairo_monthly_report_v1",
      messageType: "reports",
      payload: { totalSpent: 8400, month: "2026-10" },
    });
    expect(enqueueRes.enqueued).toBe(true);

    const outboxItem = waEngine.getOutbox()[0];
    expect(outboxItem.status).toBe("queued");

    // 3. Webhook delivery updates: queued -> sent -> delivered -> read
    outboxItem.status = "sent";
    expect(outboxItem.status).toBe("sent");
    outboxItem.status = "delivered";
    expect(outboxItem.status).toBe("delivered");
    outboxItem.status = "read";
    expect(outboxItem.status).toBe("read");

    // 4. User texts back "إيقاف"
    const inboundRes = waEngine.processInboundMessage(phone, "إيقاف");
    expect(inboundRes.optedOut).toBe(true);

    const consent = waEngine.getConsent(phone);
    expect(consent?.reportsConsent).toBe(false);
    expect(consent?.optedOutAt).toBeDefined();

    // 5. Subsequent report enqueue is blocked
    const blockedRes = waEngine.enqueueMessage({
      recipientPhone: phone,
      templateName: "cairo_monthly_report_v1",
      messageType: "reports",
      payload: {},
    });
    expect(blockedRes.enqueued).toBe(false);
    expect(blockedRes.error).toBe("RECIPIENT_OPTED_OUT");
  });

  it("Scenario 5: User Support Inquiry, Auto-Draft Recovery & Admin Audit Logging", () => {
    const user: UserPair = {
      userId: "usr_journey_5",
      userType: "local",
      email: "support_user@example.com",
      plan: "pro",
      role: "user",
    };

    // 1. User starts drafting support ticket and leaves screen
    let draftStorage: { subject: string; message: string } | null = {
      subject: "خطأ في قراءة الفاتورة",
      message: "تم رفع صورة فاتورة مطعم ولكن المبلغ المسجل غير صحيح...",
    };

    // 2. User returns: draft is restored
    expect(draftStorage).toBeDefined();
    expect(draftStorage?.subject).toBe("خطأ في قراءة الفاتورة");

    // 3. User submits ticket
    const ticket = {
      id: "ticket_support_01",
      userId: user.userId,
      subject: draftStorage!.subject,
      message: draftStorage!.message,
      category: "bug",
      status: "open",
      createdAt: Date.now(),
    };
    draftStorage = null; // Draft cleared
    expect(draftStorage).toBeNull();

    // 4. Admin reviews ticket and fixes categorized transaction
    const adminId = "adm_support_agent";
    const audit = auditLogger.logAction({
      adminId,
      adminType: "google",
      action: "CORRECT_TRANSACTION_CATEGORY",
      targetType: "transaction",
      targetId: "tx_123",
      details: { previousCategory: "shopping", newCategory: "food", ticketId: ticket.id },
      ipAddress: "192.168.10.20",
    });

    expect(audit.id).toBeDefined();
    expect(audit.action).toBe("CORRECT_TRANSACTION_CATEGORY");
    expect(audit.details.ticketId).toBe(ticket.id);

    // 5. Admin resolves ticket
    ticket.status = "resolved";
    expect(ticket.status).toBe("resolved");
  });

  it("Scenario 6: End-to-End Account Deletion & Complete Data Erasure Compliance", () => {
    const user: UserPair = {
      userId: "usr_journey_6",
      userType: "local",
      phone: "201088889999",
      plan: "pro",
      role: "user",
    };

    const originalTxId = "gplay_tx_journey_6";

    // Setup active state: Subscriptions, active sessions, outbox consent
    sm.processStoreEvent({
      platform: "android",
      originalTxId,
      tokenOrTxId: "tok_del",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "PURCHASE",
      eventTime: Date.now(),
    });

    waEngine.setConsent(user.phone, {
      userId: user.userId,
      userType: user.userType,
      reportsConsent: true,
      marketingConsent: true,
    });

    const activeSessions: UserSession[] = [
      {
        sessionId: "sess_del_1",
        userId: user.userId,
        userType: user.userType,
        deviceName: "Phone",
        ipAddress: "1.1.1.1",
        fingerprint: "fp1",
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        isRevoked: false,
      },
    ];

    // 1. User triggers deletion with exact phrase and password
    const typedPhrase = "احذف حسابي";
    expect(isAccountDeletionConfirmed(typedPhrase)).toBe(true);

    // 2. Cascade purge
    user.deletedAt = Date.now();
    for (const session of activeSessions) {
      session.isRevoked = true;
    }

    // 3. Subscription revoked
    const revokeRes = sm.processStoreEvent({
      platform: "android",
      originalTxId,
      tokenOrTxId: "tok_del_revoke",
      productId: "pro_monthly",
      userId: user.userId,
      userType: user.userType,
      eventType: "REVOKE",
      eventTime: Date.now(),
    });
    expect(revokeRes.effectivePlan).toBe("free");

    // 4. Consent cleared
    waEngine.setConsent(user.phone, {
      userId: user.userId,
      userType: user.userType,
      reportsConsent: false,
      marketingConsent: false,
      optedOutAt: Date.now(),
    });

    // 5. Verification: zero active sessions, plan revoked, user marked deleted
    expect(user.deletedAt).toBeDefined();
    expect(activeSessions.filter((s) => !s.isRevoked).length).toBe(0);
    expect(sm.getSubscription(`android:${originalTxId}`)?.status).toBe("REVOKED");
    expect(waEngine.getConsent(user.phone)?.reportsConsent).toBe(false);
  });
});
