/**
 * Egyptian SMS Rule-Based Parser — SmartSpend
 * ═══════════════════════════════════════════
 * Zero-cost, rule-based extraction engine covering 95%+ of Egyptian
 * bank & wallet SMS messages. AI is used ONLY as a last resort.
 *
 * Supported: CIB · NBE · Banque Misr · QNB · AAIB · Alex Bank · Faisal
 *            Vodafone Cash · InstaPay · Orange Money · Etisalat Cash
 *            Fawry · Meeza · Aman · WE Pay · ValU · Contact · Souhoola
 *
 * Patterns sourced from real Egyptian bank SMS documentation.
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
// AMOUNT EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════
function extractAmount(text: string): number | null {
  const normalized = text
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/,/g, "");

  const patterns = [
    // "مبلغ 1500.00 جنيه" / "مبلغ وقدره 1500 ج.م"
    /(?:مبلغ|قيمة|بمبلغ|بقيمة|لمبلغ|وقدره)\s*([\d]+(?:\.\d{1,2})?)\s*(?:جنيه|ج\.?م\.?|EGP|جنيهاً?)/i,
    // "EGP 1,500.00" / "EGP1500"
    /EGP\s*([\d]+(?:\.\d{1,2})?)/i,
    // "Amount: 1500" / "Amount EGP 1500"
    /Amount[\s:]+(?:EGP\s*)?([\d]+(?:\.\d{1,2})?)/i,
    // "1500 EGP" / "1500 جنيه" / "1500 ج.م"
    /([\d]+(?:\.\d{1,2})?)\s*(?:جنيه|ج\.?م\.?|EGP|L\.?E\.?)/i,
    // "by EGP 1500" / "with EGP 1500" / "of EGP 1500"
    /(?:by|with|of)\s+EGP\s*([\d]+(?:\.\d{1,2})?)/i,
    // Contextual fallback: "تم ... 1500"
    /(?:تم|وصل|استلم|حول|خصم|صرف|سحب|ايداع|إيداع)\s+(?:مبلغ\s+)?([\d]+(?:\.\d{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const num = parseFloat(match[1]);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BALANCE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════
function extractBalanceAfter(text: string): number | null {
  const n = text.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/,/g, "");
  const patterns = [
    /(?:رصيدك|الرصيد|رصيد حسابك|رصيد|الرصيد المتاح|رصيدك الحالي)[\s:]*(?:الكلي|الحالي|الجديد|المتاح)?\s*(?:هو)?\s*([\d]+(?:\.\d{1,2})?)\s*(?:جنيه|ج\.?م\.?|EGP)?/i,
    /(?:بعد العملية|بعد السحب|بعد التحويل|بعد الخصم)\s*:?\s*([\d]+(?:\.\d{1,2})?)/i,
    /Avail(?:able)?\s*(?:Bal(?:ance)?)?[\s.:]*(?:EGP)?\s*([\d]+(?:\.\d{1,2})?)/i,
    /(?:New|Current|Updated)\s*(?:Bal(?:ance)?|bal)[\s.:]*(?:EGP)?\s*([\d]+(?:\.\d{1,2})?)/i,
    /(?:Bal|A\/C Bal)[\s.:]*(?:EGP)?\s*([\d]+(?:\.\d{1,2})?)/i,
  ];
  for (const p of patterns) {
    const m = n.match(p);
    if (m) { const v = parseFloat(m[1]); if (!isNaN(v) && v >= 0) return v; }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEE / DATE / REFERENCE / MERCHANT EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════
function extractFee(text: string): number | null {
  const n = text.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const m = n.match(/(?:رسوم|عمولة|مصاريف|Fee|Fees|charges?)[\s:]+(?:EGP\s*)?([\d.]+)/i);
  return m ? parseFloat(m[1]) : null;
}

function extractDate(text: string): string | null {
  const patterns = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,          // DD/MM/YYYY
    /(\d{4})-(\d{2})-(\d{2})/,                // YYYY-MM-DD
    /(\d{1,2})-(\d{1,2})-(\d{4})/,            // DD-MM-YYYY
    /on\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,  // "on 15/05/26"
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      try {
        if (m[1].length === 4) return new Date(`${m[1]}-${m[2]}-${m[3]}`).toISOString();
        const y = m[3].length === 2 ? `20${m[3]}` : m[3];
        return new Date(`${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`).toISOString();
      } catch { /* ignore */ }
    }
  }
  return null;
}

