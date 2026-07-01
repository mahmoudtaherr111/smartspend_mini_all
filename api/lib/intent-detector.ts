/**
 * SmartSpend Intent Detector (Step 3)
 * Determines if a transaction is income, expense, transfer, or investment
 */

/** Strong income indicators (high weight = 50) */
const STRONG_INCOME = [
  "مرتب",
  "مرتبي",
  "قبضت",
  "القبض",
  "استلمت",
  "الماهيه",
  "جالي من",
  "جاليه من",
  "حولي من",
  "حولولي",
  "اتحولتلي",
  "ارباحي",
  "قبضت الجمعيه",
  "سهمي في الجمعيه",
  "سبوبه",
  "شغلانه براني",
  "دخلي",
  "ايرادي",
  "رجعولي",
  "رجعلي فلوس",
  "كاش باك",
  "خدت المصروف",
  "اخدت مصروف",
  // New narrative patterns
  "إداني",
  "بعتلي",
  "وصلني",
  "وصلتلي",
  "حولوليه",
  "صح جالي",
  "جالي منه",
  "أبويا إداني",
  "أبوه إداه",
  "مما إداني",
  "خدت من أبويا",
  "خدت من أمي",
  "قبضت الجمعية",
  "نزل المرتب",
  "اتكلم مرتب",
  "اديتني",
  "أديتني",
  "اديتنى",
  "أديتنى",
  "إدتني",
  "إدتنى",
  "ادتني",
  "ادتنى",
  // Generic "خدت من [anyone]" = receiving money from someone
  "خدت من",
  "اخدت من",
  "جاني",
  "جاني من",
  "رجعلي",
  "كاشباك",
  "لقيت",
  "لقينا",
];

/** Normal income indicators (weight = 15) */
const INCOME_KEYWORDS = [
  "المعاش",
  "راتب",
  "جالي",
  "رزق",
  "مكسب",
  "كسبت",
  "ارباح",
  "فوايد",
  "عائد",
  "مكافاه",
  "بونص",
  "اوفر تايم",
  "اضافي",
  "بدل",
  "حوافز",
  "حولي",
  "فودافون كاش",
  "جمعيه",
  "سهمي",
  "ايداع",
  "دخل",
  "ايراد",
  "مبيعات",
  "بيعه",
  "عموله",
  "براني",
  "شغلانه",
  "هديه",
  "عيديه",
  "نقطه",
  "نفقه",
];

/** Strong expense indicators (weight = 50) */
const STRONG_EXPENSE = [
  "دفعت",
  "صرفت",
  "اشتريت",
  "سددت",
  "حاسبت",
  "حولت ل",
  "اديت ل",
  "طلعت ل",
  "خرجت ل",
  "ركبت",
  "طلبت",
  "حجزت",
  "شحنت رصيد",
  "دفعت قسط",
  "دفعنا",
  "اكلت",
  "شربت",
  "عزمت",
  // New narrative patterns
  "طلعت للبواب",
  "طلعت لـ",
  "طيرت فكة",
  "سلكت",
  "سددت لـ",
  "دفعت لل",
  "مشيت بـ",
  "صرفت على",
  "خلصت ال",
  "دفع خدمة",
  "ادى لـ",
  "أديت لـ",
  "جبت",
  "جبتي",
  "جبنا",
  "اديت",
  "أديت",
  "خرجت",
  "اتعشيت",
  "اتغديت",
  "فطرت",
  "فرتكت",
  "طيرت",
  "خرشت",
  "ضيعت",
  "طيرت",
  "خربت",
  "بوظت",
  "قعدت",
  "قعدنا",
  "ضربت",
  "روحت",
  "لعبت",
  "لعبنا",
  "حجزنا",
  "شحنا",
  "حاسبنا",
  "صلحنا",
  "خرجنا",
  "اتعشينا",
  "اتغدينا",
  "فطرنا",
  "سافرنا",
  "سافرت",
  "اتفسحت",
  "اتفسحنا",
  "ضربنا",
];

