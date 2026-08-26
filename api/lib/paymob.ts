import { TRPCError } from "@trpc/server";
import { env } from "./env";
import {
  BILLING_PLANS,
  getBillingPlan,
  type BillingPlan,
} from "../../contracts/plans";

const PAYMOB_API = "https://accept.paymob.com/api";

export function isPaymobConfigured(): boolean {
  return !!(
    env.PAYMOB_API_KEY &&
    env.PAYMOB_INTEGRATION_ID &&
    env.PAYMOB_IFRAME_ID
  );
}

export function isPaymobWebhookVerificationConfigured(): boolean {
  return Boolean(env.PAYMOB_HMAC_SECRET);
}

async function paymobPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${PAYMOB_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    detail?: string;
    message?: string;
  };
  if (!res.ok) {
    const msg =
      (data as { detail?: string }).detail ||
      (data as { message?: string }).message ||
      res.statusText;
    throw new TRPCError({ code: "BAD_REQUEST", message: `Paymob: ${msg}` });
  }
  return data;
}

async function getAuthToken(): Promise<string> {
  const data = await paymobPost<{ token: string }>("/auth/tokens", {
    api_key: env.PAYMOB_API_KEY,
  });
  if (!data.token)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Paymob auth failed" });
  return data.token;
}

/**
 * Hosted iframe checkout — extra metadata flows to webhook via payment_key `extras`.
 */
export async function createPaymobHostedCheckoutUrl(params: {
  plan: BillingPlan;
  clientEmail?: string | null;
  userId: number;
  userType: "oauth" | "local";
}): Promise<string> {
  if (!isPaymobConfigured()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "بوابة الدفع غير مُكوّنة",
    });
  }

  const authToken = await getAuthToken();
  const billingPlan = getBillingPlan(params.plan);
  const amountCents = billingPlan.amountCents;

  const order = await paymobPost<{ id: number }>("/ecommerce/orders", {
    auth_token: authToken,
    delivery_needed: false,
    amount_cents: amountCents,
    currency: "EGP",
    items: [
      {
        name: billingPlan.displayName,
        amount_cents: amountCents,
        quantity: 1,
      },
    ],
    merchant_order_id: `ss_${params.userType}_${params.userId}_${Date.now()}`,
  });

  const billingData = {
    apartment: "NA",
    email: params.clientEmail || "customer@smartspend.app",
    floor: "NA",
    first_name: "SmartSpend",
    street: "NA",
    building: "NA",
    phone_number: "+201000000000",
    shipping_method: "NA",
    postal_code: "NA",
    city: "Cairo",
    country: "EG",
    last_name: "Customer",
    state: "NA",
  };

  const extras = {
    userId: params.userId,
    userType: params.userType,
    plan: params.plan,
  };

  const paymentKey = await paymobPost<{ token: string }>(
    "/acceptance/payment_keys",
    {
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: order.id,
      billing_data: billingData,
      currency: "EGP",
      integration_id: Number(env.PAYMOB_INTEGRATION_ID),
      lock_order_when_paid: true,
      extras,
    },
  );

  if (!paymentKey.token) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "تعذر إنشاء جلسة الدفع",
    });
  }

  return `https://accept.paymob.com/api/acceptance/iframes/${env.PAYMOB_IFRAME_ID}?payment_token=${paymentKey.token}`;
}

export { BILLING_PLANS };
