import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const grantProSubscription = vi.hoisted(() => vi.fn(async () => ({ granted: true })));
vi.mock("../../api/lib/subscription-service", () => ({ grantProSubscription }));

import { app } from "../../api/boot";
import { env } from "../../api/lib/env";
import { getBillingPlan } from "../../contracts/plans";

const SECRET = "test-paymob-hmac-secret";

/** A successful, settled Paymob transaction for user 7's monthly Pro, as the callback carries it. */
function paidTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 90210,
    amount_cents: getBillingPlan("pro_monthly").amountCents,
    created_at: "2026-10-29T10:00:00.000000",
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 4242,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_voided: false,
    is_refunded: false,
    owner: 1234,
    pending: false,
    source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
    success: true,
    payment_key_claims: { extra: { userId: 7, userType: "local", plan: "pro_monthly" } },
    ...overrides,
  };
}

/** Paymob's transaction HMAC: SHA-512 over these fields in this order, written independently of the server's code. */
function sign(obj: ReturnType<typeof paidTransaction>, secret = SECRET): string {
  const source = [
    obj.amount_cents, obj.created_at, obj.currency, obj.error_occured, obj.has_parent_transaction, obj.id,
    obj.integration_id, obj.is_3d_secure, obj.is_auth, obj.is_capture, obj.is_voided, obj.is_refunded, obj.owner,
    obj.pending, obj.source_data.pan, obj.source_data.sub_type, obj.source_data.type, obj.success,
  ].map(String).join("");
  return createHmac("sha512", secret).update(source).digest("hex");
}

function callback(obj: ReturnType<typeof paidTransaction>, hmac?: string) {
  const query = hmac === undefined ? "" : `?hmac=${hmac}`;
  return app.request(`/api/webhooks/paymob${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "TRANSACTION", obj }),
  });
}

describe("the Paymob webhook", () => {
  const original = env.PAYMOB_HMAC_SECRET;
  beforeEach(() => grantProSubscription.mockClear());
  afterEach(() => {
    env.PAYMOB_HMAC_SECRET = original;
  });

  describe("without PAYMOB_HMAC_SECRET, in any environment", () => {
    beforeEach(() => {
      env.PAYMOB_HMAC_SECRET = undefined;
    });

    it("refuses an unsigned payment and grants nothing", async () => {
      const response = await callback(paidTransaction());
      expect(response.status).toBe(503);
      expect(grantProSubscription).not.toHaveBeenCalled();
    });

    it("refuses a signed one too, since nothing can check the signature", async () => {
      const obj = paidTransaction();
      const response = await callback(obj, sign(obj));
      expect(response.status).toBe(503);
      expect(grantProSubscription).not.toHaveBeenCalled();
    });
  });

  describe("with PAYMOB_HMAC_SECRET", () => {
    beforeEach(() => {
      env.PAYMOB_HMAC_SECRET = SECRET;
    });

    it("grants the plan of a correctly signed, settled payment", async () => {
      const obj = paidTransaction();
      const response = await callback(obj, sign(obj));
      expect(response.status).toBe(200);
      expect(grantProSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 7, userType: "local", plan: "pro_monthly", transactionId: "90210" }),
      );
    });

    it("refuses a payment without a signature", async () => {
      const response = await callback(paidTransaction());
      expect(response.status).toBe(401);
      expect(grantProSubscription).not.toHaveBeenCalled();
    });

    it("refuses a payment signed with another secret", async () => {
      const obj = paidTransaction();
      const response = await callback(obj, sign(obj, "someone-else"));
      expect(response.status).toBe(401);
      expect(grantProSubscription).not.toHaveBeenCalled();
    });

    it("refuses a signed payment whose fields were changed after signing", async () => {
      const obj = paidTransaction();
      const hmac = sign(obj);
      const response = await callback({ ...obj, id: 90211 }, hmac);
      expect(response.status).toBe(401);
      expect(grantProSubscription).not.toHaveBeenCalled();
    });

    it("refuses a signed payment of another amount than the plan's", async () => {
      const obj = paidTransaction({ amount_cents: 100 });
      const response = await callback(obj, sign(obj));
      expect(response.status).toBe(400);
      expect(grantProSubscription).not.toHaveBeenCalled();
    });

    it("acknowledges a pending payment without granting", async () => {
      const obj = paidTransaction({ pending: true });
      const response = await callback(obj, sign(obj));
      expect(response.status).toBe(200);
      expect(grantProSubscription).not.toHaveBeenCalled();
    });
  });
});
