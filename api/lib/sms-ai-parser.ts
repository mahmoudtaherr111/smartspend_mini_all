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

const SMS_SYSTEM_PROMPT = `أنت نظام استخراج بيانات مالية من رسائل SMS بالعربي والإنجليزي.
مهمتك الوحيدة: استخراج البيانات المالية بدقة وإرجاعها كـ JSON منظم.

قواعد صارمة:
1. لا ترد على المستخدم. لا تعلق. لا تضف أي كلام.
2. فقط أرجع JSON.
3. إذا كانت الرسالة غير مالية (إعلان، OTP، كود تفعيل) → transaction_detected: false.
4. إذا كانت مالية → استخرج كل التفاصيل.

تحديد الـ provider:
- فودافون كاش / Vodafone Cash → "VodafoneCash"
- انستاباي / InstaPay → "InstaPay"
- أبل باي / Apple Pay → "ApplePay"
- أي بنك (CIB, NBE, Banque Misr, QNB, AAIB, Alex Bank) → "Bank"
- غير محدد → "Unknown"

تحديد الـ direction:
- استلمت / تم إضافة / رصيد وارد / received → "incoming"
- صرفت / تم خصم / دفعت / sent / paid → "outgoing"

تحديد الـ category:
- تحويل بين أشخاص → "transfer"
- دفع فواتير / مدفوعات → "payment"
- استلام راتب / مكافأة / دخل → "income"
- فواتير (كهرباء, ماي, غاز, انترنت) → "bills"
- سحب أو صرف نقدي → "withdrawal"
- غير محدد → "unknown"

أمثلة على رسائل مالية:
- "تم إضافة 500 ج إلى حسابك فودافون كاش" → incoming, 500, VodafoneCash, transfer
- "تم خصم 200 جنيه رسوم فاتورة الكهرباء" → outgoing, 200, Bank, bills
- "Your account has been credited with EGP 10,000" → incoming, 10000, Bank, income`;

export async function parseSmsFinancialData(message: string): Promise<SmsParseResult | null> {
  const apiKey = env.GEMINI_API_KEY;
  const modelName = "gemini-2.0-flash"; // Fast & cheap for simple extraction

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

    const result = await model.generateContent(`رسالة SMS:\n"${message}"`);
    const responseText = result.response.text().trim();

    const parsed = JSON.parse(responseText) as SmsParseResult;

    // Ensure defaults for any missing fields
    return {
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
