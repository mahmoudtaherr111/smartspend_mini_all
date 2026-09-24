/**
 * SMS AI Parser — SmartSpend
 * Extracts structured financial data from SMS messages using Gemini.
 * This is a pure Data Extraction Engine — it does NOT respond to users.
 */
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { env } from "./env";
import { mapModelName } from "./model-mapper";
import {
  condenseSmsNotification,
  cleanSmsText,
  normalizeSmsText,
} from "./sms-rule-parser";
import { createLogger } from "./log";

// A bank message is someone's balance and payees: log its length, never its text (golden rule 10).
const log = createLogger("sms-ai-parser");

// Re-export shared cleaners for external consumers
export { condenseSmsNotification, cleanSmsText, normalizeSmsText };

export interface SmsParseResult {
  transaction_detected: boolean;
  amount: number | null;
  currency: string;
  direction: "incoming" | "outgoing" | null;
  provider: "VodafoneCash" | "InstaPay" | "ApplePay" | "Bank" | "Unknown";
  category:
    | "transfer"
    | "payment"
    | "income"
    | "bills"
    | "withdrawal"
    | "unknown";
  fee: number | null;
  merchant: string | null;
  balance_after: number | null;
  confidence: number; // 0.0 → 1.0
  raw_extracted: Record<string, unknown>;
}

export type SmsUserContext = {
  userId?: number | null;
  userType?: string | null;
};

// In-memory LRU cache to store parsed results partitioned by tenant
const aiParseCache = new Map<
  string,
  { result: SmsParseResult; expiresAt: number }
>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes TTL
const MAX_CACHE_ENTRIES = 500;

function getCacheKey(
  message: string,
  userContext?: SmsUserContext,
): string {
  const prefix = `${userContext?.userType ?? "anon"}:${userContext?.userId ?? 0}`;
  return `${prefix}:${message}`;
}

function setCacheEntry(
  key: string,
  result: SmsParseResult,
): void {
  if (aiParseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = aiParseCache.keys().next().value;
    if (oldestKey !== undefined) {
      aiParseCache.delete(oldestKey);
    }
  }
  aiParseCache.set(key, {
    result,
    expiresAt: Date.now() + CACHE_TTL,
  });
}

export function clearSmsAiCache(): void {
  aiParseCache.clear();
}

export function getSmsAiCacheSize(): number {
  return aiParseCache.size;
}

const SMS_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    transaction_detected: { type: SchemaType.BOOLEAN },
    amount: { type: SchemaType.NUMBER, nullable: true },
    currency: { type: SchemaType.STRING },
    direction: { type: SchemaType.STRING, nullable: true },
    provider: { type: SchemaType.STRING },
    category: { type: SchemaType.STRING },
    fee: { type: SchemaType.NUMBER, nullable: true },
    merchant: { type: SchemaType.STRING, nullable: true },
    balance_after: { type: SchemaType.NUMBER, nullable: true },
    confidence: { type: SchemaType.NUMBER },
  },
  required: [
    "transaction_detected",
    "currency",
    "provider",
    "category",
    "confidence",
  ],
};

const SMS_SYSTEM_PROMPT = `أنت نظام خبير في استخراج البيانات المالية من رسائل SMS و الإشعارات البنكية والمحافظ الإلكترونية في مصر. 
تأتي الرسائل إما باللغة العربية الفصحى أو باللغة الإنجليزية.
مهمتك الوحيدة: استخراج البيانات بدقة متناهية وإرجاعها كـ JSON فقط بدون أي تعليق.

قواعد صارمة جداً:
1. لا ترد على المستخدم، فقط أرجع JSON.
2. إذا كانت الرسالة ليست معاملة مالية فعلية (مثل OTP، كود تفعيل، إعلان، استعلام عن رصيد بدون حركة) → transaction_detected: false
3. إذا كانت حركة مالية (خصم، إيداع، تحويل، دفع) → استخرج التفاصيل.

كيف تحدد الـ direction (الدخل والمصروف):
- [incoming / دخل]: "تم إيداع", "تم إضافة", "تم قيد", "استلمت", "وصلك", "تم تحويل...لك", "credited to", "received"
- [outgoing / مصروف]: "تم خصم", "تم سحب", "تم الدفع", "قمت بتحويل", "تم تحويل...لـ", "سحبت", "دفعت", "عملية شراء", "debited from", "purchase", "paid", "withdrawal"

أمثلة حاسمة:
- "تم إيداع مبلغ 500 جنيه في حسابك..." -> incoming
- "تم خصم مبلغ 200 جنيه من حسابك..." -> outgoing
- "استلمت 1000 جنيه من..." -> incoming
- "قمت بتحويل 1000 جنيه لـ..." -> outgoing
- "CIB: Your account has been credited with EGP 1000" -> incoming
- "CIB: Your account has been debited by EGP 1000" -> outgoing

تحديد الـ category:
- transfer (تحويل بين أشخاص)
- payment (دفع/مشتريات/POS)
- income (راتب/مكافأة)
- bills (فواتير كهرباء، غاز، انترنت، شحن)
- withdrawal (سحب نقدي من ATM)
- deposit (إيداع نقدي أو بنكي)
- unknown (غير معروف)

تحديد الـ provider:
- فودافون كاش / Vodafone Cash → "VodafoneCash"
- انستاباي / InstaPay → "InstaPay"
- أبل باي / Apple Pay → "ApplePay"
- اسم البنك (CIB, NBE, QNB, Banque Misr, Alex Bank) → "Bank"
- أخرى (اتصالات كاش, اورانج كاش, وي باي) → "Wallet"
- غير محدد → "Unknown"`;

