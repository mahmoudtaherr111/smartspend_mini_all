export interface QuickExpenseSuggestion {
  amount: number;
  category: string;
  subCategory: string;
  type: "income" | "expense" | "transfer" | "investment";
  description: string;
}

// Normalize Arabic letters to simplify matches
export function normalizeArabicText(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F]/g, "") // remove diacritics (harakat)
    .toLowerCase();
}

// Basic map of keywords -> category, subCategory, and transaction type
const KEYWORD_MAP: Record<
  string,
  { category: string; subCategory: string; type: "income" | "expense" | "transfer" | "investment" }
> = {
  // Food & Cafe
  اكل: { category: "أكل", subCategory: "طعام", type: "expense" },
  مطعم: { category: "أكل", subCategory: "طعام", type: "expense" },
  مطاعم: { category: "أكل", subCategory: "طعام", type: "expense" },
  كافيه: { category: "أكل", subCategory: "مشروبات", type: "expense" },
  قهوه: { category: "أكل", subCategory: "مشروبات", type: "expense" },
  عصير: { category: "أكل", subCategory: "مشروبات", type: "expense" },
  فطار: { category: "أكل", subCategory: "طعام", type: "expense" },
  غدا: { category: "أكل", subCategory: "طعام", type: "expense" },
  عشا: { category: "أكل", subCategory: "طعام", type: "expense" },
  سندوتش: { category: "أكل", subCategory: "طعام", type: "expense" },
  كشري: { category: "أكل", subCategory: "طعام", type: "expense" },

  // Transport
  مواصلات: { category: "مواصلات", subCategory: "عام", type: "expense" },
  مترو: { category: "مواصلات", subCategory: "قطار", type: "expense" },
  تاكسي: { category: "مواصلات", subCategory: "سيارة", type: "expense" },
  اوبر: { category: "مواصلات", subCategory: "تاكسي ذكي", type: "expense" },
  كريم: { category: "مواصلات", subCategory: "تاكسي ذكي", type: "expense" },
  اتوبيس: { category: "مواصلات", subCategory: "حافلة", type: "expense" },
  باص: { category: "مواصلات", subCategory: "حافلة", type: "expense" },
  ميكروباص: { category: "مواصلات", subCategory: "حافلة", type: "expense" },
  بنزين: { category: "بنزين", subCategory: "وقود سيارة", type: "expense" },
  وقود: { category: "بنزين", subCategory: "وقود سيارة", type: "expense" },

  // Shopping & Groceries
  سوبرماركت: { category: "تسوق", subCategory: "بقالة", type: "expense" },
  "سوبر ماركت": { category: "تسوق", subCategory: "بقالة", type: "expense" },
  بقاله: { category: "تسوق", subCategory: "بقالة", type: "expense" },
  بقال: { category: "تسوق", subCategory: "بقالة", type: "expense" },
  سوق: { category: "تسوق", subCategory: "خضار وفاكهة", type: "expense" },
  كارفور: { category: "تسوق", subCategory: "هايبر ماركت", type: "expense" },
  هايبر: { category: "تسوق", subCategory: "هايبر ماركت", type: "expense" },
  شراء: { category: "تسوق", subCategory: "عام", type: "expense" },
  اشتريت: { category: "تسوق", subCategory: "عام", type: "expense" },
  محل: { category: "تسوق", subCategory: "عام", type: "expense" },
  مول: { category: "تسوق", subCategory: "عام", type: "expense" },

  // Bills & Utilities
  فاتوره: { category: "فواتير", subCategory: "خدمات", type: "expense" },
  فواتير: { category: "فواتير", subCategory: "خدمات", type: "expense" },
  كهربا: { category: "فواتير", subCategory: "كهرباء", type: "expense" },
  كهرباء: { category: "فواتير", subCategory: "كهرباء", type: "expense" },
  غاز: { category: "فواتير", subCategory: "غاز", type: "expense" },
  ميه: { category: "فواتير", subCategory: "مياه", type: "expense" },
  مياه: { category: "فواتير", subCategory: "مياه", type: "expense" },
  تلفون: { category: "فواتير", subCategory: "اتصالات", type: "expense" },
  موبايل: { category: "فواتير", subCategory: "اتصالات", type: "expense" },
  هاتف: { category: "فواتير", subCategory: "اتصالات", type: "expense" },
  نت: { category: "فواتير", subCategory: "إنترنت", type: "expense" },
  انترنت: { category: "فواتير", subCategory: "إنترنت", type: "expense" },
  شحن: { category: "فواتير", subCategory: "رصيد", type: "expense" },

  // Health
  دكتور: { category: "صحة", subCategory: "طبيب", type: "expense" },
  طبيب: { category: "صحة", subCategory: "طبيب", type: "expense" },
  عياده: { category: "صحة", subCategory: "طبيب", type: "expense" },
  صيدليه: { category: "صحة", subCategory: "أدوية", type: "expense" },
  دوا: { category: "صحة", subCategory: "أدوية", type: "expense" },
  دواء: { category: "صحة", subCategory: "أدوية", type: "expense" },
  ادويه: { category: "صحة", subCategory: "أدوية", type: "expense" },
  مستشفي: { category: "صحة", subCategory: "مستشفى", type: "expense" },
  تحاليل: { category: "صحة", subCategory: "تحاليل", type: "expense" },

  // Clothing
  هدوم: { category: "ملابس", subCategory: "عام", type: "expense" },
  ملابس: { category: "ملابس", subCategory: "عام", type: "expense" },
  تيشيرت: { category: "ملابس", subCategory: "ملابس علوية", type: "expense" },
  قميص: { category: "ملابس", subCategory: "ملابس علوية", type: "expense" },
  بنطلون: { category: "ملابس", subCategory: "ملابس سفلية", type: "expense" },
  جزمه: { category: "ملابس", subCategory: "أحذية", type: "expense" },
  حذاء: { category: "ملابس", subCategory: "أحذية", type: "expense" },

  // Rent & Home
  ايجار: { category: "إيجار", subCategory: "سكن", type: "expense" },
  شقه: { category: "إيجار", subCategory: "سكن", type: "expense" },
  بيت: { category: "أهل وبيت", subCategory: "عام", type: "expense" },
  عيله: { category: "أهل وبيت", subCategory: "عام", type: "expense" },
  عائله: { category: "أهل وبيت", subCategory: "عام", type: "expense" },
  اولاد: { category: "أهل وبيت", subCategory: "أولاد", type: "expense" },
  "مصاريف البيت": { category: "أهل وبيت", subCategory: "مستلزمات", type: "expense" },

  // Subscriptions
  نتفليكس: { category: "اشتراكات", subCategory: "ترفيه رقمي", type: "expense" },
  نتفلكس: { category: "اشتراكات", subCategory: "ترفيه رقمي", type: "expense" },
  سبوتيفاي: { category: "اشتراكات", subCategory: "ترفيه رقمي", type: "expense" },
  يوتيوب: { category: "اشتراكات", subCategory: "ترفيه رقمي", type: "expense" },
  شاهد: { category: "اشتراكات", subCategory: "ترفيه رقمي", type: "expense" },

  // Income
  مرتب: { category: "دخل", subCategory: "راتب أساسي", type: "income" },
  راتب: { category: "دخل", subCategory: "راتب أساسي", type: "income" },
  دخل: { category: "دخل", subCategory: "أخرى", type: "income" },
  مبيعات: { category: "دخل", subCategory: "عمل حر", type: "income" },
  ارباح: { category: "دخل", subCategory: "أرباح", type: "income" },
  عموله: { category: "دخل", subCategory: "عمولة", type: "income" },
  مكافاه: { category: "دخل", subCategory: "مكافأة", type: "income" },

  // Investment
  استثمار: { category: "استثمار", subCategory: "عام", type: "investment" },
  ذهب: { category: "استثمار", subCategory: "ذهب", type: "investment" },
  دهب: { category: "استثمار", subCategory: "ذهب", type: "investment" },
  بورصه: { category: "استثمار", subCategory: "أسهم", type: "investment" },
};

