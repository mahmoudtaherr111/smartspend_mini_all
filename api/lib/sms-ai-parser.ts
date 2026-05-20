/**
 * SMS AI Parser — SmartSpend
 * Extracts structured financial data from SMS messages using Gemini.
 * This is a pure Data Extraction Engine — it does NOT respond to users.
 */
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { env } from "./env";

export interface SmsParseResult {
  transaction_detected: boolean;
  amount: number | null;
  currency: string;
  direction: "incoming" | "outgoing" | null;
  provider: "VodafoneCash" | "InstaPay" | "ApplePay" | "Bank" | "Unknown";
  category: "transfer" | "payment" | "income" | "bills" | "withdrawal" | "unknown";
  fee: number | null;
  merchant: string | null;
  balance_after: number | null;
  confidence: number; // 0.0 → 1.0
  raw_extracted: Record<string, unknown>;
}

// Simple in-memory cache to store parsed results and avoid duplicate external AI calls for identical notifications
const aiParseCache = new Map<string, { result: SmsParseResult; expiresAt: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes TTL

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
  required: ["transaction_detected", "currency", "provider", "category", "confidence"],
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

export async function parseSmsFinancialData(message: string): Promise<SmsParseResult | null> {
  const apiKey = env.GEMINI_API_KEY;
  const modelName = "gemini-2.0-flash"; // Fast & cheap for simple extraction

  const trimmedMessage = message.trim();

  // 1. Check the in-memory cache first to avoid duplicate token costs
  const now = Date.now();
  const cached = aiParseCache.get(trimmedMessage);
  if (cached && cached.expiresAt > now) {
    console.log(`[SMS AI Parser] Cache HIT for message: "${trimmedMessage.slice(0, 50)}..."`);
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

    const result = await model.generateContent(`رسالة SMS:\n"${trimmedMessage}"`);
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

    // 2. Cache the parsed result if a valid transaction is detected
    if (finalResult.transaction_detected) {
      aiParseCache.set(trimmedMessage, {
        result: finalResult,
        expiresAt: Date.now() + CACHE_TTL,
      });
      console.log(`[SMS AI Parser] Cache SET for message: "${trimmedMessage.slice(0, 50)}..."`);
    }

    return finalResult;
  } catch (error: any) {
    console.error("[SMS AI Parser] Error:", error?.message ?? error);
    return null;
  }
}

/**
 * Maps SMS category + direction to SmartSpend expense categories.
 * Works with both AI parser output and Rule-Based parser output.
 */
export function mapSmsToExpenseCategory(result: {
  direction?: "incoming" | "outgoing" | null;
  category?: string;
  provider?: string;
  merchant?: string | null;
}): {
  category: string;
  subCategory: string;
  type: "income" | "expense";
} {
  const dir = result.direction;
  const cat = result.category || "unknown";
  const provider = result.provider || "Unknown";
  const type: "income" | "expense" = dir === "incoming" ? "income" : "expense";

  // ── INCOMING (money in) ──
  if (dir === "incoming") {
    if (cat === "income") return { category: "مرتب", subCategory: "راتب أساسي", type: "income" };
    if (cat === "deposit") {
      if (/InstaPay/i.test(provider)) return { category: "تحويل", subCategory: "انستاباي وارد", type: "income" };
      if (/Vodafone|Etisalat|Orange|WE/i.test(provider)) return { category: "تحويل", subCategory: "محفظة إلكترونية وارد", type: "income" };
      return { category: "تحويل", subCategory: "إيداع بنكي", type: "income" };
    }
    return { category: "تحويل", subCategory: "دخل وارد", type: "income" };
  }

  // ── OUTGOING (money out) ──
  switch (cat) {
    case "transfer":
      if (/InstaPay/i.test(provider)) return { category: "تحويل", subCategory: "انستاباي صادر", type };
      if (/Vodafone|Etisalat|Orange|WE/i.test(provider)) return { category: "تحويل", subCategory: "محفظة إلكترونية صادر", type };
      return { category: "تحويل", subCategory: "تحويل بنكي", type };
    case "payment":
      if (/ApplePay/i.test(provider)) return { category: "متنوعات", subCategory: "Apple Pay", type };
      if (result.merchant) return { category: "تسوق", subCategory: result.merchant.slice(0, 50), type };
      return { category: "متنوعات", subCategory: "مدفوعات", type };
    case "bills":
      return { category: "فواتير", subCategory: "فواتير ومرافق", type };
    case "withdrawal":
      return { category: "متنوعات", subCategory: "سحب نقدي / ATM", type };
    default:
      return { category: "متنوعات", subCategory: "عام", type };
  }
}