export async function parseSmsFinancialData(
  message: string,
  userContext?: SmsUserContext,
): Promise<SmsParseResult | null> {
  const apiKey = env.GEMINI_API_KEY;
  const modelName = mapModelName("flash"); // Maps dynamically to active fast model (e.g. gemini-3.1-flash-lite)

  const trimmedMessage = message.trim();
  if (!trimmedMessage) return null;

  // 1. Condense the SMS to strip non-financial boilerplate and save 40–70% input tokens
  const condensedMessage = condenseSmsNotification(trimmedMessage);

  // 2. Check the tenant-isolated in-memory cache first to avoid duplicate token costs
  const now = Date.now();
  const rawKey = getCacheKey(trimmedMessage, userContext);
  const condensedKey = getCacheKey(condensedMessage, userContext);
  const cached = aiParseCache.get(rawKey) || aiParseCache.get(condensedKey);
  if (cached && cached.expiresAt > now) {
    log.info({ event: "sms.parse.cache_hit", length: condensedMessage.length }, "Bank message parse served from cache");
    return cached.result;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SMS_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.05, // Very low — we want deterministic extraction, not creativity
        maxOutputTokens: 512,
        responseMimeType: "application/json",
        responseSchema: SMS_RESPONSE_SCHEMA as any,
      },
    });

    const result = await model.generateContent(
      `رسالة SMS:\n"${condensedMessage}"`,
    );
    const responseText = result.response.text().trim();

    const parsed = JSON.parse(responseText) as SmsParseResult;

    const finalResult: SmsParseResult = {
      transaction_detected: parsed.transaction_detected ?? false,
      amount: parsed.amount ?? null,
      currency: parsed.currency ?? "EGP",
      direction: parsed.direction ?? null,
      provider: (parsed.provider as SmsParseResult["provider"]) ?? "Unknown",
      category: (parsed.category as SmsParseResult["category"]) ?? "unknown",
      fee: parsed.fee ?? null,
      merchant: parsed.merchant ?? null,
      balance_after: parsed.balance_after ?? null,
      confidence: parsed.confidence ?? 0,
      raw_extracted: parsed as unknown as Record<string, unknown>,
    };

    // 3. Cache the parsed result if a valid transaction is detected
    if (finalResult.transaction_detected) {
      setCacheEntry(rawKey, finalResult);
      setCacheEntry(condensedKey, finalResult);
      log.info({ event: "sms.parse.cached", length: condensedMessage.length }, "Bank message parse cached");
    }

    return finalResult;
  } catch (error: any) {
    log.error({ err: error, event: "sms.parse.failed" }, "Bank message parse failed");
    return null;
  }
}

/**
 * Maps SMS category + direction to a stored category, subcategory and type.
 * Works with both AI parser output and Rule-Based parser output.
 *
 * Every pair is one the category registry holds (it used to write "انستاباي وارد",
 * "سحب نقدي / ATM", "Apple Pay" and the merchant's name as subcategories), and cash
 * taken from an ATM is a transfer to your own pocket, not spending — counting it as
 * spending counted the same money twice once the cash was spent and recorded.
 */
export function mapSmsToExpenseCategory(result: {
  direction?: "incoming" | "outgoing" | null;
  category?: string;
  provider?: string;
  merchant?: string | null;
}): {
  category: string;
  subCategory: string;
  type: "income" | "expense" | "transfer";
} {
  const dir = result.direction;
  const cat = result.category || "unknown";
  const provider = result.provider || "Unknown";
  const type: "income" | "expense" = dir === "incoming" ? "income" : "expense";
  const rail = /InstaPay/i.test(provider)
    ? "انستاباي"
    : /Vodafone/i.test(provider)
      ? "فودافون كاش"
      : "تحويل بنكي";

  // ── INCOMING (money in) ──
  // Salary only when the message says salary; any other credit is income from a source
  // the message does not name. The rail (InstaPay, wallet) stays in the description.
  if (dir === "incoming") {
    if (cat === "income")
      return { category: "مرتب", subCategory: "مرتب أساسي", type: "income" };
    return { category: "دخل آخر", subCategory: "عام", type: "income" };
  }

  // ── OUTGOING (money out) ──
  switch (cat) {
    case "transfer":
      return { category: "تحويل", subCategory: rail, type };
    case "payment":
      // The merchant stays in the description; a card payment is not always shopping,
      // but "تسوق/عام" is the honest default until the merchant is classified.
      if (result.merchant) return { category: "تسوق", subCategory: "عام", type };
      return { category: "متنوعات", subCategory: "عام", type };
    case "bills":
      return { category: "فواتير", subCategory: "عام", type };
    case "withdrawal":
      return { category: "تحويل", subCategory: "سحب ATM", type: "transfer" };
    default:
      return { category: "متنوعات", subCategory: "عام", type };
  }
}