export function suggestExpenseItems(rawText: string): QuickExpenseSuggestion | null {
  if (!rawText || rawText.trim().length === 0) return null;

  const normalized = normalizeArabicText(rawText);

  // 1. Extract amount (look for numbers)
  // Matching format like: 150 or 150.50, often followed or preceded by space & currency terms
  // Eg. 150 جنيه, صرفت 100, 75ج
  const numberRegex = /(?:\b)(\d+(?:\.\d+)?)(?:\b)/g;
  let match;
  let amount: number | null = null;

  // We take the first solid number found
  while ((match = numberRegex.exec(normalized)) !== null) {
    const val = parseFloat(match[1]);
    if (val > 0 && !isNaN(val)) {
      amount = val;
      break;
    }
  }

  if (amount === null) return null;

  // 2. Identify Category from keywords
  const tokens = normalized.split(/\s+/);
  let matchedKeywordInfo: typeof KEYWORD_MAP[string] | null = null;
  let matchedKeywordStr = "";

  // Check multi-word keywords first (like "سوبر ماركت" or "مصاريف البيت")
  for (const keyword of ["سوبر ماركت", "مصاريف البيت"]) {
    if (normalized.includes(keyword)) {
      matchedKeywordInfo = KEYWORD_MAP[keyword];
      matchedKeywordStr = keyword;
      break;
    }
  }

  // If not found, check single tokens
  if (!matchedKeywordInfo) {
    for (const token of tokens) {
      if (KEYWORD_MAP[token]) {
        matchedKeywordInfo = KEYWORD_MAP[token];
        matchedKeywordStr = token;
        break;
      }
    }
  }

  // If we have an amount AND a matched category keyword, we suggest a quick-save
  if (matchedKeywordInfo) {
    // Construct a friendly description (eg: "أكل" or "شحن رصيد")
    let description = rawText.trim();
    // Keep description short if it's too long
    if (description.length > 50) {
      description = `${amount} ج.م - ${matchedKeywordInfo.category}`;
    }

    return {
      amount,
      category: matchedKeywordInfo.category,
      subCategory: matchedKeywordInfo.subCategory,
      type: matchedKeywordInfo.type,
      description,
    };
  }

  return null;
}

