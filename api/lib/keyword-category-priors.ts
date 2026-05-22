/**
 * Zero-token category hints from keywords — used before embedding/LLM on simple utterances.
 */
const KEYWORD_PRIORS: Array<{ pattern: RegExp; categories: string[] }> = [
  { pattern: /قهو|نسكاف|كافيه|لاتيه|كابتشينو|ستاربكس/i, categories: ["أكل وشرب"] },
  { pattern: /اوبر|كريم|تاكسي|اوتو|مواصلات|بنزين|مترو|باص/i, categories: ["مواصلات"] },
  { pattern: /شحن|رصيد|فودافون|اتصالات|اورانج|نت|انترنت|فاتورة|كهرب|مياه/i, categories: ["فواتير", "سكن"] },
  { pattern: /سوبر|بقال|كارفور|سبينس|خضار|عيش/i, categories: ["أكل وشرب"] },
  { pattern: /صيدل|دوا|دكتور|مستشفى|كشف/i, categories: ["صحة"] },
  { pattern: /مرتب|راتب|قبض|استلمت|دخل/i, categories: ["مرتب", "عمل"] },
  { pattern: /سجاير|فيب|شيشة|تدخين/i, categories: ["تدخين"] },
  { pattern: /جيم|اشتراك|نتفلكس|يوتيوب|سبوتيفاي/i, categories: ["اشتراكات", "ترفيه"] },
];

export function keywordCategoryPriors(text: string): string[] | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 3) return undefined;
  const found = new Set<string>();
  for (const row of KEYWORD_PRIORS) {
    if (row.pattern.test(normalized)) {
      row.categories.forEach((c) => found.add(c));
    }
  }
  return found.size ? [...found].slice(0, 5) : undefined;
}
