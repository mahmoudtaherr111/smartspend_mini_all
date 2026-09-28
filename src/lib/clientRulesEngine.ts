/**
 * Phone-side checks for text saved while offline. Categories are never decided here: the
 * server engine files every sentence, including the quick-save chip's preview.
 */

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
