/**
 * SmartSpend Rule Engine (Step 4)
 * Fast classification without AI for simple/clear transactions
 */

import { CATEGORY_DICTIONARY } from "./egyptian-dictionary";
import { fuzzyFindCategory, normalizeArabic, matchArabicPhrase } from "./fuzzy-match";
import { detectIntent, type TransactionIntent } from "./intent-detector";
import { extractAmounts, type ExtractedAmount } from "./entity-extractor";
import { normalizeText } from "./text-normalizer";
import { CATEGORIES } from "./category-registry";
import { findTaxonomyMatch } from "./taxonomy-adapter";

export interface RuleEngineResult {
  items: ParsedTransaction[];
  usedAI: false;
  needsAI: boolean;
  reason?: string;
}

export interface ParsedTransaction {
  amount: number;
  category: string;
  subCategory: string;
  description: string;
  type: TransactionIntent;
  confidence: number;
  merchant?: string;
  currency: string;
  needsReview: boolean;
  parsedBy: "rule_engine" | "ai" | "manual";
  inferenceSource?: "synonym" | "rule" | "dictionary" | "ai";
  ambiguityFlags?: string[];
  date?: string; // Add optional date string for parsed dates like "yesterday"
  person_mentioned?: string;
  person_relationship?: string;
  confidenceBreakdown?: {
    intent: number;
    taxonomy: number;
    heuristics: number;
  };
}

export interface ClassificationProfileContext {
  hasChildren?: boolean | null;
  responsibleForFamily?: boolean | null;
  supportsOthers?: unknown;
  fixedMonthlyCommitments?: unknown;
}

/** Sub-category mapping from dictionary keywords */
const SUB_CATEGORY_MAP: Record<
  string,
  { category: string; subCategory: string }
