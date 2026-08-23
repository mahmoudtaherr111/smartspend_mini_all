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
  اكل: { category: "أكل وشرب", subCategory: "عام", type: "expense" },
  مطعم: { category: "أكل وشرب", subCategory: "مطعم", type: "expense" },
  مطاعم: { category: "أكل وشرب", subCategory: "مطعم", type: "expense" },
  كافيه: { category: "أكل وشرب", subCategory: "قهوة وكافيه", type: "expense" },
  قهوه: { category: "أكل وشرب", subCategory: "قهوة وكافيه", type: "expense" },
  عصير: { category: "أكل وشرب", subCategory: "مشروبات", type: "expense" },
  فطار: { category: "أكل وشرب", subCategory: "عام", type: "expense" },
  غدا: { category: "أكل وشرب", subCategory: "عام", type: "expense" },
  عشا: { category: "أكل وشرب", subCategory: "عام", type: "expense" },
  سندوتش: { category: "أكل وشرب", subCategory: "وجبات سريعة", type: "expense" },
  كشري: { category: "أكل وشرب", subCategory: "مطعم", type: "expense" },

  // Transport
  مواصلات: { category: "مواصلات", subCategory: "عام", type: "expense" },
  مترو: { category: "مواصلات", subCategory: "مترو", type: "expense" },
  تاكسي: { category: "مواصلات", subCategory: "تاكسي", type: "expense" },
  اوبر: { category: "مواصلات", subCategory: "أوبر/كريم", type: "expense" },
  كريم: { category: "مواصلات", subCategory: "أوبر/كريم", type: "expense" },
  اتوبيس: { category: "مواصلات", subCategory: "أتوبيس", type: "expense" },
  باص: { category: "مواصلات", subCategory: "أتوبيس", type: "expense" },
  ميكروباص: { category: "مواصلات", subCategory: "أتوبيس", type: "expense" },
  بنزين: { category: "مواصلات", subCategory: "بنزين", type: "expense" },
  وقود: { category: "مواصلات", subCategory: "بنزين", type: "expense" },

  // Shopping & Groceries
  سوبرماركت: { category: "أكل وشرب", subCategory: "بقالة", type: "expense" },
  "سوبر ماركت": { category: "أكل وشرب", subCategory: "بقالة", type: "expense" },
  بقاله: { category: "أكل وشرب", subCategory: "بقالة", type: "expense" },
  بقال: { category: "أكل وشرب", subCategory: "بقالة", type: "expense" },
  سوق: { category: "تسوق", subCategory: "عام", type: "expense" },
  كارفور: { category: "أكل وشرب", subCategory: "بقالة", type: "expense" },
  هايبر: { category: "أكل وشرب", subCategory: "بقالة", type: "expense" },
  شراء: { category: "تسوق", subCategory: "عام", type: "expense" },
  اشتريت: { category: "تسوق", subCategory: "عام", type: "expense" },
  محل: { category: "تسوق", subCategory: "عام", type: "expense" },
  مول: { category: "تسوق", subCategory: "عام", type: "expense" },

  // Bills & Utilities
  فاتوره: { category: "فواتير", subCategory: "عام", type: "expense" },
  فواتير: { category: "فواتير", subCategory: "عام", type: "expense" },
  كهربا: { category: "فواتير", subCategory: "كهرباء", type: "expense" },
  كهرباء: { category: "فواتير", subCategory: "كهرباء", type: "expense" },
  غاز: { category: "فواتير", subCategory: "غاز", type: "expense" },
  ميه: { category: "فواتير", subCategory: "مياه", type: "expense" },
  مياه: { category: "فواتير", subCategory: "مياه", type: "expense" },
  تلفون: { category: "فواتير", subCategory: "تليفون", type: "expense" },
  موبايل: { category: "فواتير", subCategory: "تليفون", type: "expense" },
  هاتف: { category: "فواتير", subCategory: "تليفون", type: "expense" },
  نت: { category: "فواتير", subCategory: "إنترنت", type: "expense" },
  انترنت: { category: "فواتير", subCategory: "إنترنت", type: "expense" },
  شحن: { category: "فواتير", subCategory: "شحن رصيد", type: "expense" },

  // Health
  دكتور: { category: "صحة", subCategory: "دكتور", type: "expense" },
  طبيب: { category: "صحة", subCategory: "دكتور", type: "expense" },
  عياده: { category: "صحة", subCategory: "دكتور", type: "expense" },
  صيدليه: { category: "صحة", subCategory: "صيدلية", type: "expense" },
  دوا: { category: "صحة", subCategory: "صيدلية", type: "expense" },
  دواء: { category: "صحة", subCategory: "صيدلية", type: "expense" },
  ادويه: { category: "صحة", subCategory: "صيدلية", type: "expense" },
  مستشفي: { category: "صحة", subCategory: "مستشفى", type: "expense" },
  تحاليل: { category: "صحة", subCategory: "تحاليل", type: "expense" },

  // Clothing
  هدوم: { category: "تسوق", subCategory: "ملابس", type: "expense" },
  ملابس: { category: "تسوق", subCategory: "ملابس", type: "expense" },
  تيشيرت: { category: "تسوق", subCategory: "ملابس", type: "expense" },
  قميص: { category: "تسوق", subCategory: "ملابس", type: "expense" },
  بنطلون: { category: "تسوق", subCategory: "ملابس", type: "expense" },
  جزمه: { category: "تسوق", subCategory: "أحذية", type: "expense" },
  حذاء: { category: "تسوق", subCategory: "أحذية", type: "expense" },

  // Rent & Home
  ايجار: { category: "سكن", subCategory: "إيجار", type: "expense" },
  شقه: { category: "سكن", subCategory: "إيجار", type: "expense" },
  بيت: { category: "العائلة", subCategory: "عام", type: "expense" },
  عيله: { category: "العائلة", subCategory: "عام", type: "expense" },
  عائله: { category: "العائلة", subCategory: "عام", type: "expense" },
  اولاد: { category: "العائلة", subCategory: "الأبناء", type: "expense" },
  "مصاريف البيت": { category: "سكن", subCategory: "عام", type: "expense" },

  // Subscriptions
  نتفليكس: { category: "اشتراكات", subCategory: "نتفلكس", type: "expense" },
  نتفلكس: { category: "اشتراكات", subCategory: "نتفلكس", type: "expense" },
  سبوتيفاي: { category: "اشتراكات", subCategory: "سبوتيفاي", type: "expense" },
  يوتيوب: { category: "اشتراكات", subCategory: "عام", type: "expense" },
  شاهد: { category: "اشتراكات", subCategory: "عام", type: "expense" },

  // Income
  مرتب: { category: "مرتب", subCategory: "مرتب أساسي", type: "income" },
  راتب: { category: "مرتب", subCategory: "مرتب أساسي", type: "income" },
  دخل: { category: "عمل حر", subCategory: "مشروع", type: "income" },
  مبيعات: { category: "عمل حر", subCategory: "مشروع", type: "income" },
  ارباح: { category: "عوائد استثمار", subCategory: "أرباح", type: "income" },
  عموله: { category: "عمل حر", subCategory: "عمولة", type: "income" },
  مكافاه: { category: "مرتب", subCategory: "مكافأة/بونص", type: "income" },

  // Investment
  استثمار: { category: "استثمار", subCategory: "ذهب", type: "investment" },
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