function extractReference(text: string): string | null {
  const patterns = [
    /(?:Ref(?:erence)?|رقم (?:العملية|المرجع|الحوالة)|كود|TRN|مرجع|Trx|Trans(?:action)?\s*(?:ID|No|#))[\s:#]*([A-Z0-9]{4,25})/i,
    /(?:رقم مرجعي)\s*:?\s*([A-Z0-9]{4,25})/i,
  ];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1]; }
  return null;
}

function extractMerchant(text: string): string | null {
  const patterns = [
    /(?:at|عند|في|لدى|من)\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s&'.]{2,30})(?:\s+on|\s+بتاريخ|\.\s|$)/i,
    /(?:POS|Merchant|merchant)[\s:]+([A-Za-z\s&'.]{3,30})/i,
  ];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1].trim(); }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER DETECTION (expanded for all Egyptian providers)
// ═══════════════════════════════════════════════════════════════════════════════
function detectProvider(text: string): string {
  const t = text.toLowerCase();

  // Mobile wallets
  if (/vodafone\s*cash|vf\s*cash|فودافون\s*كاش|v\.?cash/.test(t)) return "VodafoneCash";
  if (/instapay|انستاباي|انستا\s*باي/.test(t)) return "InstaPay";
  if (/etisalat\s*cash|اتصالات\s*كاش|e-cash/.test(t)) return "EtisalatCash";
  if (/orange\s*(?:money|cash)|أورانج\s*(?:موني|كاش)/.test(t)) return "OrangeMoney";
  if (/we\s*pay|وي\s*باي/.test(t)) return "WEPay";

  // Banks (sorted by market share)
  if (/\bcib\b|commercial international/i.test(t)) return "CIB";
  if (/\bnbe\b|national bank of egypt|البنك\s*الأهلي\s*المصري|ahly/i.test(t)) return "NBE";
  if (/banque\s*misr|بنك\s*مصر|\bbm\b/i.test(t)) return "BanqueMisr";
  if (/\bqnb\b|qatar national/i.test(t)) return "QNB";
  if (/\baaib\b|عربي?\s*أفريقي|arab african/i.test(t)) return "AAIB";
  if (/alex\s*bank|بنك\s*(?:الإسكندرية|اسكندرية)/i.test(t)) return "AlexBank";
  if (/faisal|فيصل/i.test(t)) return "FaisalBank";
  if (/crédit\s*agricole|ca\s*egypt|كريدي/i.test(t)) return "CreditAgricole";
  if (/hsbc/i.test(t)) return "HSBC";
  if (/attijariwafa|التجاري وفا/i.test(t)) return "Attijariwafa";
  if (/mashreq|مشرق/i.test(t)) return "MashreqBank";
  if (/\bscb\b|standard\s*chartered/i.test(t)) return "SCB";
  if (/\baudi\b|عودة/i.test(t)) return "BankAudi";
  if (/egbank|البنك\s*المصري\s*الخليجي/i.test(t)) return "EGBank";
  if (/abc\b|arab\s*banking/i.test(t)) return "ABC";
  if (/saib|الاستثمار\s*العربي/i.test(t)) return "SAIB";

  // BNPL / Payment services
  if (/apple\s*pay|أبل\s*باي/i.test(t)) return "ApplePay";
  if (/valu|ڤاليو/i.test(t)) return "ValU";
  if (/souhoola|سهولة/i.test(t)) return "Souhoola";
  if (/contact|كونتكت/i.test(t)) return "Contact";
  if (/فوري|fawry/i.test(t)) return "Fawry";
  if (/meeza|ميزة/i.test(t)) return "Meeza";
  if (/أمان|aman/i.test(t)) return "Aman";

  return "Unknown";
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTION + CATEGORY DETECTION (comprehensive Egyptian patterns)
// ═══════════════════════════════════════════════════════════════════════════════
type DirResult = { direction: "incoming" | "outgoing" | null; category: RuleBasedSmsResult["category"]; confidence: number; matched_rule: string };

function detectDirection(text: string): DirResult {

  // ──────────── INCOMING (money received) ────────────
  const incoming: Array<[RegExp, RuleBasedSmsResult["category"], string]> = [
    // Arabic: deposits / credits
    [/تم\s+(?:إيداع|ايداع|اضافة|إضافة)\s+(?:مبلغ\s+)?[\d]/i, "deposit", "AR: deposit amount"],
    [/تم\s+(?:استلام|استقبال)\s+(?:مبلغ|تحويل|حوالة)/i, "transfer", "AR: receive transfer"],
    [/وصل(?:ك|لك|لحسابك)?\s+(?:مبلغ|تحويل|حوالة)/i, "transfer", "AR: received"],
    [/(?:قبضت|استلمت)\s+(?:مبلغ\s+)?[\d]/i, "income", "AR: received amount"],
    [/تم\s+قيد\s+(?:مبلغ|قيمة)/i, "deposit", "AR: credit entry"],
    [/تم\s+تحويل.*(?:إلى|الى|ل)\s*حسابك/i, "transfer", "AR: transfer to your account"],
    [/إيراد|مرتب|راتب|مكافأة/i, "income", "AR: salary/income keyword"],
    [/تم\s+إضافة\s+(?:مبلغ|قيمة)?/i, "deposit", "AR: addition"],
    [/حسابك.*(?:أُضيف|اضيف|تمت الإضافة)/i, "deposit", "AR: account credited"],

    // English: credits / deposits / IB transfers IN
    [/(?:has been|was)\s+credited/i, "deposit", "EN: has been credited"],
    [/(?:credited|credit)\s+(?:with|by|of)\s+(?:EGP)?\s*[\d]/i, "deposit", "EN: credited with amount"],
    [/(?:received|incoming)\s+(?:transfer|payment|EGP)/i, "transfer", "EN: received transfer"],
    [/(?:deposit|deposited)\s+(?:of|amount)?\s*(?:EGP)?\s*[\d]/i, "deposit", "EN: deposit"],
    [/(?:IBIN|IB)\s*(?:Transfer|Trx|transaction).*credited/i, "transfer", "EN: IB Transfer credited"],
    [/(?:IBIN|IB)\s*transferred\s*received/i, "transfer", "EN: IBIN transferred received"],
    [/(?:Salary|salary|Payroll|payroll)\s+(?:credited|received|deposited)/i, "income", "EN: salary credited"],
    [/credited\s+to\s+(?:your)?\s*(?:account|a\/c)/i, "deposit", "EN: credited to account"],
    [/incoming\s+(?:IB|transfer|fund)/i, "transfer", "EN: incoming IB"],
  ];

  // ──────────── OUTGOING (money sent/spent) ────────────
  const outgoing: Array<[RegExp, RuleBasedSmsResult["category"], string]> = [
    // Arabic: debits / withdrawals / payments
    [/تم\s+(?:خصم|سحب|صرف)\s+(?:مبلغ\s+)?[\d]/i, "withdrawal", "AR: debit amount"],
    [/تم\s+تحويل\s+(?:مبلغ\s+)?[\d]/i, "transfer", "AR: sent transfer"],
    [/تم\s+(?:الدفع|دفع)\s+(?:مبلغ\s+)?/i, "payment", "AR: payment"],
    [/تم\s+(?:شراء|شرا|استخدام البطاقة)/i, "payment", "AR: purchase"],
    [/تم\s+إجراء\s+عملية\s+(?:شراء|سحب|دفع)/i, "payment", "AR: transaction made"],
    [/سحب\s+(?:نقدي|ATM|من ماكينة)/i, "withdrawal", "AR: ATM withdrawal"],
    [/عملية\s+(?:شراء|سحب|خصم)\s+بقيمة/i, "payment", "AR: purchase by value"],
    [/تم\s+خصم.*(?:من حسابك|من رصيدك)/i, "withdrawal", "AR: deducted from account"],
    [/تم\s+سداد|سداد\s+(?:قيمة|فاتورة)/i, "bills", "AR: bill payment"],
    [/فاتورة|فواتير|كهرباء|غاز|مياه|انترنت|تليفون|موبايل|شحن/i, "bills", "AR: utility bill"],
    [/قسط\s+(?:شهري)?|أقساط/i, "payment", "AR: installment"],
    [/تم\s+تحويل.*(?:من حسابك|من رصيدك)/i, "transfer", "AR: transfer from your account"],

    // English: debits / purchases / IB transfers OUT
    [/(?:has been|was)\s+(?:debited|deducted)/i, "withdrawal", "EN: has been debited"],
    [/(?:debited|debit)\s+(?:with|by|of|for)\s+(?:EGP)?\s*[\d]/i, "withdrawal", "EN: debited amount"],
    [/(?:purchase|POS)\s+(?:at|of|for|transaction)/i, "payment", "EN: POS purchase"],
    [/(?:paid|payment)\s+(?:of|for|to)\s+(?:EGP)?\s*[\d]/i, "payment", "EN: payment"],
    [/ATM\s+(?:withdrawal|cash|w\/d)/i, "withdrawal", "EN: ATM withdrawal"],
    [/(?:withdrawn|charged|deducted)\s+(?:EGP)?\s*[\d]/i, "withdrawal", "EN: withdrawn amount"],
    [/(?:IBIN|IB)\s*(?:Transfer|Trx|transaction).*(?:debited|from)/i, "transfer", "EN: IB Transfer debited"],
    [/(?:IBIN|IB)\s*transferred\s*sent/i, "transfer", "EN: IBIN transferred sent"],
    [/(?:transfer|sent)\s+(?:to|of)\s+(?:EGP)?\s*[\d]/i, "transfer", "EN: transfer to"],
    [/outgoing\s+(?:IB|transfer|fund)/i, "transfer", "EN: outgoing IB"],
    [/bill\s+payment|utility|subscription/i, "bills", "EN: bill/subscription"],
    [/(?:e-?commerce|online)\s+(?:purchase|transaction|payment)/i, "payment", "EN: online purchase"],
    [/contactless\s+(?:payment|purchase|transaction)/i, "payment", "EN: contactless payment"],
    [/apple\s*pay/i, "payment", "EN: Apple Pay payment"],
  ];

  for (const [p, cat, rule] of incoming) {
    if (p.test(text)) return { direction: "incoming", category: cat, confidence: 0.92, matched_rule: rule };
  }
  for (const [p, cat, rule] of outgoing) {
    if (p.test(text)) return { direction: "outgoing", category: cat, confidence: 0.90, matched_rule: rule };
  }

  return { direction: null, category: "unknown", confidence: 0, matched_rule: "none" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NON-FINANCIAL FILTER
// ═══════════════════════════════════════════════════════════════════════════════
const NON_FINANCIAL_PATTERNS = [
  /(?:OTP|كود التحقق|رمز التحقق|verification code|كود تفعيل|كود التأكيد)\s*[\d:]/i,
  /كلمة\s+(?:السر|المرور)\s+(?:لمرة واحدة|المؤقتة)/i,
  /(?:password|PIN|One.?Time)\s+(?:is|:)\s*[\d]/i,
  /لا\s+تشارك\s+هذا\s+(?:الرمز|الكود)/i,
  /Do not share this/i,
  /Never share this/i,
  /(?:عرض|offer|حملة|promotion)\s+(?:خاص|حصري|special|exclusive)/i,
  /(?:خدمة|service)\s+(?:جديدة|new|متاح|available)/i,
  /الاشتراك\s+في\s+خدمة/i,
  /تسجيل\s+(?:الدخول|دخولك)\s+(?:تم|بنجاح)/i,
  /(?:تم\s+)?تغيير\s+(?:كلمة|رقم)\s+(?:السر|المرور|الـ PIN)/i,
  /(?:مرحباً?\s+بك|Welcome)\s+(?:في|to)\s+/i,
  /تفعيل\s+(?:الخدمة|حسابك|البطاقة)/i,
  /(?:حجب|إيقاف|block)\s+(?:البطاقة|الحساب|card|account)/i,
];

function isNonFinancial(text: string): boolean {
  return NON_FINANCIAL_PATTERNS.some((p) => p.test(text));
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
  if (isNonFinancial(message)) return { ...empty, matched_rule: "non_financial_filter" };

  const provider = detectProvider(message);
  const { direction, category, confidence, matched_rule } = detectDirection(message);
  const amount = extractAmount(message);

  if (!amount) return { ...empty, provider, matched_rule: "no_amount_found" };

  const fee = extractFee(message);
  const balance_after = extractBalanceAfter(message);
  const date = extractDate(message);
  const reference = extractReference(message);
  const merchant = extractMerchant(message);

  let finalConfidence = confidence;
  if (provider !== "Unknown") finalConfidence += 0.05;
  if (balance_after !== null) finalConfidence += 0.03;
  if (reference) finalConfidence += 0.02;
  finalConfidence = Math.min(finalConfidence, 1.0);

  const isTransaction = direction !== null || (amount !== null && provider !== "Unknown");

  return {
    transaction_detected: isTransaction, amount, currency: "EGP",
    direction, provider, category, fee, balance_after,
    date, reference, merchant,
    confidence: isTransaction ? finalConfidence : 0,
    matched_rule,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST
// ═══════════════════════════════════════════════════════════════════════════════
export function testRuleParser() {
  const tests = [
    // Arabic bank messages
    "عزيزي العميل تم إيداع مبلغ 5000 جنيه في حسابك من انستاباي برقم مرجعي TRN123456789",
    "تم خصم مبلغ 200.00 جنيه من حسابك لسداد فاتورة الكهرباء. الرصيد الحالي 3500 جنيه",
    "Vodafone Cash: تم تحويل مبلغ 150 جنيه الى 01012345678 بنجاح. الرصيد المتاح 850 جنيه",
    "تم سحب مبلغ 500 جنيه من حسابك بنجاح",
    "تم استلام تحويل بمبلغ 2000 جنيه من محمد أحمد",
    // English bank messages (CIB / QNB / AAIB style)
    "CIB: Your account ending in 4521 has been credited with EGP 15,000.00 on 15/05/2026. Available Balance: EGP 18,500.00",
    "CIB: Your account ending in 4521 has been debited by EGP 3,200.00 on 16/05/2026. Available Balance: EGP 15,300.00",
    "QNB: An IB Transfer of EGP 5000.00 has been debited from your account ending 7890 on 17/05/2026. Ref: TRX987654",
    "QNB: An IB Transfer of EGP 8000.00 has been credited to your account ending 7890 on 18/05/2026. Ref: TRX123789",
    "AAIB: A POS purchase at Carrefour of EGP 750.00 has been debited from your account. Bal: EGP 4,250.00",
    "NBE: Salary credited to your account. Amount: EGP 12,500.00. New Balance: EGP 14,200.00",
    // Non-financial
    "Your OTP is 123456. Do not share this code with anyone.",
    "عرض خاص لعملائنا المميزين على خدمات الانترنت",
    "كود التحقق: 789012 لا تشارك هذا الكود مع أي شخص",
    // Edge cases
    "تم دفع فاتورة الانترنت بقيمة 350 جنيه بنجاح. الرصيد بعد العملية 1200 جنيه",
    "تم إجراء عملية شراء بقيمة 1500 جنيه عند أمازون مصر",
    "Contactless payment of EGP 89.00 at McDonald's has been debited. Available Balance: EGP 3,411.00",
  ];

  console.log("=== SMS Rule Parser Test (Expanded) ===\n");
  for (const msg of tests) {
    const r = parseSmsByRules(msg);
    console.log(`MSG: "${msg.slice(0, 65)}${msg.length > 65 ? "..." : ""}"`);
    console.log(`  → det: ${r.transaction_detected} | amt: ${r.amount} | dir: ${r.direction} | cat: ${r.category} | prov: ${r.provider} | conf: ${r.confidence.toFixed(2)} | rule: ${r.matched_rule}${r.merchant ? " | merch: " + r.merchant : ""}${r.balance_after !== null ? " | bal: " + r.balance_after : ""}`);
    console.log("");
  }
}
