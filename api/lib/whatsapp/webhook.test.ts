import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hasValidSignature, isOptOut, parseWebhook, subscriptionChallenge } from "./webhook";

describe("subscribing the webhook", () => {
  it("echoes the challenge only for our verify token", () => {
    const query = { mode: "subscribe", token: "our-token", challenge: "1158201444" };
    expect(subscriptionChallenge(query, "our-token")).toBe("1158201444");
    expect(subscriptionChallenge({ ...query, token: "guess" }, "our-token")).toBeNull();
    expect(subscriptionChallenge({ ...query, mode: "unsubscribe" }, "our-token")).toBeNull();
    expect(subscriptionChallenge(query, undefined)).toBeNull();
  });
});

describe("the signature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const sign = (raw: string, secret: string) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

  it("must be the app secret's HMAC of the raw body", () => {
    expect(hasValidSignature(body, sign(body, "app-secret"), "app-secret")).toBe(true);
    expect(hasValidSignature(body, sign(body, "other"), "app-secret")).toBe(false);
    expect(hasValidSignature(`${body} `, sign(body, "app-secret"), "app-secret")).toBe(false);
    expect(hasValidSignature(body, undefined, "app-secret")).toBe(false);
    expect(hasValidSignature(body, sign(body, "app-secret").replace("sha256=", "sha1="), "app-secret")).toBe(false);
  });

  it("is never accepted without a secret", () => {
    expect(hasValidSignature(body, sign(body, ""), undefined)).toBe(false);
  });
});

const wrap = (value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "999", changes: [{ field: "messages", value: { messaging_product: "whatsapp", ...value } }] }],
});

describe("reading events", () => {
  it("reads statuses with their failure code and pricing category", () => {
    const events = parseWebhook(
      wrap({
        statuses: [
          { id: "wamid.A", status: "delivered", timestamp: "1761730000", pricing: { category: "authentication" } },
          { id: "wamid.B", status: "failed", timestamp: "1761730001", errors: [{ code: 131026, title: "Message undeliverable" }] },
          { id: "wamid.C", status: "deleted", timestamp: "1761730002" },
        ],
      }),
    );
    expect(events).toEqual([
      { kind: "status", messageId: "wamid.A", status: "delivered", at: new Date(1761730000 * 1000), pricingCategory: "authentication" },
      { kind: "status", messageId: "wamid.B", status: "failed", at: new Date(1761730001 * 1000), errorCode: 131026 },
    ]);
  });

  it("reads a message from a visible number", () => {
    const [event] = parseWebhook(
      wrap({
        contacts: [{ wa_id: "201012345678", profile: { name: "Mona" } }],
        messages: [{ id: "wamid.IN", from: "201012345678", timestamp: "1761730100", type: "text", text: { body: "إيقاف" } }],
      }),
    );
    expect(event).toEqual({
      kind: "inbound",
      messageId: "wamid.IN",
      at: new Date(1761730100 * 1000),
      phone: "201012345678",
      text: "إيقاف",
    });
  });

  it("reads a message from someone who hides their number behind a username", () => {
    const [event] = parseWebhook(
      wrap({
        contacts: [{ user_id: "EG.13491208655302741918", profile: { name: "Mona" } }],
        messages: [{ id: "wamid.U", from_user_id: "EG.13491208655302741918", timestamp: "1761730200", type: "text", text: { body: "hi" } }],
      }),
    );
    expect(event).toMatchObject({ kind: "inbound", bsuid: "EG.13491208655302741918", text: "hi" });
    expect(event).not.toHaveProperty("phone");
  });

  it("skips what it does not understand instead of failing", () => {
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ entry: [{ changes: [{ field: "account_update", value: {} }] }] })).toEqual([]);
    expect(parseWebhook(wrap({ messages: [{ from: "201012345678" }] }))).toEqual([]);
  });
});

describe("stop words", () => {
  it("withdraw marketing consent when sent alone, in Arabic or English", () => {
    for (const word of ["إيقاف", "ايقاف", " STOP ", "Unsubscribe", "إلغاء الاشتراك", "وقف"]) expect(isOptOut(word), word).toBe(true);
    for (const text of ["وقفت العربية", "stop sending me reports please", "", undefined]) expect(isOptOut(text), String(text)).toBe(false);
  });
});
