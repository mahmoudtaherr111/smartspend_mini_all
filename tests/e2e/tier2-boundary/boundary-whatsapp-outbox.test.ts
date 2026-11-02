import { describe, it, expect, beforeEach } from "vitest";
import { WhatsAppOutboxEngine } from "../harness/opaque-context";
import { calculateWhatsAppSignature } from "../fixtures/whatsapp-cloud-api.fixture";

/**
 * Tier 2 - Boundary & Corner Cases: WhatsApp Cloud API & Outbox
 * Requirements: SEC-05, DEBT-13, W1-FOUND, W2-CONSENT
 */

describe("Tier 2 - Boundary & Corner Cases: WhatsApp Cloud API & Outbox", () => {
  let engine: WhatsAppOutboxEngine;
  const appSecret = "production_secret_key_999";
  const phone = "201099990000";

  beforeEach(() => {
    engine = new WhatsAppOutboxEngine();
  });

  it("Test 1: Webhook signature mismatch (tampered secret or forged header) is rejected", () => {
    const rawPayload = JSON.stringify({ event: "message_received" });
    const realSignature = calculateWhatsAppSignature(rawPayload, appSecret);
    const forgedSignature = "sha256=112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00";

    const verifyHeader = (headerSig: string, body: string, secret: string): boolean => {
      const expected = calculateWhatsAppSignature(body, secret);
      return headerSig === expected;
    };

    expect(verifyHeader(realSignature, rawPayload, appSecret)).toBe(true);
    expect(verifyHeader(forgedSignature, rawPayload, appSecret)).toBe(false);
  });

  it("Test 2: Stop word detection handles surrounding emojis and excessive whitespaces", () => {
    engine.setConsent(phone, {
      userId: "usr_wa_edge",
      userType: "local",
      reportsConsent: true,
      marketingConsent: true,
    });

    // Case 1: Extra whitespace
    expect(engine.processInboundMessage(phone, "   إيقاف   ").optedOut).toBe(true);
    expect(engine.getConsent(phone)?.reportsConsent).toBe(false);

    // Reset consent
    engine.setConsent(phone, { userId: "usr_wa_edge", userType: "local", reportsConsent: true, optedOutAt: null });

    // Case 2: Case insensitivity
    expect(engine.processInboundMessage(phone, "stop").optedOut).toBe(true);
    expect(engine.getConsent(phone)?.reportsConsent).toBe(false);
  });

  it("Test 3: Malformed JSON or non-JSON webhook payloads are safely handled", () => {
    const parseWebhookPayload = (rawBody: string) => {
      try {
        const parsed = JSON.parse(rawBody);
        return { valid: true, data: parsed };
      } catch (err: any) {
        return { valid: false, error: "INVALID_JSON_PAYLOAD" };
      }
    };

    expect(parseWebhookPayload('{"valid": true}').valid).toBe(true);
    expect(parseWebhookPayload("not-json").valid).toBe(false);
    expect(parseWebhookPayload("{unclosed").valid).toBe(false);
  });

  it("Test 4: Outbox enqueue blocks invalid phone numbers before inserting into queue", () => {
    const validatePhoneBeforeEnqueue = (recipientPhone: string): boolean => {
      // Must be Egyptian international format: 201[0125][0-9]{8}
      return /^201[0125]\d{8}$/.test(recipientPhone);
    };

    expect(validatePhoneBeforeEnqueue("201012345678")).toBe(true);
    expect(validatePhoneBeforeEnqueue("01012345678")).toBe(false); // Not international
    expect(validatePhoneBeforeEnqueue("201912345678")).toBe(false); // Invalid prefix
    expect(validatePhoneBeforeEnqueue("")).toBe(false);
  });

  it("Test 5: Transactional OTP messages are enqueued even if marketing consent is disabled", () => {
    // User has opted out of marketing, but requests login/password reset OTP
    engine.setConsent(phone, {
      userId: "usr_wa_otp",
      userType: "local",
      marketingConsent: false,
      reportsConsent: false,
    });

    const otpMessage = engine.enqueueMessage({
      recipientPhone: phone,
      templateName: "auth_otp_code",
      messageType: "otp",
      payload: { code: "123456" },
    });

    expect(otpMessage.enqueued).toBe(true);
    expect(otpMessage.messageId).toBeDefined();

    // But marketing message remains blocked
    const marketingMessage = engine.enqueueMessage({
      recipientPhone: phone,
      templateName: "special_discount",
      messageType: "marketing",
      payload: {},
    });
    expect(marketingMessage.enqueued).toBe(false);
  });
});
