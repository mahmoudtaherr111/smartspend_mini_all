/**
 * SmartSpend Rule Engine (Step 4)
 * Fast classification without AI for simple/clear transactions
 */

import { CATEGORY_DICTIONARY, isWawWhitelisted } from "./egyptian-dictionary";
import { fuzzyFindCategory, normalizeArabic, matchArabicPhrase, stripArabicPrefix } from "./fuzzy-match";
import { detectIntent, type TransactionIntent } from "./intent-detector";
import { extractAmounts, type ExtractedAmount } from "./entity-extractor";
import { normalizeText } from "./text-normalizer";
import { CATEGORIES } from "./category-registry";
import { findTaxonomyMatch } from "./taxonomy-adapter";
import { matchSegment } from "./embedding-engine";
import { isKareemPersonContext } from "./egyptian-names-dictionary";

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
  date?: string;
  person_mentioned?: string;
  person_relationship?: string;
  businessId?: number;
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
export const SUB_CATEGORY_MAP: Record<
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
  اكل: { category: "أكل وشرب", subCategory: "عام" },
  أكل: { category: "أكل وشرب", subCategory: "عام" },
  اكلت: { category: "أكل وشرب", subCategory: "مطعم" },
  أكلت: { category: "أكل وشرب", subCategory: "مطعم" },
  غدا: { category: "أكل وشرب", subCategory: "مطعم" },
  غداء: { category: "أكل وشرب", subCategory: "مطعم" },
  عشا: { category: "أكل وشرب", subCategory: "مطعم" },
  عشاء: { category: "أكل وشرب", subCategory: "مطعم" },
  فطار: { category: "أكل وشرب", subCategory: "مطعم" },
  إفطار: { category: "أكل وشرب", subCategory: "مطعم" },
  دليفري: { category: "أكل وشرب", subCategory: "دليفري" },
  "تيك اواي": { category: "أكل وشرب", subCategory: "دليفري" },
  قهوه: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  قهوة: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  قهوجي: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
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
  فول: { category: "أكل وشرب", subCategory: "مطعم" },
  طعميه: { category: "أكل وشرب", subCategory: "مطعم" },
  طعمية: { category: "أكل وشرب", subCategory: "مطعم" },
  كبده: { category: "أكل وشرب", subCategory: "مطعم" },
  كبدة: { category: "أكل وشرب", subCategory: "مطعم" },
  حواوشي: { category: "أكل وشرب", subCategory: "مطعم" },
  كريب: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  عصير: { category: "أكل وشرب", subCategory: "مشروبات" },
  قصب: { category: "أكل وشرب", subCategory: "مشروبات" },
  بيتزا: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  سوشي: { category: "أكل وشرب", subCategory: "سي فود" },
  برجر: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  كشك: { category: "أكل وشرب", subCategory: "سناكس" },
  // Transport subcategories
  اوبر: { category: "مواصلات", subCategory: "أوبر/كريم" },
  كريم: { category: "مواصلات", subCategory: "أوبر/كريم" },
  مترو: { category: "مواصلات", subCategory: "مترو" },
  اتوبيس: { category: "مواصلات", subCategory: "أتوبيس" },
  باص: { category: "مواصلات", subCategory: "أتوبيس" },
  تكسي: { category: "مواصلات", subCategory: "تاكسي" },
  تاكسي: { category: "مواصلات", subCategory: "تاكسي" },
  بنزين: { category: "مواصلات", subCategory: "بنزين" },
  بنزينه: { category: "مواصلات", subCategory: "بنزين" },
  بنزينة: { category: "مواصلات", subCategory: "بنزين" },
  تفويله: { category: "مواصلات", subCategory: "بنزين" },
  ركنه: { category: "مواصلات", subCategory: "ركنة" },
  جراج: { category: "مواصلات", subCategory: "ركنة" },
  توكتوك: { category: "مواصلات", subCategory: "توكتوك" },
  "صيانه عربيه": { category: "مواصلات", subCategory: "صيانة عربية" },
  عربيه: { category: "مواصلات", subCategory: "صيانة عربية" },
  عربية: { category: "مواصلات", subCategory: "صيانة عربية" },
  ميكروباص: { category: "مواصلات", subCategory: "أتوبيس" },
  سويفل: { category: "مواصلات", subCategory: "أتوبيس" },
  "ان درايف": { category: "مواصلات", subCategory: "أوبر/كريم" },
  اندرايف: { category: "مواصلات", subCategory: "أوبر/كريم" },
  ديدي: { category: "مواصلات", subCategory: "أوبر/كريم" },
  تذكره: { category: "مواصلات", subCategory: "مترو" },
  تذكرة: { category: "مواصلات", subCategory: "مترو" },
  تيكت: { category: "مواصلات", subCategory: "مترو" },
  // "مشروع" removed — means "project/business" in Egyptian Arabic, NOT a bus.
  // Was causing "دفعت في المشروع 5000" → مواصلات/أتوبيس (critical misclassification).
  // Bug #10 fix: "قطر" means the country Qatar, not a train.
  // Use "قطار" (train) instead as the keyword.
  قطار: { category: "مواصلات", subCategory: "قطار" },
  // Bills subcategories
  كهربا: { category: "فواتير", subCategory: "كهرباء" },
  كهرباء: { category: "فواتير", subCategory: "كهرباء" },
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
  ضرايب: { category: "خدمات حكومية", subCategory: "ضرائب" },
  باقه: { category: "فواتير", subCategory: "إنترنت" },
  باقة: { category: "فواتير", subCategory: "إنترنت" },
  // Home subcategories
  سكن: { category: "سكن", subCategory: "عام" },
  ايجار: { category: "سكن", subCategory: "إيجار" },
  الايجار: { category: "سكن", subCategory: "إيجار" },
  إيجار: { category: "سكن", subCategory: "إيجار" },
  تشطيب: { category: "سكن", subCategory: "صيانة" },
  مقاول: { category: "سكن", subCategory: "صيانة" },
  صيانة: { category: "سكن", subCategory: "صيانة" },
  سباك: { category: "سكن", subCategory: "صيانة" },
  كهربائي: { category: "سكن", subCategory: "صيانة" },
  نقاش: { category: "سكن", subCategory: "صيانة" },
  نجار: { category: "سكن", subCategory: "صيانة" },
  شغاله: { category: "سكن", subCategory: "نظافة" },
  منظفات: { category: "سكن", subCategory: "منظفات" },
  غساله: { category: "سكن", subCategory: "أجهزة منزلية" },
  تلاجه: { category: "سكن", subCategory: "أجهزة منزلية" },
  بواب: { category: "سكن", subCategory: "صيانة" },
  زبال: { category: "سكن", subCategory: "صيانة" },
  // Shopping subcategories
  هدوم: { category: "تسوق", subCategory: "ملابس" },
  لبس: { category: "تسوق", subCategory: "ملابس" },
  تيشيرت: { category: "تسوق", subCategory: "ملابس" },
  بنطلون: { category: "تسوق", subCategory: "ملابس" },
  كاب: { category: "تسوق", subCategory: "ملابس" },
  قميص: { category: "تسوق", subCategory: "ملابس" },
  جاكيت: { category: "تسوق", subCategory: "ملابس" },
  فستان: { category: "تسوق", subCategory: "ملابس" },
  شراب: { category: "تسوق", subCategory: "ملابس" },
  بلوفر: { category: "تسوق", subCategory: "ملابس" },
  "سويت شيرت": { category: "تسوق", subCategory: "ملابس" },
  شوز: { category: "تسوق", subCategory: "أحذية" },
  صندل: { category: "تسوق", subCategory: "أحذية" },
  شبشب: { category: "تسوق", subCategory: "أحذية" },
  "هاف بوت": { category: "تسوق", subCategory: "أحذية" },
  بوت: { category: "تسوق", subCategory: "أحذية" },
  // Bug #9 fix: "موبايل" alone is ambiguous — can be shopping OR recharge.
  // Removed from SUB_CATEGORY_MAP; handled contextually in the classification loop instead.
  // موبايل: { category: "تسوق", subCategory: "أجهزة إلكترونية" }, ← DELETED
  "تليفون جديد": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  "موبايل جديد": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  "موبايل مستعمل": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  "لاب توب": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  ايفون: { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  شاحن: { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  سلك: { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  سماعه: { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  سماعة: { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  كفر: { category: "تسوق", subCategory: "إكسسوارات" },
  جراب: { category: "تسوق", subCategory: "إكسسوارات" },
  كوتشي: { category: "تسوق", subCategory: "أحذية" },
  جزمه: { category: "تسوق", subCategory: "أحذية" },
  شوبينج: { category: "تسوق", subCategory: "تسوق عام" },
  حلاق: { category: "تسوق", subCategory: "عناية شخصية" },
  كوافير: { category: "تسوق", subCategory: "عناية شخصية" },
  مغسله: { category: "تسوق", subCategory: "عناية شخصية" },
  مغسلة: { category: "تسوق", subCategory: "عناية شخصية" },
  // Bug #8 fix: كارفور removed from SUB_CATEGORY_MAP (dead code — MERCHANT_REGISTRY at L251
  // always runs first and overrides this. Having two conflicting entries is misleading).
  // كارفور: { category: "تسوق", subCategory: "سوبر ماركت" }, ← DELETED
  سوبرماركت: { category: "أكل وشرب", subCategory: "بقالة" },
  "سوبر ماركت": { category: "أكل وشرب", subCategory: "بقالة" },
  // Health subcategories
  دكتور: { category: "صحة", subCategory: "دكتور" },
  كشف: { category: "صحة", subCategory: "دكتور" },
  صيدليه: { category: "صحة", subCategory: "صيدلية" },
  صيدلية: { category: "صحة", subCategory: "صيدلية" },
  دوا: { category: "صحة", subCategory: "صيدلية" },
  // stt-corrections rewrites "دوا" and "علاج" to "أدوية", which normalizes to "ادويه" —
  // a form no dictionary listed, so a correction was turning a word the system knew
  // into one it did not. Every surface form is now covered directly.
  دواء: { category: "صحة", subCategory: "صيدلية" },
  ادويه: { category: "صحة", subCategory: "صيدلية" },
  ادوية: { category: "صحة", subCategory: "صيدلية" },
  أدوية: { category: "صحة", subCategory: "صيدلية" },
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
  كوره: { category: "ترفيه", subCategory: "رياضة وجيم" },
  كورة: { category: "ترفيه", subCategory: "رياضة وجيم" },
  ماتش: { category: "ترفيه", subCategory: "رياضة وجيم" },
  ملعب: { category: "ترفيه", subCategory: "رياضة وجيم" },
  سفر: { category: "ترفيه", subCategory: "سفر" },
  مصيف: { category: "ترفيه", subCategory: "سفر" },
  خروجه: { category: "ترفيه", subCategory: "خروجة" },
  عزمت: { category: "ترفيه", subCategory: "خروجة" },
  فرتكت: { category: "ترفيه", subCategory: "ترفيه عام" },
  طيرت: { category: "ترفيه", subCategory: "ترفيه عام" },
  // "رميت" removed from استثمار — in Egyptian Arabic "رميت" means "I spent/lost",
  // NOT investment. Was causing "رميت 50 على القهوة" → استثمار/توفير (critical bug).
  الجمعية: { category: "تحويل", subCategory: "ادخار" },
  جمعية: { category: "تحويل", subCategory: "ادخار" },
  جمعيه: { category: "تحويل", subCategory: "ادخار" },
  الجمعيه: { category: "تحويل", subCategory: "ادخار" },
  بادل: { category: "ترفيه", subCategory: "رياضة وجيم" },
  خماسي: { category: "ترفيه", subCategory: "رياضة وجيم" },
  تراك: { category: "ترفيه", subCategory: "رياضة وجيم" },
  بلياردو: { category: "ترفيه", subCategory: "ألعاب" },
  بلايستيشن: { category: "ترفيه", subCategory: "ألعاب" },
  // Subscriptions
  نتفلكس: { category: "اشتراكات", subCategory: "نتفلكس" },
  سبوتيفاي: { category: "اشتراكات", subCategory: "سبوتيفاي" },
  شاهد: { category: "اشتراكات", subCategory: "نتفلكس" },
  "واتش ات": { category: "اشتراكات", subCategory: "نتفلكس" },
  يوتيوب: { category: "اشتراكات", subCategory: "عام" },
  برايم: { category: "اشتراكات", subCategory: "نتفلكس" },
  انغامي: { category: "اشتراكات", subCategory: "سبوتيفاي" },
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
  // Egyptian slang
  // "شلت" alone removed — ambiguous: "شلت فلوس"=withdrawal, "شلت دهب"=gold purchase.
  // Only specific phrases "شلت دهب"/"شلت ذهب" remain mapped to investment/gold.
  "شلت دهب": { category: "استثمار", subCategory: "ذهب" },
  "شلت ذهب": { category: "استثمار", subCategory: "ذهب" },
  // Income subcategories
  مرتب: { category: "مرتب", subCategory: "مرتب أساسي" },
  بونص: { category: "مرتب", subCategory: "مكافأة/بونص" },
  مكافاه: { category: "مرتب", subCategory: "مكافأة/بونص" },
  قبض: { category: "مرتب", subCategory: "مرتب أساسي" },
  سلفه: { category: "مرتب", subCategory: "سلف/قروض" },
  سلفة: { category: "مرتب", subCategory: "سلف/قروض" },
  سلف: { category: "تحويل", subCategory: "دين/سلفة" },
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

  بامبرز: { category: "تسوق", subCategory: "عناية شخصية" },
  حفاظات: { category: "تسوق", subCategory: "عناية شخصية" },
  لبن: { category: "أكل وشرب", subCategory: "بقالة" },
  مناديل: { category: "سكن", subCategory: "منظفات" },
  مسحوق: { category: "سكن", subCategory: "منظفات" },
  مكواه: { category: "تسوق", subCategory: "ملابس" },
  مكواة: { category: "تسوق", subCategory: "ملابس" },
  "دراي كلين": { category: "تسوق", subCategory: "ملابس" },
  مكوجي: { category: "تسوق", subCategory: "ملابس" },
  لبان: { category: "أكل وشرب", subCategory: "سناكس" },
  شيبسي: { category: "أكل وشرب", subCategory: "سناكس" },
  بيبسي: { category: "أكل وشرب", subCategory: "سناكس" },
  بيبسى: { category: "أكل وشرب", subCategory: "سناكس" },
  كولا: { category: "أكل وشرب", subCategory: "سناكس" },
  كانز: { category: "أكل وشرب", subCategory: "سناكس" },
  اوريو: { category: "أكل وشرب", subCategory: "سناكس" },
  هوهوز: { category: "أكل وشرب", subCategory: "سناكس" },
  دونت: { category: "أكل وشرب", subCategory: "سناكس" },
  بسكوت: { category: "أكل وشرب", subCategory: "سناكس" },
  بسكويت: { category: "أكل وشرب", subCategory: "سناكس" },
  
  // Contextual Patterns (Smart Brain)
  // Vendor / Action Modifiers
  "عربيه كبده": { category: "أكل وشرب", subCategory: "مطعم" },
  "عربية كبدة": { category: "أكل وشرب", subCategory: "مطعم" },
  "عربيه فول": { category: "أكل وشرب", subCategory: "مطعم" },
  "عربية فول": { category: "أكل وشرب", subCategory: "مطعم" },
  "بتاع اللبن": { category: "أكل وشرب", subCategory: "بقالة" },
  "بتاع الخضار": { category: "أكل وشرب", subCategory: "بقالة" },
  "بتاع الانابيب": { category: "فواتير", subCategory: "غاز" },
  "غسيل عربيه": { category: "مواصلات", subCategory: "صيانة عربية" },
  "غسيل عربية": { category: "مواصلات", subCategory: "صيانة عربية" },
  "فول سوداني": { category: "أكل وشرب", subCategory: "سناكس" },
  "ورق عنب": { category: "أكل وشرب", subCategory: "بقالة" },
  "بن قهوه": { category: "أكل وشرب", subCategory: "بقالة" },
  "بن قهوة": { category: "أكل وشرب", subCategory: "بقالة" },
  "قهوه تركي": { category: "أكل وشرب", subCategory: "بقالة" },
  "قهوة تركي": { category: "أكل وشرب", subCategory: "بقالة" },
  "حجز كوره": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "حجز كورة": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "حجز الكوره": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "حجز الكورة": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "حجز الكره": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "حجز الكرة": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "حجز ملعب": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "حجز الملعب": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "حجز خماسي": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "حجز دكتور": { category: "صحة", subCategory: "دكتور" },
  "حجز كشف": { category: "صحة", subCategory: "دكتور" },
  "لعبت كوره": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "لعبت كورة": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "لعبت كره": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "لعبت كرة": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "لعبت فوتبول": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "لعبت بلياردو": { category: "ترفيه", subCategory: "ألعاب" },
  "لعبت بلايستيشن": { category: "ترفيه", subCategory: "ألعاب" },
  "اشتراك نت": { category: "فواتير", subCategory: "إنترنت" },
  "تجديد باقه": { category: "فواتير", subCategory: "إنترنت" },
  "تجديد باقة": { category: "فواتير", subCategory: "إنترنت" },
  "اشتراك جيم": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "شحن رصيد": { category: "فواتير", subCategory: "شحن رصيد" },
  "شحن الرصيد": { category: "فواتير", subCategory: "شحن رصيد" },
  "شحنت رصيد": { category: "فواتير", subCategory: "شحن رصيد" },
  "دفعت شحن رصيد": { category: "فواتير", subCategory: "شحن رصيد" },
  // Digital/Fintech Services
  تيلدا: { category: "خدمات رقمية", subCategory: "عام" },
  كلينق: { category: "خدمات رقمية", subCategory: "عام" },
  فيزا: { category: "تحويل", subCategory: "تحويل بنكي" },
  استعلام: { category: "تحويل", subCategory: "سحب ATM" },
  تويست: { category: "أكل وشرب", subCategory: "سناكس" },
  // Note: بلايستيشن, كورة, كوره already defined earlier in this map (lines ~223-234)
  "بلاي ستيشن": { category: "ترفيه", subCategory: "ألعاب" },
  ريدبول: { category: "أكل وشرب", subCategory: "مشروبات" },
  "ريد بول": { category: "أكل وشرب", subCategory: "مشروبات" },
  فكيت: { category: "تحويل", subCategory: "أخرى" },
  فك: { category: "تحويل", subCategory: "أخرى" },
  فكه: { category: "تحويل", subCategory: "أخرى" },
  كاش: { category: "تحويل", subCategory: "عام" },
  // Government services
  "جواز سفر": { category: "خدمات حكومية", subCategory: "جواز سفر" },
  جواز: { category: "خدمات حكومية", subCategory: "جواز سفر" },
  "رقم قومي": { category: "خدمات حكومية", subCategory: "بطاقة رقم قومي" },
  "بطاقة رقم قومي": { category: "خدمات حكومية", subCategory: "بطاقة رقم قومي" },
  "مخالفة مرور": { category: "خدمات حكومية", subCategory: "مخالفة مرور" },
  مخالفه: { category: "خدمات حكومية", subCategory: "مخالفة مرور" },
  مخالفة: { category: "خدمات حكومية", subCategory: "مخالفة مرور" },
  "تجديد رخصة": { category: "خدمات حكومية", subCategory: "رخصة" },
  رخصه: { category: "خدمات حكومية", subCategory: "رخصة" },
  رخصة: { category: "خدمات حكومية", subCategory: "رخصة" },
  توثيق: { category: "خدمات حكومية", subCategory: "توثيق" },
  // Missing Egyptian food words
  كنافه: { category: "أكل وشرب", subCategory: "سناكس" },
  كنافة: { category: "أكل وشرب", subCategory: "سناكس" },
  ملوخيه: { category: "أكل وشرب", subCategory: "مطعم" },
  ملوخية: { category: "أكل وشرب", subCategory: "مطعم" },
  فته: { category: "أكل وشرب", subCategory: "مطعم" },
  فتة: { category: "أكل وشرب", subCategory: "مطعم" },
  "فول مدمس": { category: "أكل وشرب", subCategory: "مطعم" },
  شعريه: { category: "أكل وشرب", subCategory: "بقالة" },
  شعرية: { category: "أكل وشرب", subCategory: "بقالة" },
  بوفيه: { category: "أكل وشرب", subCategory: "مطعم" },
  // Missing transport/car words
  ونش: { category: "مواصلات", subCategory: "صيانة عربية" },
  ميكانيكي: { category: "مواصلات", subCategory: "صيانة عربية" },
  كاوتش: { category: "خدمات سيارات", subCategory: "إطارات" },
  "غسلت العربية": { category: "مواصلات", subCategory: "صيانة عربية" },
  "غسيل العربية": { category: "مواصلات", subCategory: "صيانة عربية" },
  // Missing health words
  تطعيم: { category: "صحة", subCategory: "دكتور" },
  طوارئ: { category: "صحة", subCategory: "مستشفى" },
  اسعاف: { category: "صحة", subCategory: "مستشفى" },
  "علاج طبيعي": { category: "صحة", subCategory: "دكتور" },
  بيطري: { category: "حيوانات أليفة", subCategory: "طبيب بيطري" },
  // General missing words
  مول: { category: "تسوق", subCategory: "عام" },
  جزمجي: { category: "تسوق", subCategory: "أحذية" },
  ترزي: { category: "تسوق", subCategory: "ملابس" },
  خياط: { category: "تسوق", subCategory: "ملابس" },
  "مكنة الصراف": { category: "تحويل", subCategory: "سحب ATM" },
  "ماكينة الصراف": { category: "تحويل", subCategory: "سحب ATM" },
  atm: { category: "تحويل", subCategory: "سحب ATM" },
  // Context-aware: "اشتريت شقة" = investment, "إيجار شقة" = home
  "اشتريت شقة": { category: "استثمار", subCategory: "عقارات" },
  "اشتريت شقه": { category: "استثمار", subCategory: "عقارات" },
  "شقة تمليك": { category: "استثمار", subCategory: "عقارات" },
  "شقه تمليك": { category: "استثمار", subCategory: "عقارات" },
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
  "فودافون كاش": { category: "تحويل", subCategory: "فودافون كاش" },
  "اورنج كاش": { category: "تحويل", subCategory: "فودافون كاش" },
  "أورنج كاش": { category: "تحويل", subCategory: "فودافون كاش" },
  "اتصالات كاش": { category: "تحويل", subCategory: "فودافون كاش" },
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
      // Bug #7 fix: استثمار neutral default is "عام" not "ذهب".
      // Previously "استثمرت في عقارات" would wrongly return "ذهب".
      return "عام";
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
      return "عام";
    case "هدايا وصدقات":
      if (/(صدقه|زكاه|تبرع|جامع|رساله)/.test(context)) return "صدقة/تبرع";
      if (/(عيديه)/.test(context)) return "عيدية";
      return "عام";
    case "تسوق":
      if (
        /(?:هدوم|لبس|ملابس|تيشيرت|بنطلون|جاكيت|قميص|فستان|بلوفر|سويت\s*شيرت|شراب|كاب|زارا|zara|اتش\s*اند\s*ام|h&m|ديفاكتو|defacto|ماكس|max|وايكيكي|waikiki|shein|شي\s*ان|شي\s*إن)/i.test(
          context,
        )
      )
        return "ملابس";
      if (
        /(?:جزمة|جرمة|كوتشي|شوز|حذاء|هاف\s*بوت|بوت|صندل|شبشب|اديداس|adidas|نايكي|nike|بوما|puma|ريبوك|reebok)/i.test(
          context,
        )
      )
        return "أحذية";
      if (
        /(?:موبايل|لاب|لابتوب|كمبيوتر|سماعة|سماعه|شاحن|ايفون|تليفون|تلفون|ابل|apple|سامسونج|samsung|شاومي|xiaomi|شاشه|شاشة|تلفزيون)/i.test(
          context,
        )
      )
        return "أجهزة إلكترونية";
      if (
        /(?:حلاق|عناية|عنايه|ميكاب|ميكب|برفان|عطر|شامبو|كريم|صابون|معجون|سيشوار)/.test(
          context,
        )
      )
        return "عناية شخصية";
      if (
        /(?:اكسسوار|اكسسوارات|إكسسوارات|إكسسوار|ساعة|ساعه|نضارة|نضاره|شنطة|شنطه|حزام|محفظة|محفظه|فضة|ذهب)/.test(
          context,
        )
      )
        return "إكسسوارات";
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
  if (normalizedLen > 400 || wordCount > 50) return false;

  // Multiple "و" connectors with amounts = multi-transaction
  const amounts = extractAmounts(text);
  if (amounts.length > 8) return false;

  // Check for multiple distinct main categories (e.g. Shopping + Food)
  // If a user buys two very different things with 1 amount, we need AI to estimate prices.
  const intentResult = detectIntent(text);
  const words = text.split(/\s+/).map(w => normalizeArabic(w).toLowerCase());
  const distinctCategories = new Set<string>();
  
  for (const word of words) {
    if (word.length < 3) continue;
    // Strip Arabic prefixes so "والكهرباء" → "كهرباء" hits the map correctly
    const stripped = stripArabicPrefix(word);
    const candidates = stripped !== word ? [word, stripped] : [word];
    for (const candidate of candidates) {
      const hit = SUB_CATEGORY_MAP[candidate];
      if (hit && !["عام", "متنوعات", "أخرى"].includes(hit.category)) {
        const catType = CATEGORIES.find(c => c.name_ar === hit.category)?.type || "expense";
        if (catType === intentResult.intent) distinctCategories.add(hit.category);
        break;
      }
      const dictHit = CATEGORY_DICTIONARY[candidate];
      if (dictHit && !["عام", "متنوعات", "أخرى"].includes(dictHit)) {
        const catType = CATEGORIES.find(c => c.name_ar === dictHit)?.type || "expense";
        if (catType === intentResult.intent) distinctCategories.add(dictHit);
        break;
      }
    }
  }
  
  if (distinctCategories.size > 1) {
    // We used to return false here assuming multiple categories meant 1 amount split across many items.
    // However, for multi-amount texts, we should allow local processing (heuristic decomposer) to split them.
    // return false; 
  }

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
 * Context-Aware Disambiguation for multi-meaning Egyptian Arabic words.
 * Resolves ambiguity for words that have completely different meanings
 * depending on context (e.g. "نور" = electricity vs a girl's name).
 *
 * Called after SUB_CATEGORY_MAP or MERCHANT_REGISTRY match to verify
 * the category fits the surrounding context. Only overrides when the
 * context provides a clear signal — otherwise keeps the default mapping.
 */
const DISAMBIGUATION_RULES: Record<string, Array<{
  contextPattern: RegExp;
  category: string;
  subCategory: string;
}>> = {
  "عربية": [
    { contextPattern: /فول|كبد[ةه]|خضار|بطاطس|طعمي[ةه]|بيض|لبن/, category: "أكل وشرب", subCategory: "مطعم" },
    { contextPattern: /اشتريت|جبت|جديد|مستعمل/, category: "تسوق", subCategory: "أجهزة إلكترونية" },
    { contextPattern: /طفل|بيبي|حضان[ةه]|عربان[ةه]/, category: "تسوق", subCategory: "عام" },
  ],
  "عربيه": [
    { contextPattern: /فول|كبد[ةه]|خضار|بطاطس|طعمي[ةه]|بيض|لبن/, category: "أكل وشرب", subCategory: "مطعم" },
    { contextPattern: /اشتريت|جبت|جديد|مستعمل/, category: "تسوق", subCategory: "أجهزة إلكترونية" },
    { contextPattern: /طفل|بيبي|حضان[ةه]|عربان[ةه]/, category: "تسوق", subCategory: "عام" },
  ],
  "نور": [
    { contextPattern: /^(?!.*(?:كهربا|نور\s+القطع|قطع\s+النور|سداد|فاتورة|عداد|شركة|فواتير|دفع)).*(?:(?:سلفت|اديت|أديت|حولت|بعت|سلفت|عطيت|سلكت|صفيت|صفّيت|طلعت|بعتت|رديت|وديت|رجعت|فكيت|خدت|اخدت).*(?:نور)|(?:نور).*(?:سلفت|اديت|أديت|حولت|بعت|سلفت|عطيت|سلكت|صفيت|صفّيت|طلعت|بعتت|رديت|وديت|رجعت|فكيت|خدت|اخدت))/, category: "تحويل", subCategory: "أشخاص" },
  ],
  "سيف": [
    { contextPattern: /^(?!.*(?:صيدلي[ةه]|صيدليات|دوا|علاج|روشت[ةه]|روشته)).*(?:(?:سلفت|اديت|أديت|حولت|بعت|سلفت|عطيت|سلكت|صفيت|صفّيت|طلعت|بعتت|رديت|وديت|رجعت|فكيت|خدت|اخدت).*(?:سيف)|(?:سيف).*(?:سلفت|اديت|أديت|حولت|بعت|سلفت|عطيت|سلكت|صفيت|صفّيت|طلعت|بعتت|رديت|وديت|رجعت|فكيت|خدت|اخدت))/, category: "تحويل", subCategory: "أشخاص" },
  ],
  "تذكرة": [
    { contextPattern: /سينما|فيلم/, category: "ترفيه", subCategory: "سينما" },
    { contextPattern: /طيران|طيار[ةه]|flight/i, category: "مواصلات", subCategory: "طيران" },
  ],
  "تذكره": [
    { contextPattern: /سينما|فيلم/, category: "ترفيه", subCategory: "سينما" },
    { contextPattern: /طيران|طيار[ةه]|flight/i, category: "مواصلات", subCategory: "طيران" },
  ],
  "شراب": [
    { contextPattern: /شربت|مشروب|عصير|عصاير/, category: "أكل وشرب", subCategory: "مشروبات" },
  ],
  "كفر": [
    { contextPattern: /عربي?[ةه]|كاوتش|إطار|اطار|تاير|tire/i, category: "خدمات سيارات", subCategory: "إطارات" },
  ],
  "المنصورة": [
    { contextPattern: /سافرت|روحت|خروج[ةه]|مصيف|رحل[ةه]/, category: "ترفيه", subCategory: "سفر" },
  ],
  "المنصوره": [
    { contextPattern: /سافرت|روحت|خروج[ةه]|مصيف|رحل[ةه]/, category: "ترفيه", subCategory: "سفر" },
  ],
  "مشروع": [
    { contextPattern: /ركبت|نزلت|موقف|سواق|ميكروباص|اجرة|أجرة/, category: "مواصلات", subCategory: "أتوبيس" },
    { contextPattern: /بزنس|شغل|استثمار|شراكة|ارباح|أرباح|افتتاح/, category: "استثمار", subCategory: "عام" },
  ],
  "حساب": [
    { contextPattern: /مطعم|كافيه|قهوة|اكل|شرب|سوبر|ماركت|دكان|محل/, category: "أكل وشرب", subCategory: "مطعم" },
    { contextPattern: /بنك|فيزا|كارت|تحويل|سحب|ايداع|إيداع/, category: "تحويل", subCategory: "بنك" },
  ],
};

/**
 * Detects negation, non-payment, invitations, and cancelled transactions in Egyptian Arabic.
 */
export function detectPolarityAndNegation(text: string): {
  isNegated: boolean;
  polarityMultiplier: number;
  reason?: string;
} {
  const norm = normalizeArabic(text).toLowerCase();

  // Explicit non-payment / invitations (e.g. "صاحبي عزمني ومادفعتش مليم", "على حسابه")
  if (
    /(?:عزمني|عزمتني|عزمنا|على\s*حساب|ع\s*حساب|مادفعتش|ما\s*دفعتش|مادفعناش|ما\s*دفعناش|ولا\s*مليم|ولا\s*قرش|ببلاش|مجانا)/.test(
      norm,
    )
  ) {
    return { isNegated: true, polarityMultiplier: 0.0, reason: "invitation_or_zero_payment" };
  }

  // Cancelled or aborted transactions (e.g. "كنت هطلب بس لغيت", "كنت هركب بس مالحقتش")
  if (
    /(?:كنت\s*ه|كنت\s*عايز|كنت\s*ناوي|فكرت\s*اشتري|بس\s*لغيت|بس\s*ملحقتش|بس\s*مالحقتش|لغيت\s*الاوردر|كنسلت|مركبتش|ماشتريتش|ماجبتش)/.test(
      norm,
    )
  ) {
    return { isNegated: true, polarityMultiplier: 0.0, reason: "aborted_or_cancelled_transaction" };
  }

  // Borrowing / Loans
  if (/(?:استلفت|سلفني|سلّفني|دين|قرض|سلف)/.test(norm)) {
    return { isNegated: false, polarityMultiplier: 0.6, reason: "debt_or_loan_context" };
  }

  return { isNegated: false, polarityMultiplier: 1.0 };
}

function disambiguateContext(
  matchedWord: string,
  context: string,
  currentCategory: string,
  currentSubCategory: string,
): { category: string; subCategory: string } | null {
  const normalizedWord = normalizeArabic(matchedWord).toLowerCase().trim();
  const rules = DISAMBIGUATION_RULES[matchedWord] || DISAMBIGUATION_RULES[normalizedWord];
  if (!rules) return null;

  const normalizedContext = normalizeArabic(context).toLowerCase();
  for (const rule of rules) {
    if (rule.contextPattern.test(normalizedContext)) {
      if (rule.category !== currentCategory || rule.subCategory !== currentSubCategory) {
        return { category: rule.category, subCategory: rule.subCategory };
      }
    }
  }
  return null;
}


/**
 * Split a financial text segment on explicit conjunctions (و, ف, etc.)
 * as well as attached "و" prefixes, guarding against naturally waw-starting words
 * (like وجبة, وليد) via the WAW_WHITELIST.
 */
function splitEgyptianConjunctions(text: string): string[] {
  if (!text) return [];
  
  // 1. Initial split on standard explicit separators: ، , + زائد and spaced "و"
  const initialParts = text.split(/\s+و\s+|،|,|\+| زائد /);
  const finalParts: string[] = [];
  
  for (const part of initialParts) {
    const words = part.trim().split(/\s+/);
    if (words.length === 0 || (words.length === 1 && words[0] === "")) continue;
    
    let currentSegment: string[] = [];
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      const startsWithWaw = word.startsWith("و") && word.length > 1;
      
      if (startsWithWaw && i > 0) { // Only split if there is context before it (i > 0)
        const isDoubleWaw = word.startsWith("وو") && word.length > 2;
        const coreWord = word.slice(1);
        
        let shouldSplit = false;
        if (isDoubleWaw) {
          shouldSplit = true;
        } else {
          // If the word itself is NOT naturally starting with waw, split it
          if (!isWawWhitelisted(word)) {
            shouldSplit = true;
          }
        }
        
        if (shouldSplit) {
          if (currentSegment.length > 0) {
            finalParts.push(currentSegment.join(" "));
          }
          currentSegment = [coreWord];
          continue;
        }
      }
      
      currentSegment.push(word);
    }
    
    if (currentSegment.length > 0) {
      finalParts.push(currentSegment.join(" "));
    }
  }
  
  return finalParts;
}

/**
 * Run the rule engine on normalized text
 */
export async function runRuleEngine(
  normalizedText: string,
  userDict: Array<{
    word: string;
    category: string;
    subCategory?: string;
  }> = [],
  profileContext?: ClassificationProfileContext,
  apiKey?: string,
  fireworksApiKey?: string,
): Promise<RuleEngineResult> {
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
    let beforeAmount = normalizedText.slice(contextStart, index).trim();
    let afterAmount = normalizedText.slice(index + length, contextEnd).trim();

    // Prevent context bleeding by splitting shared text using separators
    if (i > 0) {
      const parts = splitEgyptianConjunctions(beforeAmount);
      beforeAmount = parts.length > 0 ? parts[parts.length - 1].trim() : "";
    }
    if (i < amounts.length - 1) {
      const parts = splitEgyptianConjunctions(afterAmount);
      afterAmount = parts.length > 0 ? parts[0].trim() : "";
    }
    const allContext = (beforeAmount + " " + afterAmount).trim();
    const allContextNorm = normalizeArabic(allContext).toLowerCase();
    const intentResult = detectIntent(allContext);
    
    // Multi-Category Ambiguity Pre-Check
    const rawWordsForCheck = allContext.split(/\s+/).filter((w) => w.length >= 2);
    const distinctCats = new Set<string>();
    for (const word of rawWordsForCheck) {
      let norm = normalizeArabic(word).toLowerCase();
      // Strip common prefixes just like the main loop does
      const prefixesRegex = /^(?:و|ف|ب|ل|ال|وال|فال|بال|لل)(?=[^\s]{3,})/i;
      norm = norm.replace(prefixesRegex, "");
      
      // Skip "كريم" in person context during pre-check
      if (norm === "كريم" || norm === "كرييم") {
        if (isKareemPersonContext(allContextNorm)) {
          continue;
        }
      }

      const hitSub = SUB_CATEGORY_MAP[norm];
      if (hitSub) {
        const catType = CATEGORIES.find(c => c.name_ar === hitSub.category)?.type || "expense";
        if (catType === intentResult.intent) distinctCats.add(hitSub.category);
      }
      const hitDict = CATEGORY_DICTIONARY[norm];
      if (hitDict) {
        const catType = CATEGORIES.find(c => c.name_ar === hitDict)?.type || "expense";
        if (catType === intentResult.intent) distinctCats.add(hitDict);
      }
    }
    distinctCats.delete("متنوعات");
    distinctCats.delete("اشتراكات");
    
    // If multiple different categories exist in the same segment, 
    // it's a complex ambiguous sentence (e.g. "جبت أكل وركبت اوبر بـ 500").
    // We used to abort and let the AI handle it, but for massive test cases this causes 429 rate limits.
    // Instead of aborting, we now proceed and pick the first found category.
    /*
    if (distinctCats.size > 1) {
      // EXCEPTION: Supermarket purchases can include household items.
      const hasSupermarketOrGroceries = 
        distinctCats.has("أكل وشرب") && 
        /(سوبرماركت|سوبر|بقالة|كارفور|هايبر)/.test(allContext);
        
      const hasHousehold = distinctCats.has("سكن") || distinctCats.has("منزل"); // "مناديل", "مسحوق" fall under "سكن/منزل"
      
      const remainingCats = new Set(distinctCats);
      remainingCats.delete("أكل وشرب");
      remainingCats.delete("سكن");
      remainingCats.delete("منزل");
      
      const isSupermarketHouseholdCombo = hasSupermarketOrGroceries && hasHousehold && remainingCats.size === 0;

      if (!isSupermarketHouseholdCombo) {
        return {
          items: [],
          usedAI: false,
          needsAI: true,
          reason: "multi_category_segment",
        };
      }
    }
    */

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
      let userMatch = userDictByWord.get(word);
      if (!userMatch && word.startsWith("و") && word.length > 2) {
        userMatch = userDictByWord.get(word.substring(1));
      }
      if (!userMatch && word.startsWith("ل") && word.length > 2) {
        userMatch = userDictByWord.get(word.substring(1));
      }
      if (userMatch) {
        category = userMatch.category;
        subCategory = userMatch.subCategory || "عام";
        confidence = 100;
        inferenceSource = "dictionary";
        found = true;
        
        // Fix: If it's a known person, and type isn't income, "اديت" should be an expense, not a transfer
        if (intentResult.intent !== "income" && ["العائلة", "أصدقاء", "موظفين"].includes(category)) {
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
          // Context-aware disambiguation for merchant names that are also person names
          const disambiguated = disambiguateContext(merchant, allContext, category, subCategory);
          if (disambiguated) {
            category = disambiguated.category;
            subCategory = disambiguated.subCategory;
            confidence = 85;
            ambiguityFlags = [...(ambiguityFlags || []), "disambiguated_from_merchant"];
          }
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

    // 2. Multi-word global dictionary (prefer more specific phrases first - Trigrams & Bigrams)
    if (!found) {
      // Check trigrams first
      for (let w = 0; w < words.length - 2; w++) {
        const phrase = words[w] + " " + words[w + 1] + " " + words[w + 2];
        const phraseNorm = normalizeArabic(phrase).toLowerCase();
        const dictHit =
          CATEGORY_DICTIONARY[phrase] || CATEGORY_DICTIONARY[phraseNorm];
        if (dictHit) {
          category = dictHit;
          const phraseSubHit =
            SUB_CATEGORY_MAP[phrase] || SUB_CATEGORY_MAP[phraseNorm];
          if (phraseSubHit) {
            subCategory = phraseSubHit.subCategory;
            confidence = 87;
          } else {
            subCategory = "عام";
            confidence = 85;
          }
          inferenceSource = "dictionary";
          found = true;
          break;
        }
      }
      
      // Then bigrams
      if (!found) {
        for (let w = 0; w < words.length - 1; w++) {
          const phrase = words[w] + " " + words[w + 1];
          const phraseNorm = normalizeArabic(phrase).toLowerCase();
          const dictHit =
            CATEGORY_DICTIONARY[phrase] || CATEGORY_DICTIONARY[phraseNorm];
          if (dictHit) {
            category = dictHit;
            const phraseSubHit =
              SUB_CATEGORY_MAP[phrase] || SUB_CATEGORY_MAP[phraseNorm];
            if (phraseSubHit) {
              subCategory = phraseSubHit.subCategory;
              confidence = 85;
            } else {
              subCategory = "عام";
              confidence = 82;
            }
            inferenceSource = "dictionary";
            found = true;
            break;
          }
        }
      }
    }

    // 3. Multi-word subcategory match (Trigrams & Bigrams)
    if (!found) {
      // Trigrams
      for (let w = 0; w < words.length - 2; w++) {
        const phrase = words[w] + " " + words[w + 1] + " " + words[w + 2];
        const phraseNorm = normalizeArabic(phrase).toLowerCase();
        const hit = SUB_CATEGORY_MAP[phrase] || SUB_CATEGORY_MAP[phraseNorm];
        if (hit) {
          const disambiguated = disambiguateContext(phrase, allContext, hit.category, hit.subCategory);
          category = disambiguated ? disambiguated.category : hit.category;
          subCategory = disambiguated ? disambiguated.subCategory : hit.subCategory;
          confidence = 92; // Trigram: high confidence (auto-save threshold)
          inferenceSource = "rule";
          if (disambiguated) ambiguityFlags = [...(ambiguityFlags || []), "context_disambiguated"];
          found = true;
          break;
        }
      }
      // Bigrams
      if (!found) {
        for (let w = 0; w < words.length - 1; w++) {
          const phrase = words[w] + " " + words[w + 1];
          const phraseNorm = normalizeArabic(phrase).toLowerCase();
          const hit = SUB_CATEGORY_MAP[phrase] || SUB_CATEGORY_MAP[phraseNorm];
          if (hit) {
            const disambiguated = disambiguateContext(phrase, allContext, hit.category, hit.subCategory);
            category = disambiguated ? disambiguated.category : hit.category;
            subCategory = disambiguated ? disambiguated.subCategory : hit.subCategory;
            confidence = 88; // Bigram: above auto-save threshold
            inferenceSource = "rule";
            if (disambiguated) ambiguityFlags = [...(ambiguityFlags || []), "context_disambiguated"];
            found = true;
            break;
          }
        }
      }
    }

    // 4. Subcategory map (single word exact + prefix-stripped fallback)
    if (!found) {
      let bestHit: { category: string; subCategory: string; confidence: number } | null = null;
      for (const word of words) {
        const normalizedWord = normalizeArabic(word).toLowerCase();
        const stripped = stripArabicPrefix(normalizedWord);
        const hit =
          SUB_CATEGORY_MAP[word] ||
          SUB_CATEGORY_MAP[normalizedWord] ||
          (stripped !== normalizedWord ? SUB_CATEGORY_MAP[stripped] : undefined);
        if (hit) {
          const isExact = SUB_CATEGORY_MAP[word] || SUB_CATEGORY_MAP[normalizedWord];
          const baseScore = isExact ? 85 : 82; // Calibrated: single-word exact = auto-save borderline, prefix = review
          const refinedSub = refineSubCategory(hit.category, hit.subCategory, allContext);
          // Boost if it's refined (not "عام")
          const currentScore = baseScore + (refinedSub !== "عام" && hit.subCategory === "عام" ? 2 : 0);
          
          if (!bestHit || currentScore > bestHit.confidence || 
              (currentScore === bestHit.confidence && refinedSub !== "عام" && bestHit.subCategory === "عام")) {
            bestHit = {
              category: hit.category,
              subCategory: refinedSub,
              confidence: currentScore
            };
          }
        }
      }
      if (bestHit) {
        // Context-aware disambiguation for multi-meaning words
        for (const word of words) {
          const normalizedWord = normalizeArabic(word).toLowerCase();
          const stripped = stripArabicPrefix(normalizedWord);
          const disambiguated = disambiguateContext(word, allContext, bestHit.category, bestHit.subCategory)
            || disambiguateContext(normalizedWord, allContext, bestHit.category, bestHit.subCategory)
            || (stripped !== normalizedWord ? disambiguateContext(stripped, allContext, bestHit.category, bestHit.subCategory) : null);
          if (disambiguated) {
            bestHit.category = disambiguated.category;
            bestHit.subCategory = disambiguated.subCategory;
            ambiguityFlags = [...(ambiguityFlags || []), "context_disambiguated"];
            break;
          }
        }
        category = bestHit.category;
        subCategory = bestHit.subCategory;
        confidence = bestHit.confidence;
        inferenceSource = "rule";
        found = true;
      }
    }

    // Step 5 substring matching removed to prevent false positive matches (e.g. "عشان" matching "عشا").

    // 5. Global dictionary (single-token)
    if (!found) {
      for (const word of words) {
        const normalizedWord = normalizeArabic(word).toLowerCase();

        // Bug #9 fix: Context-aware موبايل/تليفون handling.
        // "شحنت الموبايل" → فواتير, "اشتريت موبايل" → تسوق.
        if (normalizedWord === "موبايل" || normalizedWord === "تليفون") {
          const isRecharge = /(شحن|رصيد|باقه|كارت)/.test(allContextNorm);
          const isBuying = /(اشتريت|جبت|جديد|مستعمل)/.test(allContextNorm);
          if (isRecharge) {
            category = "فواتير"; subCategory = "شحن رصيد"; confidence = 93; // Raised from 88 to 93
            inferenceSource = "rule"; found = true; break;
          } else if (isBuying) {
            category = "تسوق"; subCategory = "أجهزة إلكترونية"; confidence = 93; // Raised from 88 to 93
            inferenceSource = "rule"; found = true; break;
          }
          // Ambiguous — skip and let AI decide
          continue;
        }

        // Context-aware disambiguation for "كريم":
        if (normalizedWord === "كريم" || normalizedWord === "كرييم") {
          if (isKareemPersonContext(allContextNorm)) {
            // This is a person, not the Careem app — skip dictionary lookup
            continue;
          }
        }

        const strippedWord = stripArabicPrefix(normalizedWord);
        let dictHit =
          CATEGORY_DICTIONARY[word] ||
          CATEGORY_DICTIONARY[normalizedWord] ||
          (strippedWord !== normalizedWord ? CATEGORY_DICTIONARY[strippedWord] : undefined);
        
        // Ground detection override: "في الأرض" or "على الأرض" is not real estate investment
        if (dictHit === "استثمار" && (strippedWord === "ارض" || normalizedWord === "ارض") && /(?:في|على)\s+الارض/.test(allContextNorm)) {
          dictHit = undefined;
        }

        if (dictHit) {
          category = dictHit;
          const subHit =
            SUB_CATEGORY_MAP[word] ||
            SUB_CATEGORY_MAP[normalizedWord] ||
            (strippedWord !== normalizedWord ? SUB_CATEGORY_MAP[strippedWord] : undefined);
          if (subHit) {
            subCategory = subHit.subCategory;
            confidence = 85; // Single-word + subcat: auto-save borderline
          } else {
            subCategory = "عام";
            confidence = 78; // Single-word only: needs review
          }
          inferenceSource = "dictionary";
          found = true;
          break;
        }
      }
    }

    // 6. Fuzzy match (Damerau-Levenshtein — handles transpositions)
    if (!found) {
      for (const word of words) {
        if (word.length >= 3) {
          // Damerau handles transpositions (e.g. "كهارب" ↔ "كهربا" = distance 2, not 3)
          // Short words (≤3 chars) need strict matching to avoid false positives
          const limit = word.length <= 3 ? 0 : (word.length <= 6 ? 2 : 2);
          const fuzzyResult = fuzzyFindCategory(word, CATEGORY_DICTIONARY, limit);
          if (fuzzyResult && typeof fuzzyResult === "string") {
            category = fuzzyResult;
            subCategory = "عام";
            confidence = 55;
            inferenceSource = "dictionary";
            found = true;
            break;
          }
        }
      }
    }

    // 7. Semantic Hybrid Fallback (local n-gram + Fireworks embedding)
    if ((!found || confidence < 80)) {
      try {
        const semanticMatch = await matchSegment(allContextNorm, apiKey, fireworksApiKey);
        if (semanticMatch && semanticMatch.score >= 80 && semanticMatch.score > confidence) {
          category = semanticMatch.category;
          subCategory = semanticMatch.subCategory;
          confidence = semanticMatch.score;
          inferenceSource = "ai";
          ambiguityFlags = ["semantic_embedding_match"];
          found = true;
          
          if (intentResult.intent !== "income" && ["العائلة", "أصدقاء", "موظفين"].includes(category)) {
            intentResult.intent = "expense";
          }
        }
      } catch (err) {
        console.warn("[Rule Engine] Semantic fallback failed:", err);
      }
    }

    // Income with no specific category
    if (intentResult.intent === "income" && !found) {
      category = "مرتب";
      subCategory = "عام";
      confidence = intentResult.confidence;
    }

    // Expense with no specific category — low confidence so AI fallback can engage
    if (intentResult.intent === "expense" && !found) {
      category = "متنوعات";
      subCategory = "عام";
      confidence = Math.min(intentResult.confidence, 40); // Low confidence → triggers AI fallback
      found = true;
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
      // Bug #13 fix: Multi-word matches should score HIGHER than single-word.
      // Previously: bigram=84-86, unigram=85-88 (inverted — fixed to 89/87).
      confidence = intentResult.intent === "income" ? 75 : 70;
      description = intentResult.intent === "income" ? "دخل" : category;
    }

    // Strategy 5: Hierarchical Subcategory Cascade — refine generic subcategories
    const refinedSubCategory = refineSubCategory(
      category,
      subCategory,
      allContext,
    );

    let finalConfidence = confidence;
    if (subCategory === "عام" && refinedSubCategory !== "عام") {
      finalConfidence = Math.max(finalConfidence, 82);
    }

    // ─── Polarity & Negation Filter ───
    const polarity = detectPolarityAndNegation(allContext);
    if (polarity.isNegated) {
      finalConfidence = 0; // Failsafe: zero confidence for negated / zero-payment / cancelled transactions
      ambiguityFlags = [...(ambiguityFlags || []), `negated_${polarity.reason}`];
    } else if (polarity.polarityMultiplier < 1.0) {
      finalConfidence = Math.round(finalConfidence * polarity.polarityMultiplier);
      ambiguityFlags = [...(ambiguityFlags || []), `polarity_${polarity.reason}`];
    }

    // Context-Aware Ambiguity Scorer: Only penalize when ambiguous words appear
    // WITHOUT a clear disambiguating context.
    const ambiguityRegex = /(حساب|باقة|باقه|كارت|شحن|رصيد)/;
    if (ambiguityRegex.test(allContextNorm) && finalConfidence > 0 && finalConfidence < 90) {
      // Check if context already disambiguates the ambiguous word
      const hasClearContext =
        /(?:نت|انترنت|إنترنت|راوتر|واي\s*فاي|wifi|وي)/i.test(allContextNorm) ||  // internet bill
        /(?:كهربا|كهرباء|مياه|مايه|غاز)/.test(allContextNorm) ||                  // utility bill
        /(?:موبايل|تليفون|فودافون|اورنج|اتصالات)/i.test(allContextNorm) ||       // mobile recharge
        /(?:فواتير|فاتوره|فاتورة)/.test(allContextNorm) ||                        // explicit bill context
        /(?:بنزين|تفويل[ةه]|محط[ةه])/i.test(allContextNorm) ||                     // fuel context for "شحن"
        /(?:شحن\s*رصيد|رصيد\s*شحن)/.test(allContextNorm) ||                        // "شحن رصيد" together = clear
        /(?:حساب|حاسبت|حاسبنا)\s+(?:المطعم|الكافيه|القهوة|السوبر|الدكتور|المستشفى|الصيدلية|الاوبر|التاكسي|الفاتورة|النت|الكهربا|الاكل|الأكل)/i.test(allContextNorm) || // clear merchant account payment
        ambiguityFlags?.includes("merchant_registry_hit") ||                        // merchant already matched
        ambiguityFlags?.includes("context_disambiguated");                          // disambiguation already resolved
      if (!hasClearContext) {
        finalConfidence = Math.min(finalConfidence, 45); // Penalize but not to 10%
        ambiguityFlags = [...(ambiguityFlags || []), "ambiguity_scorer_penalty"];
      }
    }


    let registeredType = CATEGORIES.find(
      (registeredCategory) => registeredCategory.name_ar === category,
    )?.type;

    let finalCategory = category;
    let finalSubCategory = refinedSubCategory;
    if (intentResult.intent === "income" && registeredType === "expense") {
      if (/(رجع|استرد|استرجع|باقي|بقيت)/.test(allContextNorm)) {
        finalCategory = "مرتب";
        finalSubCategory = "استرداد نقدي";
      } else if (["العائلة", "أصدقاء", "موظفين"].includes(category)) {
        // Preserve person subcategory — e.g., "استلمت من أحمد" stays as أصدقاء/عام
        // instead of being overridden to مرتب. The person category is meaningful here.
        finalCategory = category;
        finalSubCategory = refinedSubCategory;
      } else {
        finalCategory = "مرتب";
        finalSubCategory = "عام";
      }
      registeredType = "income";
    }

    const isNeutralCategory = ["متنوعات", "العائلة", "أصدقاء", "موظفين"].includes(finalCategory);
    let finalType = isNeutralCategory ? intentResult.intent : (registeredType || intentResult.intent);
    if (intentResult.intent === "income") {
      finalType = "income";
    }

    items.push(
      applyProfileHints(
        {
          amount,
          category: finalCategory,
          subCategory: finalSubCategory,
          description,
          type: finalType,
          confidence: finalConfidence,
          currency: "EGP",
          needsReview: finalConfidence < 85,
          parsedBy: "rule_engine",
          inferenceSource,
          ambiguityFlags,
          confidenceBreakdown: {
            intent: intentResult.confidence,
            taxonomy: finalConfidence,
            heuristics: Math.min(
              100,
              Math.max(
                20,
                Math.round((intentResult.confidence + finalConfidence) / 2),
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