/** Normal expense indicators (weight = 15) */
const EXPENSE_KEYWORDS = [
  "صرف",
  "مصروف",
  "مصاريف",
  "خرجي",
  "تبذير",
  "خلصت",
  "نزلت",
  "دليفري",
  "توصيله",
  "روحت",
  "سافرت",
  "فاتوره",
  "شحنت",
  "رصيد",
  "حولت",
  "اديت",
  "طلعت",
  "وزعت",
  "اشتراك",
  "جددت",
  "كلفني",
  "واقف عليا",
  "خسرت",
  "عليا",
  "دين",
  "قسط",
  "اقساط",
  "مديونيه",
];

/** Transfer indicators */
const TRANSFER_KEYWORDS = [
  "حولت ل",
  "حولت لـ",
  "تحويل",
  "انستاباي",
  "فودافون كاش",
  "سحبت من",
  "سحب ATM",
  "ايداع",
  "حطيت في",
  "سلفت",
  "سلفه",
  "اديت سلفه",
  "شلت",  // Egyptian: pulled/withdrew
  "رجعت",  // returned money to someone
  "فكيت",  // breaking a bill
];

/** Investment indicators */
const INVESTMENT_KEYWORDS = [
  "ذهب",
  "دهب",
  "سبيكه",
  "جنيه دهب",
  "دولار",
  "بورصه",
  "اسهم",
  "شهاده",
  "وديعه",
  "استثمار",
  "عقار",
  "ارض",
  "شقه تمليك",
  "شلت دهب", // Egyptian: bought gold
  "شلت ذهب",
];

import { normalizeArabic } from "./unified-normalizer";

const NORM_STRONG_INCOME = STRONG_INCOME.map((k) =>
  normalizeArabic(k).toLowerCase(),
);
const NORM_INCOME_KEYWORDS = INCOME_KEYWORDS.map((k) =>
  normalizeArabic(k).toLowerCase(),
);
const NORM_STRONG_EXPENSE = STRONG_EXPENSE.map((k) =>
  normalizeArabic(k).toLowerCase(),
);
const NORM_EXPENSE_KEYWORDS = EXPENSE_KEYWORDS.map((k) =>
  normalizeArabic(k).toLowerCase(),
);
const NORM_TRANSFER_KEYWORDS = TRANSFER_KEYWORDS.map((k) =>
  normalizeArabic(k).toLowerCase(),
);
const NORM_INVESTMENT_KEYWORDS = INVESTMENT_KEYWORDS.map((k) =>
  normalizeArabic(k).toLowerCase(),
);

export type TransactionIntent =
  | "income"
  | "expense"
  | "transfer"
  | "investment";

export interface IntentResult {
  intent: TransactionIntent;
  incomeScore: number;
  expenseScore: number;
  transferScore: number;
  investmentScore: number;
  confidence: number;
}

