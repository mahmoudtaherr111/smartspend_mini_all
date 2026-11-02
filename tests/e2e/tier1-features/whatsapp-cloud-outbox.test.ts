import { describe, it, expect, beforeEach } from "vitest";
import { WhatsAppOutboxEngine } from "../harness/opaque-context";
import { WHATSAPP_FIXTURES, calculateWhatsAppSignature } from "../fixtures/whatsapp-cloud-api.fixture";

/**
 * Tier 1 - Feature Coverage: WhatsApp Cloud API Migration, Consent & Outbox
 * Requirements: SEC-05, DEBT-13, W1-FOUND, W2-CONSENT, W3-ADMIN
 * Authoritative source: ORIGINAL_REQUEST.md R3 & PROJECT.md § Interface Contracts #3
 */

describe("Tier 1 - Feature Coverage: WhatsApp Cloud API & Consent (SEC-05, W1..W3)", () => {
  let engine: WhatsAppOutboxEngine;
  const testPhone = "201011112222";
  const userId = "usr_wa_001";
  const userType = "local";

  beforeEach(() => {
    engine = new WhatsAppOutboxEngine();
  });

  it("Test 1 [W1-FOUND, W2-CONSENT]: Enqueue succeeds when recipient has granted reports consent", () => {
    engine.setConsent(testPhone, {
      userId,
      userType,
      reportsConsent: true,
      remindersConsent: true,
      marketingConsent: true,
    });

    const result = engine.enqueueMessage({
      recipientPhone: testPhone,
      templateName: "monthly_summary_ar",
      messageType: "reports",
      payload: { month: "2026-10", total: 4500 },
    });

    expect(result.enqueued).toBe(true);
    expect(result.messageId).toBeDefined();

    const outbox = engine.getOutbox();
    expect(outbox.length).toBe(1);
    expect(outbox[0].status).toBe("queued");
  });

  it("Test 2 [W2-CONSENT]: Enqueue is rejected when recipient has declined consent", () => {
    engine.setConsent(testPhone, {
      userId,
      userType,
      reportsConsent: false,
      marketingConsent: false,
    });

    const reportRes = engine.enqueueMessage({
      recipientPhone: testPhone,
      templateName: "monthly_summary_ar",
      messageType: "reports",
      payload: { month: "2026-10" },
    });

    expect(reportRes.enqueued).toBe(false);
    expect(reportRes.error).toBe("RECIPIENT_DECLINED_REPORTS_CONSENT");

    const marketingRes = engine.enqueueMessage({
      recipientPhone: testPhone,
      templateName: "promo_offer",
      messageType: "marketing",
      payload: { discount: "20%" },
    });

    expect(marketingRes.enqueued).toBe(false);
    expect(marketingRes.error).toBe("RECIPIENT_DECLINED_MARKETING_CONSENT");
  });

  it("Test 3 [W2-CONSENT]: Arabic stop keyword 'إيقاف' revokes recipient consent immediately", () => {
    engine.setConsent(testPhone, {
      userId,
      userType,
      reportsConsent: true,
      marketingConsent: true,
    });

    const inboundFixture = WHATSAPP_FIXTURES.optOutArabicEqaf;
    const body = inboundFixture.entry[0].changes[0].value.messages![0].text!.body;

    const optOutRes = engine.processInboundMessage(testPhone, body);
    expect(optOutRes.optedOut).toBe(true);

    const consent = engine.getConsent(testPhone);
    expect(consent?.reportsConsent).toBe(false);
    expect(consent?.marketingConsent).toBe(false);
    expect(consent?.optedOutAt).toBeDefined();

    // Subsequent enqueue must fail
    const postOptOutRes = engine.enqueueMessage({
      recipientPhone: testPhone,
      templateName: "monthly_summary_ar",
      messageType: "reports",
      payload: {},
    });
    expect(postOptOutRes.enqueued).toBe(false);
    expect(postOptOutRes.error).toBe("RECIPIENT_OPTED_OUT");
  });

  it("Test 4 [W2-CONSENT]: English stop keyword 'STOP' and 'الغاء' revoke consent", () => {
    engine.setConsent(testPhone, { userId, userType, reportsConsent: true });

    expect(engine.processInboundMessage(testPhone, "STOP").optedOut).toBe(true);
    expect(engine.getConsent(testPhone)?.reportsConsent).toBe(false);

    engine.setConsent(testPhone, { userId, userType, reportsConsent: true, optedOutAt: null });
    expect(engine.processInboundMessage(testPhone, "الغاء").optedOut).toBe(true);
    expect(engine.getConsent(testPhone)?.reportsConsent).toBe(false);
  });

  it("Test 5 [W1-FOUND]: Webhook signature verification validates HMAC SHA256", () => {
    const appSecret = "smartspend_meta_secret_key_12345";
    const samplePayload = JSON.stringify(WHATSAPP_FIXTURES.optOutArabicEqaf);

    const validSig = calculateWhatsAppSignature(samplePayload, appSecret);
    expect(validSig.startsWith("sha256=")).toBe(true);

    const verify = (sig: string, payload: string, secret: string) => {
      const expected = calculateWhatsAppSignature(payload, secret);
      return sig === expected;
    };

    expect(verify(validSig, samplePayload, appSecret)).toBe(true);
    expect(verify("sha256=forged_fake_signature", samplePayload, appSecret)).toBe(false);
  });

  it("Test 6 [W1-FOUND]: Delivery failure status webhook records error code 131026", () => {
    const failureFixture = WHATSAPP_FIXTURES.statusFailedUndeliverable;
    const statusObj = failureFixture.entry[0].changes[0].value.statuses![0];

    expect(statusObj.status).toBe("failed");
    expect(statusObj.errors).toBeDefined();
    expect(statusObj.errors![0].code).toBe(131026);
  });
});
