/**
 * Zero-token category hints from keywords — used before embedding/LLM on simple utterances.
 */
// NOTE: Be careful with short tokens like "نت" — it must not match common words like "انت/كنت".
// We bias priors towards precision; high-recall is handled by embedding/LLM.
const KEYWORD_PRIORS: Array<{ pattern: RegExp; categories: string[] }> = [
  // Food & drinks
  { pattern: /قهو|نسكاف|كافيه|لاتيه|كابتشينو|ستاربكس|اكل|غدا|فطار|عشا|مطعم|كشري|شاورما|بيتزا|برجر/i, categories: ["أكل وشرب"] },
  { pattern: /سوبر|بقال|كارفور|سبينيس|كازيون|خير\s*زمان|خضار|فاكهه|عيش|لبن|بيض/i, categories: ["أكل وشرب"] },

  // Transport
  { pattern: /اوبر|كريم|اندرايف|ديدي|تاكسي|ميكروباص|مترو|اتوبيس|بنزين|تفويل|مواصلات/i, categories: ["مواصلات", "خدمات سيارات"] },

  // Bills / Utilities (exact-ish signals)
  { pattern: /فاتور|عداد|كهرب|ميه|مياه|غاز|ضرايب|تامين|قسط|اقساط|مديونيه|فيزا|ماستر/i, categories: ["فواتير"] },
  // Internet/Telecom with word-boundary style guards to avoid matching "انت/كنت"
  { pattern: /(?:^|\s)(?:نت|النت|انترنت|الانترنت|راوتر|واي\s*فاي|wifi|dsl|adsl|we|tedata)(?=\s|$|[.,،؟?!؛:])/i, categories: ["فواتير"] },
  { pattern: /(?:^|\s)(?:فودافون|اورنج|اتصالات|وي)(?=\s|$|[.,،؟?!؛:])/i, categories: ["فواتير"] },

  // Home
  { pattern: /ايجار|اجار|شقه|شقة|بيت|سكن|نظاف|منظف|بويا|نقاش|سباك|نجار|صيانه\s*(?:بيت|شقه)?/i, categories: ["سكن"] },

  // Health
  { pattern: /صيدل|دوا|دواء|دكتور|كشف|عياده|تحاليل|معمل|مختبر|مستشفى|اسنان|نظاره/i, categories: ["صحة"] },

  // Education
  { pattern: /مدرسه|جامعه|كورس|كورسات|درس|دروس|سنتر|مذكره|ملزمه|كتاب|كتب/i, categories: ["تعليم"] },

  // Subscriptions & entertainment
  { pattern: /نتفلكس|سبوتيفاي|شاهد|watch\s*it|واتش\s*ات|يوتيوب\s*بريميوم|اشتراك/i, categories: ["اشتراكات", "ترفيه"] },
  { pattern: /سينما|فيلم|خروجه|فسحه|كورنيش|بلايستيشن|board\s*game|بولينج|جيم|رياضه|نادي/i, categories: ["ترفيه", "خروجات"] },

  // Smoking
  { pattern: /سجاير|سجائر|فيب|ليكود|شيشه|شيشة|معسل|تدخين/i, categories: ["تدخين"] },

  // Transfers / investment
  { pattern: /(?:^|\s)(?:تحويل|انستاباي|instapay|فودافون\s*كاش|wallet|محفظه|محفظة|سحب|ايداع|atm)(?=\s|$|[.,،؟?!؛:])/i, categories: ["تحويل"] },
  { pattern: /ذهب|دهب|سبيكه|سبايك|بورصه|بورصة|اسهم|أسهم|ثاندر|شهاده|شهادة|وديعه|وديعة|استثمار|كريبتو|عملات\s*رقميه/i, categories: ["استثمار"] },

  // Income (keep broad, but not too broad)
  { pattern: /مرتب|راتب|قبضت|قبض|استلمت|جالي|وصلني|معاش|بونص|مكاف|اوفرتايم|بدل|عموله|سبوبه|فريلانس|كاش\s*باك|استرجاع/i, categories: ["مرتب", "عمل حر", "عوائد استثمار"] },
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
