import { TRPCError } from "@trpc/server";
import { env } from "./env";

export function isPaymobConfigured(): boolean {
  return !!(env.PAYMOB_API_KEY && env.PAYMOB_INTEGRATION_ID && env.PAYMOB_IFRAME_ID);
}

/**
 * Placeholder for the full Paymob unified-checkout flow (auth token → order → payment_key → iframe URL).
 * Wire this once production API keys are available.
 */
export async function createPaymobHostedCheckoutUrl(_params: {
  plan: "pro_monthly" | "pro_yearly";
  clientEmail?: string | null;
}): Promise<string> {
  if (!isPaymobConfigured()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "بوابة الدفع غير مُكوّنة" });
  }
  throw new TRPCError({
    code: "NOT_IMPLEMENTED",
    message:
      "تدفق Paymob الكامل لم يُفعّل بعد. أضف منطق تسجيل الأوردر وpayment_key ثم أعد المحاولة، أو فعّل BILLING_SIMULATE للتجربة.",
  });
}