export function validateOfflineInput(text: string): { isValid: boolean; errorReason?: string } {
  const trimmed = text.trim();

  // Rule 1: Length check (at least 5 characters)
  if (trimmed.length < 5) {
    return {
      isValid: false,
      errorReason: "النص قصير جداً. يرجى كتابة تفاصيل أكثر لتوضيح المعاملة.",
    };
  }

  // Rule 2: Consecutive character spam check
  // Matches any character (except space and Arabic 'ه' for laughter) repeated 5 or more times in a row
  const spamRegex = /(?![ه\s])(.)\1{4,}/;
  if (spamRegex.test(trimmed)) {
    return {
      isValid: false,
      errorReason: "تم اكتشاف حروف متكررة عشوائية. يرجى إدخال نص صحيح.",
    };
  }

  // Rule 3: Check for numbers (digits) or text representations of numbers/currencies in Arabic
  const normalized = normalizeArabicText(trimmed);
  const numberRegex = /[0-9٠-٩]+/;
  const currencyWords = [
    "جنيه", "جنية", "جنيهات", "جنيها", "ج.م", "قرش", "قروش", "مبلغ", "مرتب", "راتب",
    "فواتير", "فاتورة", "اشتراك", "قسط", "فلوس", "مصاريف", "دولار", "يورو", "ريال", "دينار"
  ];
  const numberWords = [
    "واحد", "اثنين", "تلاته", "ثلاثه", "اربعه", "خمسه", "سته", "سبعه", "تمانيه", "تسعه", "عشره",
    "عشرين", "تلاتين", "اربعين", "خمسين", "ستين", "سبعين", "تمانين", "تسعين", "ميه", "مائه", "ماتين", "مائتين",
    "الف", "الاف", "مليون"
  ];

  const hasDigits = numberRegex.test(normalized);
  const hasCurrencyWord = currencyWords.some(word => normalized.includes(word));
  const hasNumberWord = numberWords.some(word => normalized.includes(word));

  if (!hasDigits && !hasCurrencyWord && !hasNumberWord) {
    return {
      isValid: false,
      errorReason: "يرجى تحديد مبلغ مالي أو استخدام كلمات تدل على القيمة (مثل: ٥٠ جنيه، خمسين مواصلات).",
    };
  }

  return { isValid: true };
}
