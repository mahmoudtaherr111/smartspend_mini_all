/**
 * SmartSpend Intent Detector (Step 3)
 * Determines if a transaction is income, expense, transfer, or investment
 */

/** Strong income indicators (high weight = 50) */
const STRONG_INCOME = [
  "مرتب", "مرتبي", "قبضت", "القبض", "استلمت", "الماهيه",
  "جالي من", "حولي من", "حولولي", "اتحولتلي",
  "ارباحي", "قبضت الجمعيه", "سهمي في الجمعيه",
  "سبوبه", "شغلانه براني", "دخلي", "ايرادي",
  "رجعولي", "رجعلي فلوس", "كاش باك",
];

/** Normal income indicators (weight = 15) */
const INCOME_KEYWORDS = [
  "مرتب", "مرتبي", "قبضت", "القبض", "استلمت", "الماهيه", "المعاش", "راتب",
  "جالي", "وصلني", "رزق", "مكسب", "كسبت", "ارباح", "فوايد", "عائد",
  "مكافاه", "بونص", "اوفر تايم", "اضافي", "بدل", "حوافز",
  "حولي", "حولولي", "اتحولتلي", "فودافون كاش",
  "جمعيه", "قبضت الجمعيه", "سهمي",
  "ايداع", "دخل", "ايراد", "مبيعات", "بيعه", "عموله",
  "سبوبه", "براني", "شغلانه", "هديه", "عيديه", "نقطه", "نفقه",
];

/** Strong expense indicators (weight = 50) */
const STRONG_EXPENSE = [
  "دفعت", "صرفت", "اشتريت", "سددت", "حاسبت",
  "حولت ل", "اديت ل", "طلعت ل", "خرجت ل",
  "ركبت", "طلبت", "حجزت", "شحنت رصيد", "دفعت قسط", "دفعنا",
  "اكلت", "شربت", "عزمت",
];

/** Normal expense indicators (weight = 15) */
const EXPENSE_KEYWORDS = [
  "صرفت", "صرف", "مصروف", "مصاريف", "خرجي", "تبذير",
  "دفعت", "سددت", "خلصت", "حاسبت",
  "اشتريت", "جبت", "نزلت", "طلبت", "دليفري",
  "ركبت", "توصيله", "روحت", "سافرت",
  "اكلت", "شربت", "عزمت",
  "فاتوره", "شحنت", "رصيد",
  "حولت", "اديت", "طلعت", "وزعت",
  "اشتراك", "جددت", "حجزت",
  "كلفني", "واقف عليا", "خسرت",
  "عليا", "دين", "قسط", "اقساط", "مديونيه",
];

/** Transfer indicators */
const TRANSFER_KEYWORDS = [
  "حولت ل", "حولت لـ", "تحويل", "انستاباي", "فودافون كاش",
  "سحبت من", "سحب ATM", "ايداع", "حطيت في",
  "سلفت", "سلفه", "اديت سلفه",
];

/** Investment indicators */
const INVESTMENT_KEYWORDS = [
  "ذهب", "دهب", "سبيكه", "جنيه دهب", "دولار",
  "بورصه", "اسهم", "شهاده", "وديعه", "استثمار",
  "عقار", "ارض", "شقه تمليك",
];

export type TransactionIntent = "income" | "expense" | "transfer" | "investment";

export interface IntentResult {
  intent: TransactionIntent;
  incomeScore: number;
  expenseScore: number;
  transferScore: number;
  investmentScore: number;
  confidence: number;
}

/**
 * Detect intent for a given context string
 */
export function detectIntent(context: string): IntentResult {
  let incomeScore = 0;
  let expenseScore = 0;
  let transferScore = 0;
  let investmentScore = 0;

  // Strong indicators (weight 50)
  for (const kw of STRONG_INCOME) if (context.includes(kw)) incomeScore += 50;
  for (const kw of STRONG_EXPENSE) if (context.includes(kw)) expenseScore += 50;

  // Normal indicators (weight 15)
  for (const kw of INCOME_KEYWORDS) if (context.includes(kw)) incomeScore += 15;
  for (const kw of EXPENSE_KEYWORDS) if (context.includes(kw)) expenseScore += 15;

  // Transfer indicators (weight 40)
  for (const kw of TRANSFER_KEYWORDS) if (context.includes(kw)) transferScore += 40;

  // Investment indicators (weight 40)
  for (const kw of INVESTMENT_KEYWORDS) if (context.includes(kw)) investmentScore += 40;

  // Contextual patterns
  if (/حولت\s*(ل|لـ)/.test(context)) { transferScore += 30; expenseScore -= 20; }
  if (/حول(ي|ى|ولي|ولى)/.test(context)) { incomeScore += 40; }
  if (/اد(ي|ى)ت\s*(ل|لـ)/.test(context)) { expenseScore += 30; }
  if (/سلفت/.test(context)) { transferScore += 30; }
  if (/رجع(و|)لي/.test(context)) { incomeScore += 40; }

  // Determine winner
  const scores = { income: incomeScore, expense: expenseScore, transfer: transferScore, investment: investmentScore };
  const maxScore = Math.max(incomeScore, expenseScore, transferScore, investmentScore);

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

  // Calculate confidence (how decisive the winner is)
  const totalScore = incomeScore + expenseScore + transferScore + investmentScore;
  const confidence = totalScore > 0 ? Math.round((maxScore / totalScore) * 100) : 30;

  return { intent, incomeScore, expenseScore, transferScore, investmentScore, confidence };
}

export { INCOME_KEYWORDS, EXPENSE_KEYWORDS, STRONG_INCOME, STRONG_EXPENSE };