function includesWord(text: string, word: string): boolean {
  const escapedWord = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(?:^|\\s|[.,،؛؟?!\\(\\)])` + escapedWord + `(?:$|\\s|[.,،؛؟?!\\(\\)])`);
  return regex.test(text);
}

/**
 * Detect intent for a given context string
 */
export function detectIntent(context: string): IntentResult {
  const normContext = normalizeArabic(context).toLowerCase();

  let incomeScore = 0;
  let expenseScore = 0;
  let transferScore = 0;
  let investmentScore = 0;

  // Strong indicators (weight 50)
  for (const kw of NORM_STRONG_INCOME)
    if (includesWord(normContext, kw)) incomeScore += 50;
  for (const kw of NORM_STRONG_EXPENSE)
    if (includesWord(normContext, kw)) expenseScore += 50;

  // Normal indicators (weight 15)
  for (const kw of NORM_INCOME_KEYWORDS)
    if (includesWord(normContext, kw)) incomeScore += 15;
  for (const kw of NORM_EXPENSE_KEYWORDS)
    if (includesWord(normContext, kw)) expenseScore += 15;

  // Transfer indicators (weight 40)
  for (const kw of NORM_TRANSFER_KEYWORDS)
    if (includesWord(normContext, kw)) transferScore += 40;

  // Investment indicators (weight 40)
  for (const kw of NORM_INVESTMENT_KEYWORDS)
    if (includesWord(normContext, kw)) investmentScore += 40;

  // Contextual patterns
  if (
    /(?:حولت|بعت|بعتت)\s+.*?\s*لـ?(?:\s+|[ا-ي]+)/.test(
      normContext,
    ) ||
    /حولت\s*(ل|لـ)?/.test(normContext)
  ) {
    transferScore += 40;
    expenseScore -= 20;
  }
  if (/حول(ي|ى|ولي|ولى)/.test(normContext)) {
    incomeScore += 40;
  }
  if (/[اإ]?د(ي|ى)ت\s*(ل|لـ)/.test(normContext)) {
    expenseScore += 30;
  }
  if (/سلفت/.test(normContext)) {
    transferScore += 30;
  }
  if (/رجع(و|)لي/.test(normContext)) {
    incomeScore += 40;
  }
  if (/(?:^|\s)و?(?:خدت|اخدت|أخدت|سحبت|استلمت|جالي|قبضت)\s+(?:.*?\s+)?من(?:ه|ها|هم|نا|ني)?(?:\s+|$)/.test(normContext)) {
    // If it's withdrawing from a machine/bank, it's a transfer, not income
    if (/(?:atm|بنك|فيزا|حساب|مكنه|مكنة|ماكينه|ماكينة)/i.test(normContext)) {
      transferScore += 100;
    } else {
      incomeScore += 80;
      expenseScore -= 40;
    }
  }
  if (/(?:^|\s)[وف]?(?:منه|منها|منهم|مني|مننا)\s+(?:.*?\s+)?(?:خدت|اخدت|أخدت|سحبت|استلمت|جالي|قبضت)(?:\s+|$)/.test(normContext)) {
    incomeScore += 80;
    expenseScore -= 40;
  }
  if (/(?:^|\s)[وف]?(?:جالي|جاني|وصلني|وصلتلي|استلمت|رجعلي|إداني|اداني|قبضت)\s+(?:تحويل|مبلغ|فلوس|باقي)/.test(normContext)) {
    incomeScore += 80;
    transferScore -= 40;
  }
  if (/(?:في|على|على\s+ال)\s*(?:الارض|الأرض)/.test(normContext)) {
    investmentScore = 0;
  }
  if (/(?:دخلت|دخلنا)\s+(?:سينما|فيلم|ملاهي|حفله|حفلة|متحف)/.test(normContext)) {
    expenseScore += 80;
    incomeScore -= 50;
  }
  if (/(?:هديه|هدية)\s+(?:عيد|ميلاد|فرح|خطوبه|خطوبة)/.test(normContext)) {
    expenseScore += 70;
    incomeScore -= 50;
  }

  // Determine winner
  const scores = {
    income: incomeScore,
    expense: expenseScore,
    transfer: transferScore,
    investment: investmentScore,
  };
  const maxScore = Math.max(
    incomeScore,
    expenseScore,
    transferScore,
    investmentScore,
  );

  let intent: TransactionIntent = "expense"; // default
  if (maxScore === 0) {
    intent = "expense";
  } else if (investmentScore === maxScore) {
    intent = "investment";
  } else if (transferScore === maxScore && transferScore > expenseScore) {
    intent = "transfer";
  } else if (incomeScore > expenseScore) {
    intent = "income";
  } else {
    intent = "expense";
  }

  // Calculate confidence (how decisive the winner is) using clamped scores
  const clampedIncome = Math.max(0, incomeScore);
  const clampedExpense = Math.max(0, expenseScore);
  const clampedTransfer = Math.max(0, transferScore);
  const clampedInvestment = Math.max(0, investmentScore);
  const totalScore =
    clampedIncome + clampedExpense + clampedTransfer + clampedInvestment;
  const confidence =
    totalScore > 0 ? Math.min(100, Math.round((Math.max(0, maxScore) / totalScore) * 100)) : 30;

  return {
    intent,
    incomeScore,
    expenseScore,
    transferScore,
    investmentScore,
    confidence,
  };
}

export { INCOME_KEYWORDS, EXPENSE_KEYWORDS, STRONG_INCOME, STRONG_EXPENSE };