> = {
  // Food subcategories
  كنتاكي: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  ماكدونالدز: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  هارديز: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "برجر كينج": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "بيتزا هت": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  شاورما: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  كشري: { category: "أكل وشرب", subCategory: "مطعم" },
  مطعم: { category: "أكل وشرب", subCategory: "مطعم" },
  اكل: { category: "أكل وشرب", subCategory: "مطعم" },
  أكل: { category: "أكل وشرب", subCategory: "مطعم" },
  اكلت: { category: "أكل وشرب", subCategory: "مطعم" },
  أكلت: { category: "أكل وشرب", subCategory: "مطعم" },
  غدا: { category: "أكل وشرب", subCategory: "مطعم" },
  عشا: { category: "أكل وشرب", subCategory: "مطعم" },
  فطار: { category: "أكل وشرب", subCategory: "مطعم" },
  دليفري: { category: "أكل وشرب", subCategory: "دليفري" },
  "تيك اواي": { category: "أكل وشرب", subCategory: "دليفري" },
  قهوه: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  قهوة: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  قهو: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  نسكافيه: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  كافيه: { category: "ترفيه", subCategory: "كافيه" },
  بقاله: { category: "أكل وشرب", subCategory: "بقالة" },
  بقال: { category: "أكل وشرب", subCategory: "بقالة" },
  سمك: { category: "أكل وشرب", subCategory: "سي فود" },
  جمبري: { category: "أكل وشرب", subCategory: "سي فود" },
  فراخ: { category: "أكل وشرب", subCategory: "لحوم ودواجن" },
  لحمه: { category: "أكل وشرب", subCategory: "لحوم ودواجن" },
  فرن: { category: "أكل وشرب", subCategory: "مخبوزات" },
  مخبز: { category: "أكل وشرب", subCategory: "مخبوزات" },
  عيش: { category: "أكل وشرب", subCategory: "مخبوزات" },
  // Transport subcategories
  اوبر: { category: "مواصلات", subCategory: "أوبر/كريم" },
  كريم: { category: "مواصلات", subCategory: "أوبر/كريم" },
  مترو: { category: "مواصلات", subCategory: "مترو" },
  اتوبيس: { category: "مواصلات", subCategory: "أتوبيس" },
  باص: { category: "مواصلات", subCategory: "أتوبيس" },
  تكسي: { category: "مواصلات", subCategory: "تاكسي" },
  تاكسي: { category: "مواصلات", subCategory: "تاكسي" },
  بنزين: { category: "مواصلات", subCategory: "بنزين" },
  تفويله: { category: "مواصلات", subCategory: "بنزين" },
  ركنه: { category: "مواصلات", subCategory: "ركنة" },
  جراج: { category: "مواصلات", subCategory: "ركنة" },
  توكتوك: { category: "مواصلات", subCategory: "توكتوك" },
  "صيانه عربيه": { category: "مواصلات", subCategory: "صيانة عربية" },
  عربيه: { category: "مواصلات", subCategory: "صيانة عربية" },
  عربية: { category: "مواصلات", subCategory: "صيانة عربية" },
  ميكروباص: { category: "مواصلات", subCategory: "أتوبيس" },
  قطر: { category: "مواصلات", subCategory: "قطار" },
  // Bills subcategories
  كهربا: { category: "فواتير", subCategory: "كهرباء" },
  نور: { category: "فواتير", subCategory: "كهرباء" },
  ميه: { category: "فواتير", subCategory: "مياه" },
  مياه: { category: "فواتير", subCategory: "مياه" },
  غاز: { category: "فواتير", subCategory: "غاز" },
  نت: { category: "فواتير", subCategory: "إنترنت" },
  راوتر: { category: "فواتير", subCategory: "إنترنت" },
  شحن: { category: "فواتير", subCategory: "شحن رصيد" },
  رصيد: { category: "فواتير", subCategory: "شحن رصيد" },
  قسط: { category: "فواتير", subCategory: "أقساط" },
  اقساط: { category: "فواتير", subCategory: "أقساط" },
  تامين: { category: "فواتير", subCategory: "تأمين" },
  ضرايب: { category: "فواتير", subCategory: "ضرائب" },
  باقه: { category: "فواتير", subCategory: "إنترنت" },
  باقة: { category: "فواتير", subCategory: "إنترنت" },
  // Home subcategories
  ايجار: { category: "سكن", subCategory: "إيجار" },
  شقه: { category: "سكن", subCategory: "إيجار" },
  شقة: { category: "سكن", subCategory: "إيجار" },
  عفش: { category: "سكن", subCategory: "أثاث" },
  سباك: { category: "سكن", subCategory: "صيانة" },
  كهربائي: { category: "سكن", subCategory: "صيانة" },
  نقاش: { category: "سكن", subCategory: "صيانة" },
  نجار: { category: "سكن", subCategory: "صيانة" },
  شغاله: { category: "سكن", subCategory: "نظافة" },
  منظفات: { category: "سكن", subCategory: "منظفات" },
  غساله: { category: "سكن", subCategory: "أجهزة منزلية" },
  تلاجه: { category: "سكن", subCategory: "أجهزة منزلية" },
  // Shopping subcategories
  هدوم: { category: "تسوق", subCategory: "ملابس" },
  لبس: { category: "تسوق", subCategory: "ملابس" },
  موبايل: { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  "تليفون جديد": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  "موبايل جديد": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  "موبايل مستعمل": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  "لاب توب": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  ايفون: { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  كوتشي: { category: "تسوق", subCategory: "أحذية" },
  جزمه: { category: "تسوق", subCategory: "أحذية" },
  شوبينج: { category: "تسوق", subCategory: "تسوق عام" },
  كارفور: { category: "تسوق", subCategory: "سوبر ماركت" },
  سوبرماركت: { category: "تسوق", subCategory: "سوبر ماركت" },
  "سوبر ماركت": { category: "تسوق", subCategory: "سوبر ماركت" },
  // Health subcategories
  دكتور: { category: "صحة", subCategory: "دكتور" },
  كشف: { category: "صحة", subCategory: "دكتور" },
  صيدليه: { category: "صحة", subCategory: "صيدلية" },
  دوا: { category: "صحة", subCategory: "صيدلية" },
  تحاليل: { category: "صحة", subCategory: "تحاليل" },
  تحليل: { category: "صحة", subCategory: "تحاليل" },
  مستشفى: { category: "صحة", subCategory: "مستشفى" },
  اسنان: { category: "صحة", subCategory: "أسنان" },
  علاج: { category: "صحة", subCategory: "صيدلية" },
  روشته: { category: "صحة", subCategory: "صيدلية" },
  // Education subcategories
  مدرسه: { category: "تعليم", subCategory: "مدرسة" },
  جامعه: { category: "تعليم", subCategory: "جامعة" },
  كورس: { category: "تعليم", subCategory: "كورسات" },
  درس: { category: "تعليم", subCategory: "دروس خصوصية" },
  دروس: { category: "تعليم", subCategory: "دروس خصوصية" },
  // Entertainment subcategories
  سينما: { category: "ترفيه", subCategory: "سينما" },
  جيم: { category: "ترفيه", subCategory: "رياضة وجيم" },
  نادي: { category: "ترفيه", subCategory: "رياضة وجيم" },
  سفر: { category: "ترفيه", subCategory: "سفر" },
  مصيف: { category: "ترفيه", subCategory: "سفر" },
  خروجه: { category: "ترفيه", subCategory: "خروجة" },
  // Subscriptions
  نتفلكس: { category: "اشتراكات", subCategory: "نتفلكس" },
  سبوتيفاي: { category: "اشتراكات", subCategory: "سبوتيفاي" },
  // Gifts
  هديه: { category: "هدايا وصدقات", subCategory: "عام" },
  صدقه: { category: "هدايا وصدقات", subCategory: "صدقة/تبرع" },
  زكاه: { category: "هدايا وصدقات", subCategory: "زكاة" },
  عيديه: { category: "هدايا وصدقات", subCategory: "عيدية" },
  // Investment
  ذهب: { category: "استثمار", subCategory: "ذهب" },
  دهب: { category: "استثمار", subCategory: "ذهب" },
  اسهم: { category: "استثمار", subCategory: "أسهم" },
  شهاده: { category: "استثمار", subCategory: "شهادات" },
  // Income subcategories
  مرتب: { category: "مرتب", subCategory: "مرتب أساسي" },
  بونص: { category: "مرتب", subCategory: "مكافأة/بونص" },
  مكافاه: { category: "مرتب", subCategory: "مكافأة/بونص" },
  قبض: { category: "مرتب", subCategory: "مرتب أساسي" },
  سلفه: { category: "مرتب", subCategory: "سلف/قروض" },
  سلفة: { category: "مرتب", subCategory: "سلف/قروض" },
  عموله: { category: "عمل حر", subCategory: "عمولة" },
  سبوبه: { category: "عمل حر", subCategory: "سبوبة" },
  سجاير: { category: "تدخين", subCategory: "سجائر" },
  سجائر: { category: "تدخين", subCategory: "سجائر" },
  سجاره: { category: "تدخين", subCategory: "سجائر" },
  فيب: { category: "تدخين", subCategory: "فيب/ليكود" },
  vape: { category: "تدخين", subCategory: "فيب/ليكود" },
  ليكود: { category: "تدخين", subCategory: "فيب/ليكود" },
  liquid: { category: "تدخين", subCategory: "فيب/ليكود" },
  شيشه: { category: "تدخين", subCategory: "شيشة/معسل" },
  شيشة: { category: "تدخين", subCategory: "شيشة/معسل" },
  معسل: { category: "تدخين", subCategory: "شيشة/معسل" },
  حلاق: { category: "تسوق", subCategory: "عناية شخصية" },
  لبان: { category: "أكل وشرب", subCategory: "سناكس" },
  شيبسي: { category: "أكل وشرب", subCategory: "سناكس" },
  اوريو: { category: "أكل وشرب", subCategory: "سناكس" },
  هوهوز: { category: "أكل وشرب", subCategory: "سناكس" },
  دونت: { category: "أكل وشرب", subCategory: "سناكس" },
  تويست: { category: "أكل وشرب", subCategory: "سناكس" },
  بلايستيشن: { category: "ترفيه", subCategory: "ألعاب" },
  "بلاي ستيشن": { category: "ترفيه", subCategory: "ألعاب" },
  ريدبول: { category: "أكل وشرب", subCategory: "مشروبات" },
  "ريد بول": { category: "أكل وشرب", subCategory: "مشروبات" },
  كورة: { category: "ترفيه", subCategory: "رياضة وجيم" },
  كوره: { category: "ترفيه", subCategory: "رياضة وجيم" },
};

/**
 * Strategy 2: Merchant & Brand Registry (0 tokens, 100% confidence)
 * ─────────────────────────────────────────────────────────────────
 * Maps well-known Egyptian and global brand names to exact categories.
 * When a merchant name is detected, the category is determined instantly
 * with absolute certainty, completely bypassing the AI.
 */
const MERCHANT_REGISTRY: Record<
  string,
  { category: string; subCategory: string }
> = {
  // ── Pharmacies & Health ──
  العزبي: { category: "صحة", subCategory: "صيدلية" },
  "صيدلية العزبي": { category: "صحة", subCategory: "صيدلية" },
  "صيدليات العزبي": { category: "صحة", subCategory: "صيدلية" },
  رشدي: { category: "صحة", subCategory: "صيدلية" },
  "صيدلية رشدي": { category: "صحة", subCategory: "صيدلية" },
  سيف: { category: "صحة", subCategory: "صيدلية" },
  "صيدلية سيف": { category: "صحة", subCategory: "صيدلية" },
  // ── Gas Stations & Fuel ──
  وطنية: { category: "مواصلات", subCategory: "بنزين" },
  "بنزينة وطنية": { category: "مواصلات", subCategory: "بنزين" },
  توتال: { category: "مواصلات", subCategory: "بنزين" },
  موبيل: { category: "مواصلات", subCategory: "بنزين" },
  شيل: { category: "مواصلات", subCategory: "بنزين" },
  بنزينه: { category: "مواصلات", subCategory: "بنزين" },
  المحطه: { category: "مواصلات", subCategory: "بنزين" },
  "امارات مصر": { category: "مواصلات", subCategory: "بنزين" },
  كووبرتف: { category: "مواصلات", subCategory: "بنزين" },
  // ── Supermarkets & Grocery ──
  كارفور: { category: "أكل وشرب", subCategory: "بقالة" },
  سبينيس: { category: "أكل وشرب", subCategory: "بقالة" },
  "مترو ماركت": { category: "أكل وشرب", subCategory: "بقالة" },
  "فتح الله": { category: "أكل وشرب", subCategory: "بقالة" },
  كازيون: { category: "أكل وشرب", subCategory: "بقالة" },
  "هايبر وان": { category: "أكل وشرب", subCategory: "بقالة" },
  "اولاد رجب": { category: "أكل وشرب", subCategory: "بقالة" },
  بيم: { category: "أكل وشرب", subCategory: "بقالة" },
  "خير زمان": { category: "أكل وشرب", subCategory: "بقالة" },
  // ── Fast Food & Restaurants ──
  ماك: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  ماكدونالدز: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  كنتاكي: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  هارديز: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "برجر كينج": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "بيتزا هت": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  بافلو: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  الشبراوي: { category: "أكل وشرب", subCategory: "مطعم" },
  "ابو طارق": { category: "أكل وشرب", subCategory: "مطعم" },
  "كشري التحرير": { category: "أكل وشرب", subCategory: "مطعم" },
  "بيتزا كينج": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "صبحي كابر": { category: "أكل وشرب", subCategory: "مطعم" },
  // ── E-Commerce & Shopping ──
  امازون: { category: "تسوق", subCategory: "عام" },
  أمازون: { category: "تسوق", subCategory: "عام" },
  نون: { category: "تسوق", subCategory: "عام" },
  جوميا: { category: "تسوق", subCategory: "عام" },
  "شي ان": { category: "تسوق", subCategory: "ملابس" },
  "شي إن": { category: "تسوق", subCategory: "ملابس" },
  زارا: { category: "تسوق", subCategory: "ملابس" },
  "اتش اند ام": { category: "تسوق", subCategory: "ملابس" },
  ديفاكتو: { category: "تسوق", subCategory: "ملابس" },
  اديداس: { category: "تسوق", subCategory: "ملابس" },
  نايكي: { category: "تسوق", subCategory: "ملابس" },
  // ── Telecom ──
  فودافون: { category: "فواتير", subCategory: "شحن رصيد" },
  اورنج: { category: "فواتير", subCategory: "شحن رصيد" },
  اتصالات: { category: "فواتير", subCategory: "شحن رصيد" },
  وي: { category: "فواتير", subCategory: "إنترنت" },
  // ── Subscriptions ──
  نتفلكس: { category: "اشتراكات", subCategory: "نتفلكس" },
  سبوتيفاي: { category: "اشتراكات", subCategory: "سبوتيفاي" },
  شاهد: { category: "اشتراكات", subCategory: "شاهد" },
  "يوتيوب بريميوم": { category: "اشتراكات", subCategory: "يوتيوب" },
  // ── Transport Apps ──
  اوبر: { category: "مواصلات", subCategory: "أوبر/كريم" },
  كريم: { category: "مواصلات", subCategory: "أوبر/كريم" },
  سويفل: { category: "مواصلات", subCategory: "أتوبيس" },
  اندرايفر: { category: "مواصلات", subCategory: "أوبر/كريم" },
  ديدي: { category: "مواصلات", subCategory: "أوبر/كريم" },
  // ── BNPL / Fintech ──
  فاليو: { category: "فواتير", subCategory: "أقساط" },
  سهوله: { category: "فواتير", subCategory: "أقساط" },
  خزنه: { category: "فواتير", subCategory: "أقساط" },
  فوري: { category: "فواتير", subCategory: "خدمات" },
  انستاباي: { category: "تحويل", subCategory: "تحويل" },
  // ── Cafes ──
  ستاربكس: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  سيلانترو: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  كوستا: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  ميكاتو: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  ريدبول: { category: "أكل وشرب", subCategory: "مشروبات" },
  "ريد بول": { category: "أكل وشرب", subCategory: "مشروبات" },
  // ── Education ──
  المنصوره: { category: "تعليم", subCategory: "جامعة" },
  يوديمي: { category: "تعليم", subCategory: "كورسات" },
  كورسيرا: { category: "تعليم", subCategory: "كورسات" },
};

/**
 * Strategy 5: Hierarchical Subcategory Cascade
 * ─────────────────────────────────────────────
 * After determining main category, refine the subcategory
 * using deterministic keyword patterns for higher precision.
 */
function refineSubCategory(
  category: string,
  subCategory: string,
  context: string,
): string {
  // Only refine if subcategory is generic ("عام")
  if (subCategory !== "عام") return subCategory;

  switch (category) {
    case "تعليم":
      if (/(مدرس|درس|دروس|سنتر)/.test(context)) return "دروس خصوصية";
      if (/(كورس|كورسات|دوره|دورة|يوديمي|كورسيرا)/.test(context))
        return "كورسات";
      if (/(جامعه|كليه|ترم|سنه اولى)/.test(context)) return "جامعة";
      if (/(مدرسه|يونيفورم|مصاريف المدرسه)/.test(context)) return "مدرسة";
      if (/(كتب|ملزمه|مذكره|ادوات)/.test(context)) return "كتب";
      return "عام";
    case "صحة":
      if (/(دكتور|عياده|كشف|طبيب|فيزيتا|استشاره)/.test(context)) return "دكتور";
      if (/(صيدليه|دوا|علاج|روشته|بانادول|فيتامين)/.test(context))
        return "صيدلية";
      if (/(تحاليل|اشعه|سونار|رنين)/.test(context)) return "تحاليل";
      if (/(اسنان|ضرس|حشو|خلع)/.test(context)) return "أسنان";
      if (/(مستشفى|عمليه|جراحه)/.test(context)) return "مستشفى";
      return "عام";
    case "مواصلات":
      if (/(اوبر|كريم|اندرايفر|ديدي)/.test(context)) return "أوبر/كريم";
      if (/(بنزين|تفويله|محطه|بنزينه)/.test(context)) return "بنزين";
      if (/(مترو|تذكره مترو)/.test(context)) return "مترو";
      if (/(تاكسي|تكسي)/.test(context)) return "تاكسي";
      if (/(توكتوك)/.test(context)) return "توكتوك";
      if (/(صيانه|عربيه|كاوتش|زيت|ميكانيكي)/.test(context))
        return "صيانة عربية";
      return "عام";
    case "سكن":
      if (/(ايجار|اجار)/.test(context)) return "إيجار";
      if (/(سباك|كهربائي|نقاش|نجار|صيانه)/.test(context)) return "صيانة";
      if (/(عفش|اثاث)/.test(context)) return "أثاث";
      if (/(منظفات|بريل|اريال|صابون)/.test(context)) return "منظفات";
      return "عام";
    case "فواتير":
      if (/(كهربا|نور)/.test(context)) return "كهرباء";
      if (/(ميه|مياه)/.test(context)) return "مياه";
      if (/(غاز)/.test(context)) return "غاز";
      // Guard against matching common words like "انت/كنت" which contain "نت"
      if (
        /(?:^|\s)(?:نت|النت|انترنت|الانترنت|راوتر|واي\s*فاي|wifi|وي|we)(?=\s|$|[.,،؟?!؛:])/.test(
          context,
        )
      )
        return "إنترنت";
      if (/(شحن|رصيد|كارت)/.test(context)) return "شحن رصيد";
      if (/(قسط|اقساط|فاليو|سهوله)/.test(context)) return "أقساط";
      return "عام";
    case "تحويل":
      if (/(atm|سحب|سحبت)/i.test(context)) return "سحب ATM";
      if (/(انستاباي|instapay)/i.test(context)) return "انستاباي";
      if (/(فودافون\s*كاش|vodafone\s*cash)/i.test(context))
        return "فودافون كاش";
      if (/(تحويل\s*بنكي|حواله|حوالة|bank\s*transfer)/i.test(context))
        return "تحويل بنكي";
      if (/(ادخار|وفر|توفير|حوش|تحويش)/.test(context)) return "ادخار";
      if (/(سلف|سلفه|سلفة|دين|قرض)/.test(context)) return "دين/سلفة";
      return "تحويل بنكي";
    case "استثمار":
      if (/(ذهب|دهب|سبيكه|سبيكة|جنيه\s*ذهب|جرام\s*ذهب)/.test(context))
        return "ذهب";
      if (/(اسهم|أسهم|بورصه|بورصة|ثاندر|thndr)/i.test(context)) return "أسهم";
      if (/(شهاده|شهادة|وديعه|وديعة|اذون|أذون)/.test(context)) return "شهادات";
      if (/(عقار|عقارات|ارض|أرض|شقه\s*تمليك|شقة\s*تمليك|تمليك)/.test(context))
        return "عقارات";
      if (
        /(بتكوين|بيتكوين|bitcoin|btc|usdt|كريبتو|عملات\s*رقميه|عملات\s*رقمية)/i.test(
          context,
        )
      )
        return "عملات رقمية";
      return "ذهب";
    case "ترفيه":
      if (/(سينما|فيلم)/.test(context)) return "سينما";
      if (/(جيم|رياضه|بروتين)/.test(context)) return "رياضة وجيم";
      if (/(سفر|مصيف|رحله)/.test(context)) return "سفر";
      if (/(خروجه|فسحه|تمشيه)/.test(context)) return "خروجة";
      if (/(شيشه|كافيه)/.test(context)) return "كافيه";
      if (/(بلايستيشن|اكس بوكس|العاب)/.test(context)) return "ألعاب";
      return "عام";
    case "أكل وشرب":
      if (/(قهوه|نسكافيه|لاتيه|كابتشينو|ستاربكس)/.test(context))
        return "قهوة وكافيه";
      if (/(دليفري|تيك اواي|طلبات)/.test(context)) return "دليفري";
      if (/(بقاله|سوبر|خضار|فاكهه|بيض|لبن)/.test(context)) return "بقالة";
      if (/(شيبسي|شوكولاته|حلويات|ايس كريم|بسبوسه)/.test(context))
        return "سناكس";
      if (/(لحمه|فراخ|سمك|جمبري)/.test(context)) return "لحوم ودواجن";
      if (/(عيش|مخبز|فرن)/.test(context)) return "مخبوزات";
      return "مطعم";
    case "هدايا وصدقات":
      if (/(صدقه|زكاه|تبرع|جامع|رساله)/.test(context)) return "صدقة/تبرع";
      if (/(عيديه)/.test(context)) return "عيدية";
      return "عام";
    default:
      return subCategory;
  }
}

/**
 * Determine if text is simple enough for rule engine (no AI needed)
 */
export function isSimpleText(text: string): boolean {
  const normalizedLen = text.length;
  const wordCount = text.split(/\s+/).length;

  // Too long = complex
  if (normalizedLen > 200 || wordCount > 30) return false;

  // Multiple "و" connectors with amounts = multi-transaction
  const amounts = extractAmounts(text);
  if (amounts.length > 4) return false;

  // Ambiguous phrases
  const ambiguousPatterns = [
    /حولت\s+\S+/, // "حولت لأحمد" - ambiguous
    /اديت\s+\S+/, // "اديت مروان" - ambiguous
    /إديت\s+\S+/,
    /عطيت\s+\S+/,
    /سلفت\s+\S+/,
    /خد\s+مني/,
    /اخد\s+مني/,
    /حطيت\s+فلوس/, // "حطيت فلوس" - ambiguous
    /ولا\s+\d/, // "خمسين ولا ستين" - uncertain
  ];

  for (const pattern of ambiguousPatterns) {
    if (pattern.test(text)) return false;
  }

  return true;
}

/**
 * Run the rule engine on normalized text
 */
export function runRuleEngine(
  normalizedText: string,
  userDict: Array<{
    word: string;
    category: string;
    subCategory?: string;
  }> = [],
  profileContext?: ClassificationProfileContext,
): RuleEngineResult {
  const amounts = extractAmounts(normalizedText);

  if (amounts.length === 0) {
    return {
      items: [],
      usedAI: false,
      needsAI: true,
      reason: "no_amounts_found",
    };
  }

  // Note: We no longer return early here! We want the backend to try extracting items
  // even for complex text so it can provide hints to the AI.
  const isComplex = !isSimpleText(normalizedText);

  const items: ParsedTransaction[] = [];

  // Normalize user dictionary keys once to avoid mismatches caused by Arabic variants
  // (أ/إ/آ, ى/ي, ة/ه, etc.) since normalizedText already goes through a normalizer.
  const userDictByWord = new Map<
    string,
    { category: string; subCategory?: string }
  >();
  for (const row of userDict) {
    const key = normalizeArabic(String(row.word || ""))
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!key) continue;
    userDictByWord.set(key, {
      category: row.category,
      subCategory: row.subCategory ?? undefined,
    });
  }

  for (let i = 0; i < amounts.length; i++) {
    const { amount, index, length } = amounts[i];
    const contextStart =
      i > 0 ? amounts[i - 1].index + amounts[i - 1].length : 0;
    const contextEnd =
      i < amounts.length - 1 ? amounts[i + 1].index : normalizedText.length;
    const beforeAmount = normalizedText.slice(contextStart, index).trim();
    const afterAmount = normalizedText.slice(index + length, contextEnd).trim();
    const allContext = (beforeAmount + " " + afterAmount).trim();
    const allContextNorm = normalizeArabic(allContext).toLowerCase();

    const intentResult = detectIntent(allContext);

    let category =
      intentResult.intent === "income"
        ? "مرتب"
        : intentResult.intent === "transfer"
          ? "تحويل"
          : intentResult.intent === "investment"
            ? "استثمار"
            : "متنوعات";
    let subCategory = "عام";
    let confidence = 30;
    let inferenceSource: ParsedTransaction["inferenceSource"] = "rule";
    let ambiguityFlags: string[] | undefined;
    const words = allContext.split(/\s+/).filter((w) => w.length >= 2);
    const normWords = words
      .map((w) => normalizeArabic(w).replace(/\s+/g, " ").trim().toLowerCase())
      .filter(Boolean);

    let found = false;

    if (intentResult.intent === "expense") {
      if (
        /(?:شربت|اشربت|شربنا|شرب)\s*(?:قهو|قهوه|قهوة|كوفي|كابتشينو|لاتيه|نسكافيه|كافيه)/.test(
          allContext,
        )
      ) {
        category = "أكل وشرب";
        subCategory = "قهوة وكافيه";
        confidence = 93;
        inferenceSource = "rule";
        ambiguityFlags = ["voice_colloquial_drink"];
        found = true;
      } else if (
        /(?:اشتريت|جبت|دفعت|صرفت|اخدت)\s*(?:شاورما|برجر|بيتزا|وجبه|وجبة|سندوتش)/.test(
          allContext,
        )
      ) {
        category = "أكل وشرب";
        subCategory = /بيتزا|برجر/.test(allContext) ? "وجبات سريعة" : "مطعم";
        confidence = 91;
        inferenceSource = "rule";
        found = true;
      } else if (/(?:شحنت|شحنة)\s*(?:رصيد|موبايل|نت)/.test(allContext)) {
        category = "فواتير";
        // Guard against matching "انت/كنت" which contain "نت" as a substring.
        const hasInternetWord =
          /(?:^|\s)(?:نت|النت|انترنت|الانترنت)(?=\s|$|[.,،؟?!؛:])/.test(
            allContext,
          );
        subCategory = hasInternetWord ? "إنترنت" : "شحن رصيد";
        confidence = 92;
        inferenceSource = "rule";
        found = true;
      } else if (
        /(?:ركبت|اخدت|مشيت)\s*(?:اوبر|كريم|تاكسي|مترو)/.test(allContext)
      ) {
        category = "مواصلات";
        subCategory = /اوبر|كريم/.test(allContext)
          ? "أوبر/كريم"
          : /مترو/.test(allContext)
            ? "مترو"
            : "تاكسي";
        confidence = 91;
        inferenceSource = "rule";
        found = true;
      }
    }

    // 1. User dictionary (highest priority)
    for (const word of normWords) {
      const userMatch = userDictByWord.get(word);
      if (userMatch) {
        category = userMatch.category;
        subCategory = userMatch.subCategory || "عام";
        confidence = 100;
        inferenceSource = "dictionary";
        found = true;
        
        // Fix: If it's a known person, "اديت" should be an expense, not a transfer
        if (["العائلة", "أصدقاء", "موظفين"].includes(category)) {
          intentResult.intent = "expense";
        }
        break;
      }
    }

    // 1.5 Merchant Registry (Strategy 2: instant brand recognition, 0 tokens)
    if (!found) {
      // Check multi-word merchant names first (longer = more specific)
      const merchantKeys = Object.keys(MERCHANT_REGISTRY).sort(
        (a, b) => b.length - a.length,
      );
      for (const merchant of merchantKeys) {
        if (matchArabicPhrase(allContext, merchant)) {
          category = MERCHANT_REGISTRY[merchant].category;
          subCategory = MERCHANT_REGISTRY[merchant].subCategory;
          confidence = 100;
          inferenceSource = "dictionary";
          ambiguityFlags = ["merchant_registry_hit"];
          found = true;
          break;
        }
      }
    }

    if (!found) {
      const synonymMatch = findTaxonomyMatch(allContext);
      if (synonymMatch) {
        category = synonymMatch.category;
        subCategory = synonymMatch.subCategory;
        confidence = synonymMatch.confidence;
        inferenceSource = "synonym";
        ambiguityFlags = synonymMatch.ambiguityFlags;
        found = true;
      }
    }

    // 2. Subcategory map (enriched matching — exact word)
    if (!found) {
      for (const word of words) {
        const normalizedWord = normalizeArabic(word).toLowerCase();
        const hit = SUB_CATEGORY_MAP[word] || SUB_CATEGORY_MAP[normalizedWord];
        if (hit) {
          category = hit.category;
          subCategory = hit.subCategory;
          confidence = 90;
          inferenceSource = "rule";
          found = true;
          break;
        }
      }
    }

    // 2.5. Substring matching in SUB_CATEGORY_MAP (catches "فبلايستيشن" → "بلايستيشن")
    if (!found) {
      const subMapKeys = Object.keys(SUB_CATEGORY_MAP);
      for (const word of words) {
        for (const key of subMapKeys) {
          if (
            key.length >= 3 &&
            (word.includes(key) || key.includes(word)) &&
            word.length >= 3
          ) {
            category = SUB_CATEGORY_MAP[key].category;
            subCategory = SUB_CATEGORY_MAP[key].subCategory;
            confidence = 82;
            inferenceSource = "rule";
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    // 3. Multi-word subcategory match
    if (!found) {
      for (let w = 0; w < words.length - 1; w++) {
        const phrase = words[w] + " " + words[w + 1];
        const phraseNorm = normalizeArabic(phrase).toLowerCase();
        const hit = SUB_CATEGORY_MAP[phrase] || SUB_CATEGORY_MAP[phraseNorm];
        if (hit) {
          category = hit.category;
          subCategory = hit.subCategory;
          confidence = 88;
          inferenceSource = "rule";
          found = true;
          break;
        }
      }
    }

    // 4. Multi-word global dictionary (prefer more specific phrases first)
    if (!found) {
      for (let w = 0; w < words.length - 1; w++) {
        const phrase = words[w] + " " + words[w + 1];
        const phraseNorm = normalizeArabic(phrase).toLowerCase();
        const dictHit =
          CATEGORY_DICTIONARY[phrase] || CATEGORY_DICTIONARY[phraseNorm];
        if (dictHit) {
          category = dictHit;
          // Try to derive a more specific subcategory (from the phrase or its parts)
          const phraseSubHit =
            SUB_CATEGORY_MAP[phrase] || SUB_CATEGORY_MAP[phraseNorm];
          if (phraseSubHit) {
            subCategory = phraseSubHit.subCategory;
            confidence = 86;
          } else {
            subCategory = "عام";
            confidence = 84;
          }
          inferenceSource = "dictionary";
          found = true;
          break;
        }
      }
    }

    // 5. Global dictionary (single-token)
    if (!found) {
      for (const word of words) {
        const normalizedWord = normalizeArabic(word).toLowerCase();
        const dictHit =
          CATEGORY_DICTIONARY[word] || CATEGORY_DICTIONARY[normalizedWord];
        if (dictHit) {
          category = dictHit;
          // Try to derive a more specific subcategory
          const subHit =
            SUB_CATEGORY_MAP[word] || SUB_CATEGORY_MAP[normalizedWord];
          if (subHit) {
            subCategory = subHit.subCategory;
            confidence = 88;
          } else {
            subCategory = "عام";
            confidence = 85;
          }
          inferenceSource = "dictionary";
          found = true;
          break;
        }
      }
    }

    // 6. Fuzzy match
    if (!found) {
      for (const word of words) {
        const fuzzyResult = fuzzyFindCategory(word, CATEGORY_DICTIONARY, 2);
        if (fuzzyResult && typeof fuzzyResult === "string") {
          category = fuzzyResult;
          subCategory = "عام";
          confidence = 60;
          inferenceSource = "dictionary";
          found = true;
          break;
        }
      }
    }

    // Income with no specific category
    if (intentResult.intent === "income" && !found) {
      category = "مرتب";
      subCategory = "عام";
      confidence = intentResult.confidence;
    }

    // If still "متنوعات", we let it pass through but with low confidence.
    // We no longer return early and discard all previous successes.
    if (category === "متنوعات" && confidence < 60) {
      // Keep going, this item will trigger `needsAI = true` at the end
    }

    let description = allContext
      .replace(/\d+(\.\d+)?/g, "")
      .replace(/(^|\s)(جنيه|ج\.م|ج|الف|ألف)(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    if (!description || description.length < 2) {
      description = intentResult.intent === "income" ? "دخل" : category;
    }

    // Strategy 5: Hierarchical Subcategory Cascade — refine generic subcategories
    const refinedSubCategory = refineSubCategory(
      category,
      subCategory,
      allContext,
    );

    items.push(
      applyProfileHints(
        {
          amount,
          category,
          subCategory: refinedSubCategory,
          description,
          type: intentResult.intent,
          confidence,
          currency: "EGP",
          needsReview: confidence < 85,
          parsedBy: "rule_engine",
          inferenceSource,
          ambiguityFlags,
          confidenceBreakdown: {
            intent: intentResult.confidence,
            taxonomy: confidence,
            heuristics: Math.min(
              100,
              Math.max(
                20,
                Math.round((intentResult.confidence + confidence) / 2),
              ),
            ),
          },
        },
        allContext,
        profileContext,
      ),
    );
  }

  // Check if any item has low confidence or if text is complex → needs AI
  const needsAI =
    items.some((it) => it.category === "متنوعات" || it.confidence < 80) ||
    isComplex;

  return { items, usedAI: false, needsAI };
}

function applyProfileHints(
  item: ParsedTransaction,
  context: string,
  profileContext?: ClassificationProfileContext,
): ParsedTransaction {
  if (!profileContext || item.type !== "expense") return item;

  const next: ParsedTransaction = { ...item };
  const flags = new Set(next.ambiguityFlags || []);

  if (
    profileContext.hasChildren === true &&
    /(مدرس|مدرسة|حضانة|درس|دروس|كتب|يونيفورم)/.test(context)
  ) {
    if (next.category === "متنوعات" || next.confidence < 92) {
      next.category = "تعليم";
      next.subCategory = /درس|دروس/.test(context) ? "دروس خصوصية" : "مدرسة";
      next.confidence = Math.max(next.confidence, 92);
      next.needsReview = false;
      flags.add("profile_children_education_hint");
    }
  }

  if (
    profileContext.responsibleForFamily === true &&
    /(طلبات البيت|مصروف البيت|سوبر ماركت|بقالة|منظفات)/.test(context)
  ) {
    if (next.category === "متنوعات" || next.confidence < 88) {
      next.category = /منظفات/.test(context) ? "سكن" : "أكل وشرب";
      next.subCategory = /منظفات/.test(context) ? "منظفات" : "بقالة";
      next.confidence = Math.max(next.confidence, 88);
      next.needsReview = next.confidence < 85;
      flags.add("profile_family_household_hint");
    }
  }

  next.ambiguityFlags = Array.from(flags);
  if (next.confidenceBreakdown) {
    next.confidenceBreakdown = {
      ...next.confidenceBreakdown,
      taxonomy: Math.max(next.confidenceBreakdown.taxonomy, next.confidence),
    };
  }
  return next;
}
