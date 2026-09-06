import { z } from "zod";
import {
  captureChannelSchema,
  type CaptureDraft,
  type CaptureEvent,
} from "../../contracts/financial-capture";
import { paymentPurpose } from "./payment-purpose";

export const notificationInputSchema = z.object({
  message: z.string().trim().min(5).max(12000),
  sender: z.string().trim().max(100).optional(),
  timestamp: z.iso.datetime({ offset: true }).optional(),
  source: z
    .enum([
      "android_notification",
      "android_notification_retry",
      "ios_shortcut",
      "ios_transaction",
      "sms",
    ])
    .optional(),
  eventId: z.string().min(1).max(120).optional(),
  packageName: z.string().max(150).optional(),
});
export type NotificationInput = z.infer<typeof notificationInputSchema>;
export function normalizeFinancialSource(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}
type MoneyMention = {
  amount: number;
  currency: string;
  role: "amount" | "balance" | "fee";
  index: number;
  raw: string;
};
const MONEY =
  /(?:(EGP|USD|EUR|GBP|SAR|AED|LE|L\.E\.)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)|([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(جنيه|ج\.م\.?|جم|دولار|يورو|ريال|درهم|EGP|USD|EUR|GBP|SAR|AED|LE))(?![\d,]|\.\d)/gi;
const CURRENCIES: Record<string, string> = {
  جنيه: "EGP",
  "ج.م": "EGP",
  جم: "EGP",
  LE: "EGP",
  "L.E": "EGP",
  دولار: "USD",
  يورو: "EUR",
  ريال: "SAR",
  درهم: "AED",
};

export function financialMoneyMentions(raw: string): MoneyMention[] {
  const text = normalizeFinancialSource(raw);
  return [...text.matchAll(MONEY)].flatMap((m) => {
    // Do not match a suffix of an account, malformed decimal or malformed grouping.
    if (m.index > 0 && /[\d.,]/.test(text[m.index - 1])) return [];
    const number = (m[2] || m[3]).replace(/,/g, "");
    const unit = (m[1] || m[4]).toUpperCase().replace(/\.$/, "");
    const amount = Number(number);
    if (!Number.isFinite(amount) || amount > 999_999_999) return [];
    const prefix =
      text
        .slice(Math.max(0, m.index - 55), m.index)
        .split(/[;\n،]/)
        .pop() || "";
    const role =
      /(?:balance|bal\.?|available(?:\s+limit)?|credit limit|الحد الائتماني|الرصيد|رصيد\S*(?:\s+\S+){0,3})[\s:=-]*$/i.test(
        prefix,
      )
        ? "balance"
        : /(?:fees?|charges?|رسوم(?:\s+العمليه)?|مصاريف(?:\s+الخدمه)?)[\s:=-]*$/i.test(
              prefix,
            )
          ? "fee"
          : "amount";
    return [
      {
        amount,
        currency: CURRENCIES[unit] || unit,
        role,
        index: m.index,
        raw: m[0],
      },
    ];
  });
}

/** Interpretation of the source, before condensation or any model. No claim of bank-template certification. */
export function notificationToDraft(
  input: NotificationInput,
  receivedAt = new Date().toISOString(),
): CaptureDraft {
  const text = normalizeFinancialSource(input.message);
  const channel = captureChannelSchema.parse(
    input.source?.startsWith("android")
      ? "android_notification"
      : input.source?.startsWith("ios")
        ? "ios_shortcut"
        : "sms",
  );
  const draft: CaptureDraft = {
    schemaVersion: 1,
    channel,
    sourceText: input.message,
    receivedAt,
    events: [],
    issues: [],
    ignoredReason: null,
    businessId: null,
    sourceMetadata: { sender: input.sender },
  };
  const otp =
    /\b(?:otp|one[ -]time password|verification code|activation code|passcode)\b|(?:كود|رمز|الرقم|الرقم السري)\s*(?:التحقق|التفعيل|السري)|كلمه (?:المرور|السر)/i.test(
      text,
    );
  if (otp)
    return {
      ...draft,
      sourceText: "",
      ignoredReason: "sensitive_authentication",
    };
  if (
    /\b(?:when you|enjoy|offer|eligible|up to)\b|(?:استمتع|عرض حصري|عند الشراء|عند الدفع)/i.test(
      text,
    ) &&
    !/\b(?:was paid|was debited|has been debited|completed|renewed)\b|تم (?:خصم|دفع|سداد|تحويل|سحب)/i.test(
      text,
    )
  )
    return { ...draft, ignoredReason: "promotion" };
  const rejected =
    /\b(?:declined|rejected|failed|unsuccessful)\b|(?:تم رفض|مرفوض|فشلت|لم تتم|لم يتم)/i.test(
      text,
    );
  const pending =
    /\b(?:pending|processing|pre[ -]?authori[sz]|hold|payment request)\b|قيد (?:التنفيذ|المعالج)|طلب دفع|مبلغ محجوز/i.test(
      text,
    );
  const refunded =
    /\b(?:refund(?:ed)?|reversal|reversed)\b|(?:تم (?:رد|استرداد)|استرجاع|مرتجع)/i.test(
      text,
    );
  const money = financialMoneyMentions(text);
  const amounts = money.filter((m) => m.role === "amount" && m.amount > 0);
  const transfer =
    /\b(?:transfer(?:red)?|remittance|ipn)\b|تحويل|حولت|استلمت/i.test(text);
  const purchase =
    /\b(?:purchased?|paid|payment|spent|debited)\b|(?:تم خصم|تم دفع|وخصم|شراء|مشتريات|سداد|شحنت)/i.test(
      text,
    ) ||
    (/\b(?:credit|debit|prepaid) card\b/i.test(text) &&
      /\bsuccessful transaction\b/i.test(text));
  const income = /\b(?:salary|payroll)\b|مرتب|راتب/i.test(text);
  const movement =
    purchase ||
    income ||
    transfer ||
    refunded ||
    /\b(?:withdrawal|withdrawn|deposited|credited)\b|سحب|ايداع|اضافه/i.test(
      text,
    );
  if (!movement && !pending && !rejected && !amounts.length)
    return { ...draft, ignoredReason: "not_a_payment" };
  const futureMovement =
    /\b(?:will|may)\s+(?:be\s+)?(?:credited|debited|refunded|reversed|paid|deducted|charged)\b|\bscheduled\s+(?:payment|transfer)\b|\bpayment[^.;\n]{0,60}\bis\s+due\b|(?:سيتم|سوف)\s+(?:رد|استرداد|خصم|دفع|تحويل|سحب)/i.test(
      text,
    );
  const status: CaptureEvent["status"] =
    pending || futureMovement
      ? "pending"
      : refunded
        ? "realized"
        : rejected
          ? "rejected"
          : movement
            ? "realized"
            : "unknown";
  let kind: CaptureEvent["kind"] = refunded
    ? "refund"
    : income
      ? "income"
      : transfer
        ? "transfer"
        : purchase
          ? "expense"
          : "unknown";
  // An incoming credit or ATM withdrawal alone is not evidence of earned income / consumption.
  if (
    /\b(?:withdrawal|withdrawn|deposited)\b|سحب نقدي|ايداع/i.test(text) &&
    !income
  )
    kind = "unknown";
  const merchant =
    /(?:\bat\b|\bmerchant\s*:|لدي|عند)\s+(.{2,100}?)(?=\s+(?:(?:on|for|available|balance)\b|(?:بتاريخ|رصيد|الرصيد)(?=\s))|[;\n،]|\.\s+(?=[A-Z])|$)/i
      .exec(text)?.[1]
      ?.trim()
      .replace(/[.;،]+$/g, "") || null;
  const hasTextDate = /\d{1,4}[/-]\d{1,2}|\b(?:on|date)\b|بتاريخ/i.test(text);
  const purpose = paymentPurpose(merchant, text);
  const time = hasTextDate ? null : input.timestamp || null; // A missing year/timezone is a question, never a silently invented date.
  draft.events.push({
    id: "event-1",
    description: (merchant || input.sender || "عملية من إشعار").slice(0, 200),
    amount: amounts.length === 1 ? amounts[0].amount : null,
    currency: amounts.length === 1 ? amounts[0].currency : null,
    occurredAt: time,
    kind,
    category: kind === "expense" ? purpose.category : null,
    subCategory: kind === "expense" ? purpose.subCategory : null,
    billingContext: purpose.billingContext,
    merchant,
    status,
    evidence: input.message.slice(0, 5000),
    issues: [
      ...(amounts.length > 1 ? ["multiple_amounts"] : []),
      ...(money.some((m) => m.role === "fee" && m.amount > 0)
        ? ["fee_requires_reconciliation"]
        : []),
    ],
  });
  if (/\.\.\.|…|see more|عرض المزيد/i.test(text))
    draft.issues.push("source_truncated");
  return draft;
}
