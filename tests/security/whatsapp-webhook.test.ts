/**
 * `/api/webhooks/whatsapp` (decision 0038): Meta subscribes it with our verify token and signs every event with the
 * app secret. Nothing unsigned reaches the code that records statuses, consent or replies.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handleWebhookEvents = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../api/lib/whatsapp/outbox", () => ({ handleWebhookEvents, processOutbox: vi.fn() }));

import { app } from "../../api/boot";
import { env } from "../../api/lib/env";

const SECRET = "test-app-secret";
const original = { secret: env.WHATSAPP_CLOUD_APP_SECRET, token: env.WHATSAPP_CLOUD_VERIFY_TOKEN };

const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "999",
      changes: [{ field: "messages", value: { statuses: [{ id: "wamid.A", status: "read", timestamp: "1761730000" }] } }],
    },
  ],
});
const signature = (raw: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

function post(raw: string, header?: string) {
  return app.request("/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", ...(header ? { "x-hub-signature-256": header } : {}) },
    body: raw,
  });
}

describe("the WhatsApp webhook", () => {
  beforeEach(() => {
    env.WHATSAPP_CLOUD_APP_SECRET = SECRET;
    env.WHATSAPP_CLOUD_VERIFY_TOKEN = "our-verify-token";
    handleWebhookEvents.mockClear();
  });
  afterEach(() => {
    env.WHATSAPP_CLOUD_APP_SECRET = original.secret;
    env.WHATSAPP_CLOUD_VERIFY_TOKEN = original.token;
  });

  it("answers Meta's subscription with the challenge, and only for our token", async () => {
    const ok = await app.request("/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=our-verify-token&hub.challenge=987654");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("987654");
    const wrong = await app.request("/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=987654");
    expect(wrong.status).toBe(403);
  });

  it("handles a signed body's events", async () => {
    const response = await post(body, signature(body));
    expect(response.status).toBe(200);
    expect(handleWebhookEvents).toHaveBeenCalledWith([
      { kind: "status", messageId: "wamid.A", status: "read", at: new Date(1761730000 * 1000) },
    ]);
  });

  it("refuses an unsigned body, a wrong signature and a body changed after signing", async () => {
    expect((await post(body)).status).toBe(401);
    expect((await post(body, signature(body, "someone-else"))).status).toBe(401);
    expect((await post(body.replace("read", "delivered"), signature(body))).status).toBe(401);
    expect(handleWebhookEvents).not.toHaveBeenCalled();
  });

  it("refuses everything while the app secret is not set", async () => {
    env.WHATSAPP_CLOUD_APP_SECRET = undefined;
    expect((await post(body, signature(body))).status).toBe(401);
    expect(handleWebhookEvents).not.toHaveBeenCalled();
  });
});
