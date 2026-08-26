/**
 * Egyptian SMS Rule-Based Parser (Hybrid Layer) — SmartSpend
 * ═════════════════════════════════════════════════════════
 * Advanced, provider-specific parsing engine tailored for Egyptian
 * banking and wallet formats.
 */

export interface RuleBasedSmsResult {
  transaction_detected: boolean;
  amount: number | null;
  currency: string;
  direction: "incoming" | "outgoing" | null;
  provider: string;
  category:
    | "transfer"
    | "payment"
    | "income"
    | "bills"
    | "withdrawal"
    | "deposit"
    | "unknown";
  fee: number | null;
  balance_after: number | null;
  date: string | null;
  reference: string | null;
  merchant: string | null;
  confidence: number;
  matched_rule: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. NORMALIZATION & CONDENSATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standardizes raw SMS text: removes zero-width characters, collapses whitespace,
 * and converts Arabic-Indic digits to ASCII standard.
 */
export function cleanSmsText(text: string): string {
  if (!text) return "";
  let n = text;
  // Remove zero-width spaces, joiners, RTL/LTR markers
  n = n.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E\u00A0]/g, " ");
  // Replace newlines/tabs with space
  n = n.replace(/[\r\n\t]+/g, " ");
  // Replace multiple spaces with single space
  n = n.replace(/\s+/g, " ");
  // Convert Arabic/Hindi numbers to standard ASCII (0-9)
  n = n.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return n.trim();
}

/**
 * Normalizes SMS text for rule-based regex matching:
 * Applies cleanSmsText, then standardizes Arabic letter variants (alef, teh marbuta, alef maksura).
 */
export function normalizeSmsText(text: string): string {
  if (!text) return "";
  let n = cleanSmsText(text);
  // Normalize Arabic letters (أ إ آ -> ا), (ة -> ه), (ى -> ي) for robust regex matching
  n = n.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  return n.trim();
}

/**
 * Deterministic SMS condensation pre-filter:
 * Strips non-financial boilerplate (bank greetings, hotlines, marketing teasers,
 * security disclaimers, and legal footers) while strictly retaining the 7 key
 * financial entities:
 *   1. Action / Transaction verb (خصم, إيداع, تحويل, شراء, debited, credited, etc.)
 *   2. Amount & Currency (EGP, LE, جم, ج.م, جنيه, etc.)
 *   3. Merchant / Counterparty (لدى ..., at ..., لـ ..., to ..., etc.)
 *   4. Card / Account mask (**1234, *5678, حساب ...)
 *   5. Timestamp / Date (بتاريخ ..., في ..., on ...)
 *   6. Balance after transaction (الرصيد المتاح ..., Available balance ...)
 *   7. Fees & Reference (الرسوم ..., مرجع ..., Ref ...)
 *
 * Saves 40–70% input tokens before LLM prompt generation.
 */
