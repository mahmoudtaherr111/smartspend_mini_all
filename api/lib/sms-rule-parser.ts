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
  category: "transfer" | "payment" | "income" | "bills" | "withdrawal" | "deposit" | "unknown";
  fee: number | null;
  balance_after: number | null;
  date: string | null;
  reference: string | null;
  merchant: string | null;
  confidence: number;
  matched_rule: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════
export function normalizeSmsText(text: string): string {
  if (!text) return "";
  let n = text;
  // Remove zero-width spaces, zero-width non-joiners, etc (common in iOS Shortcuts)
  n = n.replace(/[\u200B-\u200D\uFEFF]/g, ' ');
  // Replace multiple spaces/newlines with single space
  n = n.replace(/\s+/g, ' ');
  // Convert Arabic/Hindi numbers to standard
  n = n.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  // Normalize Arabic letters (أ إ آ -> ا), (ة -> ه), (ى -> ي) for robust regex matching
  n = n.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  return n.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PROVIDER DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
function detectProvider(text: string): string {
  const t = text.toLowerCase();
  
  if (/vodafone.*cash|vf\s*cash|فودافون.*كاش|v\.?cash/i.test(t)) return "VodafoneCash";
  if (/instapay|انستاباي|انستا\s*باي/i.test(t)) return "InstaPay";
  if (/etisalat.*cash|اتصالات.*كاش|e-cash/i.test(t)) return "EtisalatCash";
  if (/orange.*(?:money|cash)|أورانج.*(?:موني|كاش)/i.test(t)) return "OrangeMoney";
  if (/we\s*pay|وي\s*باي/i.test(t)) return "WEPay";

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
  const patterns = [
    // Standard formats
    /(?:مبلغ|قيمه|بمبلغ|بقيمه|لمبلغ|وقدره|تحويل|سحب|ايداع|صرف|خصم)\s*([\d]+(?:\.\d{1,2})?)\s*(?:جنيه|ج\.?م\.?|egp|جنيها)/i,
    /egp\s*([\d]+(?:\.\d{1,2})?)/i,
    /amount[\s:]+(?:egp\s*)?([\d]+(?:\.\d{1,2})?)/i,
    /([\d]+(?:\.\d{1,2})?)\s*(?:جنيه|ج\.?م\.?|egp|l\.?e\.?)/i,
    /(?:by|with|of)\s+egp\s*([\d]+(?:\.\d{1,2})?)/i,
    // Vodafone/Instapay formats: "تم تحويل 50.00"
    /(?:تم|استلمت|وصلك|حولت|خصم|اضافه)\s*(?:مبلغ\s*)?([\d]+(?:\.\d{1,2})?)/i
  ];
  const cleaned = text.replace(/,/g, '');
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
    /(?:رصيدك|الرصيد|رصيد حسابك|الرصيد المتاح)[\s:]*(?:الكلي|الحالي|الجديد|المتاح)?\s*(?:هو|اصبح)?\s*([\d]+(?:\.\d{1,2})?)\s*(?:جنيه|ج\.?م\.?|egp)?/i,
    /(?:بعد العمليه|بعد السحب|بعد التحويل|بعد الخصم)\s*:?\s*([\d]+(?:\.\d{1,2})?)/i,
    /(?:avail(?:able)?|new|current|updated)\s*(?:bal(?:ance)?)?[\s.:]*(?:egp)?\s*([\d]+(?:\.\d{1,2})?)/i,
  ];
  for (const p of patterns) {
    const m = n.match(p);
    if (m) { const v = parseFloat(m[1]); if (!isNaN(v) && v >= 0) return v; }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PROVIDER-SPECIFIC LOGIC
// ═══════════════════════════════════════════════════════════════════════════════
type DirCat = { direction: "incoming" | "outgoing" | null, category: RuleBasedSmsResult["category"], rule: string };

function parseDirection(text: string, provider: string): DirCat {
  const t = text;

  // ── Vodafone Cash / Mobile Wallets ──
  if (provider === "VodafoneCash" || provider === "EtisalatCash" || provider === "OrangeMoney") {
    // Incoming
    if (/تم ايداع|تم اضافه|استلمت|تم استلام|استقبال|وصلك/i.test(t)) return { direction: "incoming", category: "deposit", rule: "Wallet IN" };
    // Outgoing
    if (/تم تحويل.*ل(?:رقم)?/i.test(t)) return { direction: "outgoing", category: "transfer", rule: "Wallet OUT Transfer" };
    if (/تم خصم|تم سحب|تم الدفع|سحبت|صرفت|دفعت/i.test(t)) return { direction: "outgoing", category: "withdrawal", rule: "Wallet OUT" };
  }

  // ── InstaPay ──
  if (provider === "InstaPay") {
    if (/استلمت|تم ايداع|استقبال/i.test(t)) return { direction: "incoming", category: "transfer", rule: "InstaPay IN" };
    if (/قمت بتحويل|تم تحويل.*الي|ارسلت|ارسال/i.test(t)) return { direction: "outgoing", category: "transfer", rule: "InstaPay OUT" };
  }

  // ── English Banking ──
  if (/(?:has been|was)\s+credited/i.test(t) || /credited\s+(?:with|to|by)/i.test(t) || /received\s+(?:transfer|payment)/i.test(t) || /incoming\s+transfer/i.test(t) || /deposit\s+of/i.test(t)) {
    if (/salary|payroll/i.test(t)) return { direction: "incoming", category: "income", rule: "EN Bank Salary" };
    return { direction: "incoming", category: "deposit", rule: "EN Bank IN" };
  }
  
  if (/(?:has been|was)\s+debited/i.test(t) || /debited\s+(?:by|for|from)/i.test(t) || /withdrawn|deducted/i.test(t) || /outgoing\s+transfer/i.test(t) || /payment\s+of/i.test(t) || /withdrawal/i.test(t)) {
    if (/pos|purchase|merchant|bought|e-commerce/i.test(t)) return { direction: "outgoing", category: "payment", rule: "EN Bank POS" };
    if (/atm|cash/i.test(t)) return { direction: "outgoing", category: "withdrawal", rule: "EN Bank ATM" };
    return { direction: "outgoing", category: "withdrawal", rule: "EN Bank OUT" };
  }

  // ── Arabic Banking (Formal & General) ──
  // Incoming
  if (/تم\s+(?:ايداع|اضافه|قيد|استلام)/i.test(t) || /اضافه\s+مبلغ/i.test(t) || /ايداع\s+نقدي/i.test(t)) return { direction: "incoming", category: "deposit", rule: "AR Bank IN Deposit" };
  if (/تم\s+تحويل.*(?:الي|الى|ل)\s*حسابك/i.test(t) || /حواله\s+وارده/i.test(t) || /تحويل\s+وارد/i.test(t)) return { direction: "incoming", category: "transfer", rule: "AR Bank IN Transfer" };
  if (/ايراد|مرتب|راتب|مكافاه/i.test(t)) return { direction: "incoming", category: "income", rule: "AR Bank Salary" };
  
  // Outgoing
  if (/تم\s+(?:خصم|سحب|صرف)/i.test(t) || /سحب\s+نقدي/i.test(t) || /خصم\s+مبلغ/i.test(t)) {
    if (/atm|ماكينه|صراف\s+الي/i.test(t)) return { direction: "outgoing", category: "withdrawal", rule: "AR Bank ATM" };
    if (/شراء|نقاط\s+البيع/i.test(t)) return { direction: "outgoing", category: "payment", rule: "AR Bank POS" };
    return { direction: "outgoing", category: "withdrawal", rule: "AR Bank OUT" };
  }
  if (/تم\s+(?:شراء|دفع|سداد)/i.test(t) || /عمليه\s+(?:شراء|دفع)/i.test(t) || /مشتريات/i.test(t) || /سداد\s+مستحقات/i.test(t) || /فاتوره/i.test(t)) {
    return { direction: "outgoing", category: "payment", rule: "AR Bank POS/Bills" };
  }
  if (/تم\s+تحويل.*(?:من|عن طريق)/i.test(t) || /حواله\s+صادره/i.test(t) || /تحويل\s+صادر/i.test(t)) return { direction: "outgoing", category: "transfer", rule: "AR Bank OUT Transfer" };

  // Fallback keywords
  if (/credited/i.test(t)) return { direction: "incoming", category: "deposit", rule: "Fallback EN IN" };
  if (/debited|purchase/i.test(t)) return { direction: "outgoing", category: "payment", rule: "Fallback EN OUT" };

  return { direction: null, category: "unknown", rule: "none" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NON-FINANCIAL FILTER
// ═══════════════════════════════════════════════════════════════════════════════
function isNonFinancial(text: string): boolean {
  const p = [
    /otp|كود|رمز|verification|password|pin|لا تشارك/i,
    /عرض|offer|حمله|promotion|خصم \d+%/i, // "خصم 50%" is promo, not debit
    /تفعيل|حجب|block|ايقاف|تسجيل/i
  ];
  return p.some(x => x.test(text));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════════════════════════
export function parseSmsByRules(message: string): RuleBasedSmsResult {
  const empty: RuleBasedSmsResult = {
    transaction_detected: false, amount: null, currency: "EGP",
    direction: null, provider: "Unknown", category: "unknown",
    fee: null, balance_after: null, date: null,
    reference: null, merchant: null, confidence: 0, matched_rule: "none",
  };

  if (!message || message.trim().length < 10) return empty;
  
  const norm = normalizeSmsText(message);
  
  if (isNonFinancial(norm)) return { ...empty, matched_rule: "non_financial_filter" };

  const provider = detectProvider(norm);
  const { direction, category, rule } = parseDirection(norm, provider);
  const amount = extractAmount(norm);

  if (!amount || !direction) return { ...empty, provider, matched_rule: "no_amount_or_dir" };

  const balance_after = extractBalanceAfter(norm);

  // If rules caught both Amount and Direction, confidence is very high.
  // This avoids AI cost completely.
  let confidence = 0.90;
  if (provider !== "Unknown") confidence += 0.05;
  if (balance_after !== null) confidence += 0.04;

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