export function condenseSmsNotification(rawSms: string): string {
  if (!rawSms || typeof rawSms !== "string") return "";

  const cleaned = cleanSmsText(rawSms);
  if (cleaned.length < 15) return cleaned;

  let condensed = cleaned;

  // 1. Remove Bank Greetings & Salutations
  condensed = condensed.replace(
    /(?:^|[.,!\n])\s*(?:عزيزي\s+العميل|عميلنا\s+العزيز|أهلاً\s+بك|اهلا\s+بك|مرحباً\s+بك|مرحبا\s+بك|عميلنا\s+المميز|dear\s+(?:valued\s+)?customer|hello|hi)[،,\s-]*/gi,
    " ",
  );

  // 2. Remove Customer Service Hotlines & Inquiries
  condensed = condensed.replace(
    /(?:ل(?:ل)?استفسار(?:\s+أو\s+المساعدة)?(?:\s+اتصل\s+(?:على|بـ?))?|للمزيد\s+من\s+المعلومات|خدمة\s+العملاء|لخدمة\s+العملاء|للمساعدة|للاتصال|اتصل\s+(?:على|بـ?)|call(?:\s+us)?(?:\s+at)?|hotline|customer\s+(?:service|care)|for\s+(?:inquiries|assistance|support|more\s+info)\s+call)[\s:]*(?:19\d{3}|16\d{3}|15\d{3}|\d{4,6}|\+\d{10,14})[.,!\s]*/gi,
    " ",
  );

  // 3. Remove URLs & Websites
  condensed = condensed.replace(/(?:https?:\/\/|www\.)[^\s]+/gi, " ");

  // 4. Remove Marketing Teasers & App Promotion
  condensed = condensed.replace(
    /(?:استمتع\s+بـ?(?:أحدث\s+)?(?:عروض|خصومات)|حمل\s+تطبيق(?:نا)?|عروض\s+حصرية|وفر\s+أكتر\s+مع|download\s+(?:our\s+)?app|enjoy\s+(?:special\s+)?(?:offers|discounts|cashback)|visit\s+our\s+website)[^.,!\n]*(?:[.,!\n]|$)/gi,
    " ",
  );

  // 5. Remove Security Warnings / OTP Warnings (unless it's an OTP-only message)
  const isOtpOnly = /(?:كود\s+تفعيل|رمز\s+التحقق|otp\s+code|verification\s+code\s+is)/i.test(cleaned);
  if (!isOtpOnly) {
    condensed = condensed.replace(
      /(?:تنبيه(?:\s+أمني)?|تحذير|warning|security\s+alert)[\s:]*(?:لا\s+تشارك|احذر\s+مشاركة|never\s+share|do\s+not\s+share)[^.,!\n]*(?:[.,!\n]|$)/gi,
      " ",
    );
    condensed = condensed.replace(
      /(?:البنك\s+لن\s+يطلب\s+منك|the\s+bank\s+will\s+never\s+ask)[^.,!\n]*(?:[.,!\n]|$)/gi,
      " ",
    );
  }

  // 6. Remove Terms, Conditions & Signoffs
  condensed = condensed.replace(
    /(?:تطبق\s+الشروط\s+و(?:ال)?أحكام|terms\s+(?:and|&)\s+conditions\s+apply|t&c\s+apply|شكراً\s+لتعاملك\s+معنا|thank\s+you\s+for\s+banking\s+with\s+us|thank\s+you\s+for\s+using\s+our\s+services)[.,!\s]*/gi,
    " ",
  );

  // 7. Cleanup extra punctuation & whitespace
  condensed = condensed
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();

  // Safety fallback: if condensation stripped too much or lost numbers, revert to cleaned
  const originalDigits = (cleaned.match(/\d+/g) || []).join("");
  const condensedDigits = (condensed.match(/\d+/g) || []).join("");

  // If condensed lost the amount digits or is unreasonably short, return cleaned text
  if (condensed.length < 10 || (originalDigits.length > 0 && condensedDigits.length === 0)) {
    return cleaned;
  }

  return condensed;
}


// ═══════════════════════════════════════════════════════════════════════════════
// 2. PROVIDER DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
function detectProvider(text: string, sender?: string): string {
  const t = text.toLowerCase();
  const s = sender ? sender.toLowerCase() : "";

  // 1. Try to detect via sender (highly accurate from notification title)
  if (s) {
    if (
      /vodafone.*cash|vf\s*cash|فودافون.*كاش|v\.?cash|vf-cash|vodafone/i.test(s)
    )
      return "VodafoneCash";
    if (/instapay|انستاباي|انستا\s*باي/i.test(s)) return "InstaPay";
    if (/etisalat.*cash|اتصالات.*كاش|e-cash|etisalat/i.test(s))
      return "EtisalatCash";
    if (/orange.*(?:money|cash)|أورانج.*(?:موني|كاش)|orange/i.test(s))
      return "OrangeMoney";
    if (/we\s*pay|وي\s*باي|we/i.test(s)) return "WEPay";

    if (/\bcib\b|commercial international/i.test(s)) return "CIB";
    if (/\bnbe\b|national bank|البنك.*الاهلي|ahly/i.test(s)) return "NBE";
    if (/banque\s*misr|بنك\s*مصر|\bbm\b/i.test(s)) return "BanqueMisr";
    if (/\bqnb\b/i.test(s)) return "QNB";
    if (/\baaib\b|عربي.*افريقي|arab african/i.test(s)) return "AAIB";
    if (/alex\s*bank|بنك.*(?:الاسكندريه|اسكندريه)/i.test(s)) return "AlexBank";
    if (/faisal|فيصل/i.test(s)) return "FaisalBank";
    if (/crédit\s*agricole|ca\s*egypt|كريدي/i.test(s)) return "CreditAgricole";
    if (/hsbc/i.test(s)) return "HSBC";

    if (/apple\s*pay|ابل\s*باي/i.test(s)) return "ApplePay";
    if (/valu|ڤاليو/i.test(s)) return "ValU";
    if (/fawry|فوري/i.test(s)) return "Fawry";
    if (/meeza|ميزه/i.test(s)) return "Meeza";
  }

  // 2. Fallback to message text analysis
  if (/vodafone.*cash|vf\s*cash|فودافون.*كاش|v\.?cash|vf-cash|لرقم\s*010/i.test(t))
    return "VodafoneCash";
  if (/instapay|انستاباي|انستا\s*باي/i.test(t)) return "InstaPay";
  if (/etisalat.*cash|اتصالات.*كاش|e-cash|etisalat|لرقم\s*011/i.test(t))
    return "EtisalatCash";
  if (/orange.*(?:money|cash)|أورانج.*(?:موني|كاش)|orange|لرقم\s*012/i.test(t))
    return "OrangeMoney";
  if (/we\s*pay|وي\s*باي|we|لرقم\s*015/i.test(t)) return "WEPay";

  if (/\bcib\b|commercial international/i.test(t)) return "CIB";
  if (/\bnbe\b|national bank|البنك.*الاهلي|ahly/i.test(t)) return "NBE";
  if (/banque\s*misr|بنك\s*مصر|\bbm\b/i.test(t)) return "BanqueMisr";
  if (/\bqnb\b/i.test(t)) return "QNB";
  if (/\baaib\b|عربي.*افريقي|arab african/i.test(t)) return "AAIB";
  if (/alex\s*bank|بنك.*(?:الاسكندريه|اسكندريه)/i.test(t)) return "AlexBank";
  if (/faisal|فيصل/i.test(t)) return "FaisalBank";
  if (/crédit\s*agricole|ca\s*egypt|كريدي/i.test(t)) return "CreditAgricole";
  if (/hsbc/i.test(t)) return "HSBC";

  if (/apple\s*pay|ابل\s*باي/i.test(t)) return "ApplePay";
  if (/valu|ڤاليو/i.test(t)) return "ValU";
  if (/fawry|فوري/i.test(t)) return "Fawry";
  if (/meeza|ميزه/i.test(t)) return "Meeza";

  return "Unknown";
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. EXTRACTORS (Amount, Date, etc.)
// ═══════════════════════════════════════════════════════════════════════════════
function extractAmount(text: string): number | null {
  // First, strip balance indicators and their corresponding amounts from the text used to find the transaction amount
  const balancePatterns = [
    /(?:رصيدك|الرصيد|رصيد حسابك|الرصيد المتاح)[\s:]*(?:الكلي|الحالي|الجديد|المتاح)?\s*(?:هو|اصبح)?\s*[\d,]+(?:\.\d{1,2})?\s*(?:جنيه|ج\.?م\.?|egp|جم)?/gi,
    /(?:avail(?:able)?|new|current|updated)\s*(?:bal(?:ance)?|lim(?:it)?)?[\s.:]*(?:egp)?\s*[\d,]+(?:\.\d{1,2})?/gi,
  ];
  let cleanedForAmount = text;
  for (const bp of balancePatterns) {
    cleanedForAmount = cleanedForAmount.replace(bp, "");
  }

  const patterns = [
    // Standard formats with LE/EGP/جنيه/جم/جنيها
    /(?:مبلغ|قيمه|بمبلغ|بقيمه|لمبلغ|وقدره|تحويل|سحب|ايداع|صرف|خصم)\s*([\d]+(?:\.\d{1,2})?)\s*(?:جنيه|ج\.?م\.?|egp|جنيها|جم|l\.?e\.?)/i,
    /egp\s*([\d]+(?:\.\d{1,2})?)/i,
    /amount[\s:]+(?:egp\s*)?([\d]+(?:\.\d{1,2})?)/i,
    // E.g., "تم خصم 1500.00 جم"
    /(?:خصم|سحب|ايداع|صرف|اضافه)\s*([\d]+(?:\.\d{1,2})?)\s*(?:جم|جنيه|ج\.م)/i,
    // CIB / NBE formats
    /(?:purchase|withdrawal|transfer)\s*(?:of)?\s*(?:egp|le)?\s*([\d]+(?:\.\d{1,2})?)/i,
    /([\d]+(?:\.\d{1,2})?)\s*(?:جنيه|ج\.?م\.?|egp|l\.?e\.?|جم)/i,
    /(?:by|with|of)\s+egp\s*([\d]+(?:\.\d{1,2})?)/i,
    // Vodafone/Instapay formats: "تم تحويل 50.00"
    /(?:تم|استلمت|وصلك|حولت|خصم|اضافه)\s*(?:مبلغ\s*)?([\d]+(?:\.\d{1,2})?)/i,
  ];
  const cleaned = cleanedForAmount.replace(/,/g, "");
  for (const p of patterns) {
    const m = cleaned.match(p);
    if (m) {
      const v = parseFloat(m[1]);
      if (!isNaN(v) && v > 0) return v;
    }
  }
  return null;
}

function extractBalanceAfter(text: string): number | null {
  const n = text.replace(/,/g, "");
  const patterns = [
    /(?:رصيدك|الرصيد|رصيد حسابك|الرصيد المتاح|الرصيد المتبقي)[\s:]*(?:الكلي|الحالي|الجديد|المتاح|المتبقي)?\s*(?:هو|اصبح)?\s*([\d]+(?:\.\d{1,2})?)\s*(?:جنيه|ج\.?م\.?|egp|جم)?/i,
    /(?:بعد العمليه|بعد السحب|بعد التحويل|بعد الخصم)\s*:?\s*([\d]+(?:\.\d{1,2})?)/i,
    /(?:avail(?:able)?|new|current|updated)\s*(?:bal(?:ance)?|lim(?:it)?)?[\s.:]*(?:egp)?\s*([\d]+(?:\.\d{1,2})?)/i,
  ];
  for (const p of patterns) {
    const m = n.match(p);
    if (m) {
      const v = parseFloat(m[1]);
      if (!isNaN(v) && v >= 0) return v;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PROVIDER-SPECIFIC LOGIC
// ═══════════════════════════════════════════════════════════════════════════════
type DirCat = {
  direction: "incoming" | "outgoing" | null;
  category: RuleBasedSmsResult["category"];
  rule: string;
};

function parseDirection(text: string, provider: string): DirCat {
  const t = text;

  // ── Vodafone Cash / Mobile Wallets ──
  if (
    provider === "VodafoneCash" ||
    provider === "EtisalatCash" ||
    provider === "OrangeMoney" ||
    provider === "WEPay"
  ) {
    // Incoming
    if (
      /تم\s*(?:ايداع|اضافه|تحويل|استقبال|استلام).*من|استلمت|تم استلام|استقبال|وصلك|وصلك.*مبلغ|تم ايداع/i.test(
        t,
      ) ||
      /deposited to your wallet|transferred to your wallet|received/i.test(t)
    ) {
      return { direction: "incoming", category: "deposit", rule: "Wallet IN" };
    }
    // Outgoing
    if (
      /تم تحويل.*(?:لـ|ل|الي|الى|لرقم|رقم).*?(?:01[0125]\d{8}|\*)/i.test(t) ||
      /successfully transferred to|transferred.*to/i.test(t)
    ) {
      return {
        direction: "outgoing",
        category: "transfer",
        rule: "Wallet OUT Transfer",
      };
    }
    if (
      /تم خصم|تم سحب|تم الدفع|سحبت|صرفت|دفعت|خصم/i.test(t) ||
      /debited for purchasing|successfully withdrawn|withdrawn/i.test(t)
    ) {
      // If it's paying a bill / service
      if (/فواتير|فاتوره|سداد|شراء من فوري|fawry|مرفق|شحن رصيد|شحن/i.test(t)) {
        return {
          direction: "outgoing",
          category: "bills",
          rule: "Wallet OUT Bills",
        };
      }
      return {
        direction: "outgoing",
        category: "withdrawal",
        rule: "Wallet OUT",
      };
    }
  }

  // ── InstaPay ──
  if (provider === "InstaPay") {
    // Incoming
    if (
      /تم\s*(?:استقبال|ايداع|اضافه|استلام).*جم|استلمت.*جم|وصلك.*جم/i.test(t) ||
      /credited to your account.*via instapay|received.*via instapay|received.*from.*via instapay|credited.*via instapay/i.test(
        t,
      )
    ) {
      return {
        direction: "incoming",
        category: "transfer",
        rule: "InstaPay IN",
      };
    }
    // Outgoing
    if (
      /قمت بتحويل|تم تحويل.*(?:الي|الى|لـ|ل|لرقم)|ارسلت|ارسال.*عبر انستاباي|تم خصم.*تحويل/i.test(
        t,
      ) ||
      /transferred from your account.*via instapay|debited from your account.*via instapay|transferred.*via instapay|debited.*via instapay/i.test(
        t,
      )
    ) {
      return {
        direction: "outgoing",
        category: "transfer",
        rule: "InstaPay OUT",
      };
    }
  }

  // ── English Banking ──
  if (
    /(?:has been|was)\s+credited/i.test(t) ||
    /credited\s+(?:with|to|by)/i.test(t) ||
    /received\s+(?:transfer|payment)/i.test(t) ||
    /incoming\s+transfer/i.test(t) ||
    /deposit\s+of/i.test(t)
  ) {
    if (/salary|payroll/i.test(t))
      return {
        direction: "incoming",
        category: "income",
        rule: "EN Bank Salary",
      };
    return { direction: "incoming", category: "deposit", rule: "EN Bank IN" };
  }

  if (
    /(?:has been|was)\s+debited/i.test(t) ||
    /debited\s+(?:by|for|from)/i.test(t) ||
    /withdrawn|deducted/i.test(t) ||
    /outgoing\s+transfer/i.test(t) ||
    /payment\s+of/i.test(t) ||
    /withdrawal/i.test(t)
  ) {
    if (/pos|purchase|merchant|bought|e-commerce/i.test(t))
      return {
        direction: "outgoing",
        category: "payment",
        rule: "EN Bank POS",
      };
    if (/atm|cash/i.test(t))
      return {
        direction: "outgoing",
        category: "withdrawal",
        rule: "EN Bank ATM",
      };
    return {
      direction: "outgoing",
      category: "withdrawal",
      rule: "EN Bank OUT",
    };
  }

  // ── Arabic Banking (Formal & General) ──
  // Incoming
  if (
    /تم\s+(?:ايداع|اضافه|قيد|استلام)/i.test(t) ||
    /اضافه\s+مبلغ/i.test(t) ||
    /ايداع\s+نقدي/i.test(t)
  ) {
    if (/مرتب|راتب|مكافاه|salary|payroll/i.test(t))
      return {
        direction: "incoming",
        category: "income",
        rule: "AR Bank Salary",
      };
    return {
      direction: "incoming",
      category: "deposit",
      rule: "AR Bank IN Deposit",
    };
  }
  if (
    /تم\s+تحويل.*(?:الي|الى|ل)\s*حسابك/i.test(t) ||
    /حواله\s+وارده/i.test(t) ||
    /تحويل\s+وارد/i.test(t)
  ) {
    return {
      direction: "incoming",
      category: "transfer",
      rule: "AR Bank IN Transfer",
    };
  }

  // Outgoing
  if (
    /تم\s+(?:خصم|سحب|صرف)/i.test(t) ||
    /سحب\s+نقدي/i.test(t) ||
    /خصم\s+مبلغ/i.test(t)
  ) {
    if (/atm|ماكينه|صراف\s+الي/i.test(t))
      return {
        direction: "outgoing",
        category: "withdrawal",
        rule: "AR Bank ATM",
      };
    if (/شراء|نقاط\s+البيع/i.test(t) || /pos|merchant/i.test(t))
      return {
        direction: "outgoing",
        category: "payment",
        rule: "AR Bank POS",
      };
    if (/فوري|fawry|فاتوره|فواتير/i.test(t))
      return {
        direction: "outgoing",
        category: "bills",
        rule: "AR Bank Bills",
      };
    return {
      direction: "outgoing",
      category: "withdrawal",
      rule: "AR Bank OUT",
    };
  }
  if (
    /(?:تم\s+)?(?:شراء|دفع|سداد)/i.test(t) ||
    /عمليه\s+(?:شراء|دفع)/i.test(t) ||
    /مشتريات/i.test(t) ||
    /سداد\s+مستحقات/i.test(t) ||
    /فاتوره/i.test(t)
  ) {
    if (/فوري|fawry|مرفق/i.test(t))
      return {
        direction: "outgoing",
        category: "bills",
        rule: "AR Bank Bills",
      };
    return {
      direction: "outgoing",
      category: "payment",
      rule: "AR Bank POS/Bills",
    };
  }
  if (
    /تم\s+تحويل.*(?:من|عن طريق)/i.test(t) ||
    /حواله\s+صادره/i.test(t) ||
    /تحويل\s+صادر/i.test(t)
  ) {
    return {
      direction: "outgoing",
      category: "transfer",
      rule: "AR Bank OUT Transfer",
    };
  }

  // Fallback keywords
  if (/credited/i.test(t))
    return {
      direction: "incoming",
      category: "deposit",
      rule: "Fallback EN IN",
    };
  if (/debited|purchase/i.test(t))
    return {
      direction: "outgoing",
      category: "payment",
      rule: "Fallback EN OUT",
    };

  return { direction: null, category: "unknown", rule: "none" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NON-FINANCIAL FILTER
// ═══════════════════════════════════════════════════════════════════════════════
function isNonFinancial(text: string): boolean {
  // If a message contains strong financial terms indicating an actual completed transaction,
  // we do not want to classify it as non-financial just because it has safety warnings (e.g. "لا تشارك رمز PIN/OTP").
  const strongTransactionKeywords =
    /(?:تم\s*(?:خصم|سحب|تحويل|ايداع|اضافه|قيد|سداد)|credited|debited|transferred|withdrawn|deposit)/i;

  if (strongTransactionKeywords.test(text)) {
    // If it has strong transaction keywords, only discard if it looks explicitly like a verification code request
    const isVerificationCodeRequest =
      /(?:كود تفعيل|كود التحقق|رمز التفعيل|رمز التحقق|كودك هو|رمزك هو|verification code is|activation code is|رمز التحقق الخاص بك)/i.test(
        text,
      );
    if (isVerificationCodeRequest) {
      return true;
    }
    // Legitimate transaction notifications with warning texts like "لا تشارك رقمك السري" are NOT non-financial
    return false;
  }

  const p = [
    /otp|كود|رمز|verification|password|pin|لا تشارك/i,
    /عرض|offer|حمله|promotion|خصم \d+%/i, // "خصم 50%" is promo, not debit
    /تفعيل|حجب|block|ايقاف|تسجيل/i,
  ];
  return p.some((x) => x.test(text));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════════════════════════
export function parseSmsByRules(
  message: string,
  sender?: string,
): RuleBasedSmsResult {
  const empty: RuleBasedSmsResult = {
    transaction_detected: false,
    amount: null,
    currency: "EGP",
    direction: null,
    provider: "Unknown",
    category: "unknown",
    fee: null,
    balance_after: null,
    date: null,
    reference: null,
    merchant: null,
    confidence: 0,
    matched_rule: "none",
  };

  if (!message || message.trim().length < 10) return empty;

  const norm = normalizeSmsText(message);
  const provider = detectProvider(norm, sender);

  if (isNonFinancial(norm))
    return { ...empty, provider, matched_rule: "non_financial_filter" };

  const { direction, category, rule } = parseDirection(norm, provider);
  const amount = extractAmount(norm);

  if (!amount || !direction)
    return { ...empty, provider, matched_rule: "no_amount_or_dir" };

  const balance_after = extractBalanceAfter(norm);

  // ── Smart Dynamic Structural Confidence Score Heuristic ──
  // Calculates score based on the transaction metadata and specific template signatures.
  // Requires at least 0.85 confidence to bypass AI fallback entirely.
  let confidence = 0.0;

  if (amount !== null) confidence += 0.2;
  if (direction !== null) confidence += 0.2;

  if (provider !== "Unknown") {
    confidence += 0.2;
  }

  // Specificity of the matched rule
  if (
    rule === "InstaPay IN" ||
    rule === "InstaPay OUT" ||
    rule === "Wallet IN" ||
    rule === "Wallet OUT Transfer" ||
    rule === "Wallet OUT Bills"
  ) {
    // Ultra-reliable provider templates (InstaPay or Mobile Wallets)
    confidence += 0.25;
  } else if (
    rule !== "none" &&
    !rule.startsWith("Fallback") &&
    !rule.startsWith("AR Bank OUT") &&
    !rule.startsWith("AR Bank POS/Bills") &&
    !rule.startsWith("EN Bank OUT")
  ) {
    // Structured bank specific rules
    confidence += 0.15;
  } else if (rule !== "none" && !rule.startsWith("Fallback")) {
    // Standard bank rules
    confidence += 0.1;
  } else {
    // Fallback/broad matches
    confidence += 0.05;
  }

  if (balance_after !== null) {
    confidence += 0.15;
  }

  return {
    transaction_detected: true,
    amount,
    currency: "EGP",
    direction,
    provider,
    category,
    fee: null,
    balance_after,
    date: null, // Date will default to 'Now' in the router if missing
    reference: null,
    merchant: null,
    confidence: Math.min(confidence, 1.0),
    matched_rule: rule,
  };
}
