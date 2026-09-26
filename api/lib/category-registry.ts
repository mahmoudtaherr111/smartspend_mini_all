/**
 * SmartSpend Category Registry
 * Central registry for all financial categories and subcategories
 */

import { governedNouns } from "./direction-governed-taxonomy";

import {
  CATEGORIES,
  resolveLegacyTaxonomy,
  type MainCategory,
  type SubCategory,
} from "../../contracts/categories";

// The list itself lives in contracts/categories.ts, shared with the web app and the
// data migration; this module adds the lookups and the normalization.
export { CATEGORIES, resolveLegacyTaxonomy };
export type { MainCategory, SubCategory };

/** Get category by Arabic name */
export function getCategoryByArabicName(
  name_ar: string,
): MainCategory | undefined {
  return CATEGORY_BY_NORMALIZED_AR.get(comparableArabic(name_ar));
}

/** Get all category Arabic names */
export function getAllCategoryNames(): string[] {
  return CATEGORIES.map((c) => c.name_ar);
}

/** Get subcategories for a category */
export function getSubcategoriesFor(categoryNameAr: string): SubCategory[] {
  return getCategoryByArabicName(categoryNameAr)?.subcategories || [];
}

/** Get category type */
export function getCategoryType(categoryNameAr: string): string {
  return getCategoryByArabicName(categoryNameAr)?.type || "expense";
}

/** Get all expense category names */
export function getExpenseCategories(): string[] {
  return CATEGORIES.filter((c) => c.type === "expense").map((c) => c.name_ar);
}

/** Get all income category names */
export function getIncomeCategories(): string[] {
  return CATEGORIES.filter((c) => c.type === "income").map((c) => c.name_ar);
}

type TransactionType = MainCategory["type"];

const CATEGORY_ALIASES: Array<[string, string]> = [
  ["أخرى", "متنوعات"],
  ["مصروف شخصي", "متنوعات"],
  ["مدفوعات طوارئ", "متنوعات"],
  ["دخل", "دخل آخر"],
  ["راتب", "مرتب"],
  ["سكن وفواتير", "فواتير"],
  ["التزامات يومية", "فواتير"],
  ["Daily Commitments", "فواتير"],
  ["خروجات", "ترفيه"],
  ["Outings", "ترفيه"],
  ["ملابس", "تسوق"],
  ["عناية", "عناية شخصية"],
  ["أولاد", "أطفال"],
  ["عيال", "أطفال"],
  ["مرتجعات", "دخل آخر"],
  ["سيارات", "مواصلات"],
  ["خدمات سيارات", "مواصلات"],
  ["تكنولوجيا", "اشتراكات"],
  ["خدمات رقمية", "اشتراكات"],
  ["أهل وبيت", "سكن"],
  ["تحويلات", "تحويل"],
  ["عائلة", "العائلة"],
  ["معاملة عائلية", "العائلة"],
  ["عائلي", "العائلة"],
  ["أشخاص", "العائلة"],
  ["معاملات عائلية", "العائلة"],
  ["صحاب", "أصدقاء"],
  ["أصدقاء", "أصدقاء"],
  ["صديق", "أصدقاء"],
  ["رياضة", "ترفيه"],
  ["رياضه", "ترفيه"],
  ["ألعاب", "ترفيه"],
  ["لعب", "ترفيه"],
  ["كورة", "ترفيه"],
  ["مشتريات", "تسوق"],
  ["طعام", "أكل وشرب"],
  ["أغذية", "أكل وشرب"],
  ["بقالة", "أكل وشرب"],
  ["صاحبي", "أصدقاء"],
  ["Friends", "أصدقاء"],
  ["موظف", "موظفين"],
  ["موظفين", "موظفين"],
  ["عمال", "موظفين"],
  ["عامل", "موظفين"],
  ["صنايعي", "موظفين"],
  ["موظفين وعمال", "موظفين"],
  ["شريك", "عمل"],
  ["جمعية", "تحويل"],
  ["التزامات وجمعيات", "أقساط وفوايد"],
  ["جمعيتي", "تحويل"],
  ["قسط جمعية", "تحويل"],
  ["أقساط شركات", "أقساط وفوايد"],
  ["فاليو", "أقساط وفوايد"],
  ["حكومي", "خدمات حكومية"],
  ["خدمات حكومة", "خدمات حكومية"],
  ["رسوم حكومية", "خدمات حكومية"],
  ["هدايا", "هدايا وصدقات"],
  ["مجاملات", "هدايا وصدقات"],
  ["صيانة", "سكن"],
  ["أدوات شغل", "عمل"],
  ["أقساط", "أقساط وفوايد"],
  ["قسط", "أقساط وفوايد"],
  ["تحويلات", "تحويل"],
  ["Bills", "فواتير"],
  ["Home & Bills", "فواتير"],
  ["Daily Commitments", "فواتير"],
  ["Income", "دخل آخر"],
  ["Salary", "مرتب"],
  ["Freelance", "عمل حر"],
  ["Transfer", "تحويل"],
  ["Shopping", "تسوق"],
  ["Transport", "مواصلات"],
  ["Car Services", "مواصلات"],
  ["Digital Services", "اشتراكات"],
  ["Miscellaneous", "متنوعات"],
];

const DEFAULT_SUBCATEGORY_BY_CATEGORY = new Map(
  CATEGORIES.map((category) => [
    category.name_ar,
    category.subcategories.find((sub) => sub.name_ar === "عام")?.name_ar ||
      category.subcategories[0]?.name_ar ||
      "عام",
  ]),
);

import { normalizeArabic } from "./unified-normalizer";

export function comparableArabic(value: string): string {
  return normalizeArabic(value)
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hasAny(text: string, terms: string[]): boolean {
  const normalized = comparableArabic(text);
  return terms.some((term) => normalized.includes(comparableArabic(term)));
}

function findCategoryByAnyName(value: string): MainCategory | undefined {
  const normalized = comparableArabic(value);
  return CATEGORIES.find(
    (category) =>
      comparableArabic(category.name_ar) === normalized ||
      comparableArabic(category.name) === normalized ||
      comparableArabic(category.id) === normalized,
  );
}

function findSubCategoryByAnyName(
  category: MainCategory,
  value: string,
): SubCategory | undefined {
  const normalized = comparableArabic(value);
  return category.subcategories.find(
    (subCategory) =>
      comparableArabic(subCategory.name_ar) === normalized ||
      comparableArabic(subCategory.name) === normalized ||
      comparableArabic(subCategory.id) === normalized,
  );
}

/** Nouns whose category is decided by the noun, not by the verb around it. */
const GOVERNED_NOUNS = governedNouns();

/**
 * Nouns that name the source of the income outright. Like the governed nouns above they
 * outrank the generic income verb standing next to them: "خلصت مشروع فريلانس وقبضت 6000"
 * contains قبضت, but it is freelance work, not salary — and the rule engine had already
 * resolved it to عمل حر/مشروع with 98 confidence before this scan overwrote it on the
 * way to storage. Only the unambiguous ones belong here; مشروع and عمولة are left out
 * because "قبضت مرتب المشروع" is still salary.
 */
const FREELANCE_NOUNS = ["فريلانس", "عمل حر", "سبوبة", "سبوبه", "كلاينت", "freelance"];

/**
 * Whether sentence evidence may replace a category the item already has. Only the
 * catch-alls give way: nothing (or متنوعات) to anything, مرتب and the unknown-income
 * default دخل آخر to a more specific income ("قبضت 5000 من كلاينت" is عمل حر), and
 * استثمار to its returns ("جالي عائد شهادات" is عوائد استثمار).
 */
function mayRefine(current: string | undefined, inferred: string): boolean {
  if (!current || current === "متنوعات") return true;
  if (current === "مرتب") return inferred === "عمل حر" || inferred === "عوائد استثمار";
  if (current === "دخل آخر") return inferred === "مرتب" || inferred === "عمل حر" || inferred === "عوائد استثمار";
  if (current === "استثمار") return inferred === "عوائد استثمار";
  return false;
}

/** Old category names that now live elsewhere; they depend on the name, not the sentence. */
function inferLegacyCategory(
  rawCategory: string,
  evidence: string,
): string | undefined {
  const categoryText = `${rawCategory} ${evidence}`;

  if (hasAny(rawCategory, ["التزامات يومية", "Daily Commitments"])) {
    return "فواتير";
  }

  if (
    hasAny(rawCategory, ["خدمات رقمية", "Digital Services"]) &&
    hasAny(categoryText, [
      "نت",
      "انترنت",
      "إنترنت",
      "راوتر",
      "باقة",
      "شحن",
      "رصيد",
      "فودافون",
      "اتصالات",
      "اورنج",
      "أورنج",
      "وي",
    ])
  ) {
    return "فواتير";
  }

  return undefined;
}

/** Guesses a category from the sentence, for an item that arrived without a real one. */
function inferCategoryFromEvidence(
  rawCategory: string,
  evidence: string,
): string | undefined {
  const categoryText = `${rawCategory} ${evidence}`;

  if (
    hasAny(categoryText, [
      "مرتب",
      "راتب",
      "قبضت",
      "جالي مرتب",
      "من الشغل",
      "من شغلي",
      "المعاش",
      "بونص",
      "مكافأة",
    ]) &&
    !hasAny(categoryText, ["دفعت", "صرفت", "اشتريت", "قسط"]) &&
    // A direction-governed noun is more specific than the income verb beside it.
    // "قبضت الجمعية" contains قبضت, but it is a gam3eya payout, not salary — and the
    // rule engine has already resolved it to تحويل/جمعية. Without this
    // guard the evidence scan overwrote that correct answer on the way to storage.
    !hasAny(categoryText, GOVERNED_NOUNS) &&
    !hasAny(categoryText, FREELANCE_NOUNS)
  ) {
    return "مرتب";
  }

  if (
    hasAny(categoryText, [
      "فريلانس",
      "عمل حر",
      "سبوبة",
      "عمولة",
      "مشروع",
      "كلاينت",
    ])
  ) {
    return "عمل حر";
  }

  if (hasAny(categoryText, ["مرتجع", "استرجاع", "استرداد", "refund"])) {
    return "دخل آخر";
  }

  if (hasAny(categoryText, ["أرباح", "فوائد", "كاش باك", "عائد"])) {
    return "عوائد استثمار";
  }

  return undefined;
}

function inferSubCategory(
  category: string,
  evidence: string,
): string | undefined {
  switch (category) {
    case "فواتير":
      if (hasAny(evidence, ["كهرب", "نور"])) return "كهرباء";
      if (hasAny(evidence, ["مية", "مياه", "مايه"])) return "مياه";
      if (hasAny(evidence, ["غاز"])) return "غاز";
      // Use word-boundary regex to avoid matching "نت" inside "انت/كنت/أنت"
      if (
        hasAny(evidence, ["انترنت", "إنترنت", "راوتر", "واي فاي", "wifi", "باقة"]) ||
        /(?:^|[\s،,؟!])(?:نت|النت)(?=[\s،,؟!]|$)/.test(comparableArabic(evidence))
      )
        return "إنترنت";
      if (hasAny(evidence, ["شحن", "رصيد", "كارت فكة", "كارت شحن"]))
        return "شحن رصيد";
      if (hasAny(evidence, ["تليفون", "هاتف", "ارضي", "أرضي"])) return "تليفون";
      if (hasAny(evidence, ["تأمين", "تامين"])) return "تأمين";
      return undefined;
    case "تسوق":
      if (
        hasAny(evidence, ["هدوم", "لبس", "ملابس", "تيشيرت", "بنطلون", "جاكيت"])
      )
        return "ملابس";
      if (hasAny(evidence, ["جزمة", "كوتشي", "شوز", "حذاء"])) return "أحذية";
      if (
        hasAny(evidence, [
          "موبايل",
          "لاب",
          "لابتوب",
          "كمبيوتر",
          "سماعة",
          "شاحن",
          "ايفون",
          "تليفون",
        ])
      )
        return "أجهزة إلكترونية";
      return undefined;
    case "عناية شخصية":
      if (hasAny(evidence, ["حلاق", "كوافير", "صالون", "حلاقة"])) return "حلاق وكوافير";
      if (hasAny(evidence, ["ميكاب", "برفان", "عطر", "شامبو", "كريم", "مرطب", "مزيل"]))
        return "مستحضرات وعناية";
      return undefined;
    case "أطفال":
      if (hasAny(evidence, ["حضانة", "حضانه"])) return "حضانة";
      if (hasAny(evidence, ["بامبرز", "حفاضات", "لبن اطفال", "لبن أطفال", "لبن للبيبي", "رضعة"]))
        return "بامبرز ولبن أطفال";
      if (hasAny(evidence, ["لعب", "لعبة", "هدوم"])) return "هدوم ولعب";
      if (hasAny(evidence, ["مصروف"])) return "مصروف العيال";
      return undefined;
    case "أقساط وفوايد":
      if (hasAny(evidence, ["فوايد", "فوائد", "فايدة"])) return "فوايد قروض";
      return "أقساط";
    case "هدايا وعيديات":
      if (hasAny(evidence, ["عيدية", "عيديه"])) return "عيدية";
      if (hasAny(evidence, ["نقطة", "نقطه", "نقوط"])) return "نقطة";
      return "هدية فلوس";
    case "دخل آخر":
      if (hasAny(evidence, ["مرتجع", "رجعت", "استرجاع", "استرداد", "refund"]))
        return "مرتجعات واسترداد";
      if (hasAny(evidence, ["بعت", "بيع", "بايع"])) return "بيع حاجة";
      return undefined;
    case "أكل وشرب":
      if (
        hasAny(evidence, [
          "قهوة",
          "نسكافيه",
          "كافيه",
          "لاتيه",
          "ستاربكس",
          "شاي",
        ])
      )
        return "قهوة وكافيه";
      if (hasAny(evidence, ["دليفري", "تيك اواي", "طلبات"])) return "دليفري";
      if (hasAny(evidence, ["سوبر", "بقال", "خضار", "فاكهة", "بيض", "لبن", "مياه", "ميه", "ازايز", "زجاجات", "كشك", "ماركت"]))
        return "بقالة";
      if (hasAny(evidence, ["لحمة", "فراخ", "سمك", "جمبري", "سوشي"]))
        return "لحوم ودواجن";
      if (hasAny(evidence, ["عيش", "مخبز", "فرن"])) return "مخبوزات";
      if (hasAny(evidence, ["شيبسي", "شوكولاتة", "حلويات", "ايس كريم", "كانز", "بيبسي"]))
        return "سناكس";
      if (hasAny(evidence, ["بيتزا", "شاورما", "برجر", "كريب"])) return "وجبات سريعة";
      if (hasAny(evidence, ["فول", "طعمية", "كبدة", "حواوشي"])) return "مطعم";
      return undefined;
    case "مواصلات":
      if (hasAny(evidence, ["اوبر", "أوبر", "كريم", "ان درايف", "اندرايف", "ديدي"])) return "أوبر/كريم";
      if (hasAny(evidence, ["مترو", "تذكرة", "تيكت"])) return "مترو";
      if (hasAny(evidence, ["ميكروباص", "مشروع"])) return "ميكروباص";
      if (hasAny(evidence, ["قطر", "قطار"])) return "قطر";
      if (hasAny(evidence, ["اتوبيس", "باص", "سويفل"])) return "أتوبيس";
      if (hasAny(evidence, ["كارتة", "كارته"])) return "كارتة";
      if (hasAny(evidence, ["تاكسي", "تكسي"])) return "تاكسي";
      if (hasAny(evidence, ["بنزين", "تفويلة"])) return "بنزين";
      if (hasAny(evidence, ["ركنة", "جراج", "سايس"])) return "ركنة";
      if (hasAny(evidence, ["زيت", "بطارية", "كاوتش", "إطارات", "اطارات", "ميكانيكي"])) return "صيانة عربية";
      return undefined;
    case "سكن":
      if (hasAny(evidence, ["ايجار", "إيجار", "اجار"])) return "إيجار";
      if (hasAny(evidence, ["عفش", "أثاث", "اثاث"])) return "أثاث";
      if (hasAny(evidence, ["سباك", "كهربائي", "نقاش", "نجار", "صيانة"]))
        return "صيانة";
      if (hasAny(evidence, ["منظفات", "مسحوق", "صابون"])) return "منظفات";
      if (hasAny(evidence, ["تلاجة", "غسالة", "بوتاجاز"]))
        return "أجهزة منزلية";
      if (hasAny(evidence, ["بواب", "زبال", "شغالة", "مكوجي", "دادة"])) return "خدمات البيت";
      return undefined;
    case "صحة":
      if (hasAny(evidence, ["دكتور", "كشف", "عيادة", "طبيب"])) return "دكتور";
      if (hasAny(evidence, ["صيدلية", "دوا", "علاج", "روشتة"])) return "صيدلية";
      if (hasAny(evidence, ["تحاليل", "اشعة", "سونار"])) return "تحاليل";
      if (hasAny(evidence, ["أسنان", "اسنان", "ضرس"])) return "أسنان";
      if (hasAny(evidence, ["مستشفى"])) return "مستشفى";
      return undefined;
    case "تعليم":
      if (hasAny(evidence, ["مدرسة", "مدرسه", "يونيفورم"])) return "مدرسة";
      if (hasAny(evidence, ["جامعة", "جامعه", "كلية"])) return "جامعة";
      if (hasAny(evidence, ["كورس", "دورة", "كورسيرا", "يوديمي"]))
        return "كورس";
      if (hasAny(evidence, ["درس", "دروس", "سنتر"])) return "دروس خصوصية";
      if (hasAny(evidence, ["كتاب", "كتب", "مذكرة", "أدوات"])) return "كتب";
      return undefined;
    case "ترفيه":
      if (hasAny(evidence, ["سينما", "فيلم"])) return "سينما";
      if (hasAny(evidence, ["سفر", "مصيف", "رحلة"])) return "سفر";
      if (hasAny(evidence, ["جيم", "رياضة", "رياضه", "بروتين", "كرة", "كورة", "ملعب", "ماتش", "حجز", "بادل", "خماسي", "تراك"])) return "رياضة وجيم";
      if (hasAny(evidence, ["بلايستيشن", "العاب", "ألعاب", "gaming", "بلياردو"]))
        return "ألعاب";
      if (hasAny(evidence, ["خروجة", "فسحة", "تمشية"])) return "خروجة";
      return undefined;
    case "هدايا وصدقات":
      if (hasAny(evidence, ["صدقة", "تبرع", "زكاة", "رسالة", "جامع"]))
        return "صدقة/تبرع";
      if (hasAny(evidence, ["عيدية"])) return "عيدية";
      if (hasAny(evidence, ["نقطة", "نقطه", "واجب", "عزا", "سبوع"])) return "نقطة وواجب";
      if (hasAny(evidence, ["اضحية", "أضحية", "ضحية"])) return "أضحية";
      if (hasAny(evidence, ["فرح", "خطوبة"])) return "فرح/خطوبة";
      if (hasAny(evidence, ["عيد ميلاد"])) return "عيد ميلاد";
      return undefined;
    case "اشتراكات":
      if (hasAny(evidence, ["نتفلكس", "netflix", "شاهد", "برايم", "واتش ات", "يوتيوب"])) return "منصات مشاهدة";
      if (hasAny(evidence, ["سبوتيفاي", "spotify", "انغامي"])) return "موسيقى";
      if (hasAny(evidence, ["شات جي بي تي", "chatgpt", "gpt", "جوجل ai", "google ai", "gemini", "claude"]))
        return "أدوات AI";
      if (hasAny(evidence, ["saas", "برنامج", "برمجيات", "vpn", "cloud", "كلاود"])) return "برمجيات";
      return undefined;
    case "تدخين":
      if (hasAny(evidence, ["سجاير", "سجائر", "علبة"])) return "سجائر";
      if (hasAny(evidence, ["فيب", "بود", "ليكود"])) return "فيب/ليكود";
      if (hasAny(evidence, ["شيشة", "معسل"])) return "شيشة/معسل";
      return undefined;
    case "عمل":
      if (hasAny(evidence, ["استضافة", "hosting"])) return "استضافة";
      if (hasAny(evidence, ["api", "واجهة", "واجهات"])) return "واجهات برمجية";
      if (hasAny(evidence, ["مكتب", "أدوات", "ادوات"])) return "مستلزمات مكتب";
      if (hasAny(evidence, ["مساحة عمل", "coworking"])) return "مساحة عمل";
      return undefined;
    case "مرتب":
      if (hasAny(evidence, ["بونص", "مكافأة", "مكافاه"])) return "مكافأة/بونص";
      if (hasAny(evidence, ["اوفر", "أوفر", "اضافي", "إضافي"]))
        return "أوفر تايم";
      if (hasAny(evidence, ["بدل"])) return "بدلات";
      return "مرتب أساسي";
    case "عمل حر":
      if (hasAny(evidence, ["عمولة"])) return "عمولة";
      if (hasAny(evidence, ["سبوبة"])) return "سبوبة";
      return "مشروع";
    case "عوائد استثمار":
      if (hasAny(evidence, ["فوائد", "فايدة"])) return "فوائد";
      if (hasAny(evidence, ["كاش باك", "cashback"])) return "كاش باك";
      return "أرباح";
    case "تحويل":
      if (hasAny(evidence, ["atm", "سحب"])) return "سحب ATM";
      if (hasAny(evidence, ["انستاباي", "instapay"])) return "انستاباي";
      if (hasAny(evidence, ["فودافون كاش"])) return "فودافون كاش";
      if (hasAny(evidence, ["جمعية", "جمعيه"])) return "جمعية";
      if (hasAny(evidence, ["ادخار", "تحويش"])) return "ادخار";
      if (hasAny(evidence, ["دين", "سلف", "سلفة", "قرض", "loan"])) return "دين/سلفة";
      if (hasAny(evidence, ["أشخاص"])) return "أشخاص";
      return "تحويل بنكي";
    case "استثمار":
      if (hasAny(evidence, ["دهب", "ذهب", "سبيكة"])) return "ذهب";
      if (hasAny(evidence, ["سهم", "أسهم", "اسهم", "بورصة"])) return "أسهم";
      if (hasAny(evidence, ["شهادة", "شهادات"])) return "شهادات";
      if (hasAny(evidence, ["عقار", "شقة", "ارض", "أرض"])) return "عقارات";
      if (hasAny(evidence, ["كريبتو", "بيتكوين", "crypto"]))
        return "عملات رقمية";
      return undefined;
    default:
      return undefined;
  }
}

export function normalizeCategoryName(
  rawCategory?: string | null,
  evidence = "",
  fallback = "متنوعات",
): string {
  const raw = String(rawCategory || "").trim();
  // A category that already names something is kept. Re-reading the whole sentence
  // used to overwrite correct answers on the way to storage: "ركبت مشروع" (the
  // microbus) became عمل حر, "استلمت من أحمد" became مرتب. Evidence may still fill a
  // missing or catch-all category, and remap the legacy names.
  const legacy = inferLegacyCategory(raw, evidence);
  if (legacy) return legacy;

  // An exact name, or an alias of one (old names such as "خدمات سيارات" included).
  let direct = findCategoryByAnyName(raw);
  if (!direct && raw) {
    const normalized = comparableArabic(raw);
    const alias = CATEGORY_ALIASES.find(([from]) => comparableArabic(from) === normalized);
    if (alias) direct = findCategoryByAnyName(alias[1]);
  }

  const inferred = inferCategoryFromEvidence(raw, evidence);
  if (inferred && findCategoryByAnyName(inferred) && mayRefine(direct?.name_ar, inferred)) {
    return inferred;
  }
  if (direct) return direct.name_ar;
  return fallback;
}

/** The categories whose subcategory is a business category the user defines. */
const BUSINESS_CATEGORY_NAMES = new Set(["عمل", "عمل حر"]);

export function normalizeSubCategoryName(
  categoryName: string,
  rawSubCategory?: string | null,
  evidence = "",
): string {
  const category = getCategoryByArabicName(categoryName);
  if (!category) return "عام";

  const raw = String(rawSubCategory || "").trim();
  if (["العائلة", "أصدقاء", "موظفين"].includes(categoryName) && raw) {
    return raw;
  }
  const exact = raw ? findSubCategoryByAnyName(category, raw) : undefined;
  if (exact) return exact.name_ar;
  // A business's own categories ("خامات", "شحن") are the subcategories of work spending and
  // work income; the registry cannot list them, so a name it does not know is kept.
  if (raw && BUSINESS_CATEGORY_NAMES.has(category.name_ar)) return raw;

  const inferred = inferSubCategory(category.name_ar, `${raw} ${evidence}`);
  if (inferred) {
    const inferredMatch = findSubCategoryByAnyName(category, inferred);
    if (inferredMatch) return inferredMatch.name_ar;
  }

  if (raw && comparableArabic(raw) === comparableArabic("أخرى")) {
    return DEFAULT_SUBCATEGORY_BY_CATEGORY.get(category.name_ar) || "عام";
  }

  return DEFAULT_SUBCATEGORY_BY_CATEGORY.get(category.name_ar) || "عام";
}

export function normalizeTransactionTaxonomy<
  T extends {
    category?: string;
    subCategory?: string | null;
    type?: string;
    description?: string | null;
  },
>(
  item: T,
  evidence = "",
): T & { category: string; subCategory: string; type: TransactionType } {
  // An old pair (a retired category, a merged subcategory, a money movement that was
  // booked as spending) is moved to where it lives now before anything else reads it.
  const legacy = resolveLegacyTaxonomy(item.category, item.subCategory, item.type);
  const source = legacy
    ? { ...item, category: legacy.category, subCategory: legacy.subCategory, type: legacy.type ?? item.type }
    : item;

  const combinedEvidence = `${source.description || ""} ${source.subCategory || ""} ${evidence}`;
  const category = normalizeCategoryName(source.category, combinedEvidence);
  const subCategory = normalizeSubCategoryName(
    category,
    source.subCategory,
    combinedEvidence,
  );

  // Preserve explicit type if valid, otherwise fall back to category default type
  const type =
    source.type === "income" ||
    source.type === "expense" ||
    source.type === "transfer" ||
    source.type === "investment"
      ? (source.type as TransactionType)
      : (getCategoryType(category) as TransactionType);

  return {
    ...source,
    category,
    subCategory,
    type,
    ...(legacy?.direction ? { direction: legacy.direction } : {}),
  };
}

export function normalizeTransactionTaxonomyList<
  T extends {
    category?: string;
    subCategory?: string | null;
    type?: string;
    description?: string | null;
  },
>(
  items: T[],
  evidence = "",
): Array<T & { category: string; subCategory: string; type: TransactionType }> {
  return items.map((item) => normalizeTransactionTaxonomy(item, evidence));
}

// ─── Unified Taxonomy Bridge ───
// Internal canonical = English `id` from CATEGORIES
// Display = Arabic `name_ar` from CATEGORIES
// This bridge ensures no mixing of "food" and "أكل وشرب" in storage and analysis.

const CATEGORY_ID_MAP = new Map<string, MainCategory>(
  CATEGORIES.map((c) => [c.id, c]),
);

const CATEGORY_BY_NORMALIZED_AR = new Map<string, MainCategory>(
  CATEGORIES.map((c) => [comparableArabic(c.name_ar), c]),
);

const CATEGORY_BY_NORMALIZED_EN = new Map<string, MainCategory>(
  CATEGORIES.map((c) => [c.name.toLowerCase(), c]),
);

export const EXTRA_ALIASES_TO_ID: Array<[string, string]> = [
  ["كارفور", "food"],
  ["خضار", "food"],
  ["خضه", "food"],
  ["فاكهه", "food"],
  ["فاكهة", "food"],
  ["لحمه", "food"],
  ["لحمة", "food"],
  ["فراخ", "food"],
  ["دليفري", "food"],
  ["طلبات", "food"],
  ["talabat", "food"],
  ["سوبرماركت", "food"],
  ["سوبر ماركت", "food"],
  ["ماركت", "food"],
  ["هايبر", "food"],
  ["جروسري", "food"],
  ["groceries", "food"],
  ["restaurant", "food"],
  ["مطعم", "food"],
  ["مطاعم", "food"],
  ["قهوة", "food"],
  ["قهوه", "food"],
  ["كافيه", "food"],
  ["كافيهات", "food"],
  ["بنزين", "transport"],
  ["تفويلة", "transport"],
  ["اوبر", "transport"],
  ["كريم", "transport"],
  ["مترو", "transport"],
  ["تاكسي", "transport"],
  ["اتوبيس", "transport"],
  ["ميكروباص", "transport"],
  ["uber", "transport"],
  ["لبس", "shopping"],
  ["هدوم", "shopping"],
  ["ملابس", "shopping"],
  ["جزمة", "shopping"],
  ["كوتشي", "shopping"],
  ["شوز", "shopping"],
  ["عنايه شخصيه", "personal_care"],
  ["بامبرز", "kids"],
  ["حفاضات", "kids"],
  ["حضانه", "kids"],
  ["حضانة", "kids"],
  ["لبن اطفال", "kids"],
  ["عطر", "personal_care"],
  ["دكتور", "health"],
  ["صيدليه", "health"],
  ["صيدلية", "health"],
  ["دوا", "health"],
  ["دواء", "health"],
  ["علاج", "health"],
  ["تحاليل", "health"],
  ["كهربا", "bills"],
  ["كهرباء", "bills"],
  ["مياه", "bills"],
  ["مايه", "bills"],
  ["غاز", "bills"],
  ["نت", "bills"],
  ["انترنت", "bills"],
  ["إنترنت", "bills"],
  ["شحن", "bills"],
  ["رصيد", "bills"],
  ["فاتوره", "bills"],
  ["فاتورة", "bills"],
  ["قسط", "installments"],
  ["اقساط", "installments"],
  ["أقساط", "installments"],
  ["مرتب", "salary"],
  ["راتب", "salary"],
  ["salary", "salary"],
  ["قبض", "salary"],
  ["دخل", "other_income"],
  ["بونص", "salary"],
  ["مكافاه", "salary"],
  ["مكافأة", "salary"],
  ["سبوبه", "freelance"],
  ["فريلانس", "freelance"],
  ["عموله", "freelance"],
  ["كاش باك", "investment_income"],
  ["كاشباك", "investment_income"],
  ["استرجاع", "other_income"],
  ["مرتجع", "other_income"],
  ["ارباح", "investment_income"],
  ["أرباح", "investment_income"],
  ["فوائد", "investment_income"],
  ["atm", "transfer"],
  ["سحب", "transfer"],
  ["انستاباي", "transfer"],
  ["instapay", "transfer"],
  ["فودافون كاش", "transfer"],
  ["دين", "transfer"],
  ["سلفه", "transfer"],
  ["سلفة", "transfer"],
  ["قرض", "transfer"],
  ["ادخار", "transfer"],
  ["تحويش", "transfer"],
  ["ذهب", "investment"],
  ["دهب", "investment"],
  ["سهم", "investment"],
  ["أسهم", "investment"],
  ["اسهم", "investment"],
  ["بورصه", "investment"],
  ["بورصة", "investment"],
  ["شهادات", "investment"],
  ["شهاده", "investment"],
  ["عقار", "investment"],
  ["شقه", "investment"],
  ["شقة", "investment"],
  ["ايجار", "home"],
  ["إيجار", "home"],
  ["عفش", "home"],
  ["أثاث", "home"],
  ["اثاث", "home"],
  ["سباك", "home"],
  ["كهربائي", "home"],
  ["نقاش", "home"],
  ["منظفات", "home"],
  ["سينما", "entertainment"],
  // NOTE: "كافيهات" is already mapped to `food` above. It used to be re-mapped here to
  // "outings", an id that no longer exists in CATEGORIES (خروجات was merged into ترفيه),
  // and because buildAliasMap() writes in array order that later entry silently won.
  // Every كافيهات row therefore canonicalized to a dangling id that arabicDisplayName()
  // rendered as the literal string "outings" in Arabic UI.
  ["بلايستيشن", "entertainment"],
  ["جيم", "entertainment"],
  ["رياضه", "entertainment"],
  ["رياضة", "entertainment"],
  ["نتفلكس", "subscriptions"],
  ["netflix", "subscriptions"],
  ["سبوتيفاي", "subscriptions"],
  ["spotify", "subscriptions"],
  ["chatgpt", "subscriptions"],
  ["شات جي بي تي", "subscriptions"],
  ["سجاير", "smoking"],
  ["سجائر", "smoking"],
  ["علبه", "smoking"],
  ["علبة", "smoking"],
  ["فيب", "smoking"],
  ["ليكود", "smoking"],
  ["شيشه", "smoking"],
  ["شيشة", "smoking"],
  ["معسل", "smoking"],
  ["صدقه", "gifts"],
  ["صدقة", "gifts"],
  ["تبرع", "gifts"],
  ["اتبرعت", "gifts"],
  ["زكاه", "gifts"],
  ["زكاة", "gifts"],
  ["عيديه", "gifts"],
  ["عيدية", "gifts"],
  ["فرح", "gifts"],
  ["خطوبه", "gifts"],
  ["خطوبة", "gifts"],
  ["كارتة", "transport"],
  ["ركنه", "transport"],
  ["ركنة", "transport"],
  ["زيت", "transport"],
  ["مخالفه", "government_services"],
  ["مخالفة", "government_services"],
  ["بطاريه", "transport"],
  ["بطارية", "transport"],
  ["كاوتش", "transport"],
  ["إطارات", "transport"],
  ["اطارات", "transport"],
  [" vpn", "subscriptions"],
  ["vpn", "subscriptions"],
  ["cloud", "subscriptions"],
  ["كلاود", "subscriptions"],
  ["دومين", "work"],
  ["domain", "work"],
  // "hosting" was declared twice; buildAliasMap() writes in array order, so the later
  // `work` entry silently won. Both categories happen to declare an استضافة
  // subcategory, but hosting belongs with domains and cloud under work.
  ["hosting", "work"],
  ["استضافه", "work"],
  ["استضافة", "work"],
  ["api", "work"],
  ["واجهه", "work"],
  ["واجهات", "work"],
  ["مكتب", "work"],
  ["ادوات", "work"],
  ["أدوات", "work"],
  ["مدرسه", "education"],
  ["مدرسة", "education"],
  ["جامعه", "education"],
  ["جامعة", "education"],
  ["كورس", "education"],
  ["كورسات", "education"],
  ["كتاب", "education"],
  ["كتب", "education"],
  ["دروس", "education"],
  ["جمعيه", "transfer"],
  ["جمعية", "transfer"],
  ["فاليو", "installments"],
  ["تمويل", "installments"],

  // ── Migrated from taxonomy-ssot.ts ──────────────────────────────────────────
  // taxonomy-ssot.ts carried a richer Egyptian alias set than this table but was
  // consumed by exactly one module, and five of its ids (housing, personal_care,
  // charity, debt_payment, other) do not exist here — so those aliases resolved to
  // nothing and AI-Center questions about سكن / تبرعات / سداد ديون matched no rows.
  // The aliases are migrated here so the whole system gains them and the ssot can
  // become a derived view.
  //
  // Only aliases that resolved to NOTHING before are added: where the ssot and this
  // table disagreed the existing mapping wins, because it is generally the better one
  // (ركنة is transport, netflix is subscriptions, جيم is entertainment).
  //
  // Deliberately NOT migrated, because canonicalCategoryId() falls back to an
  // unanchored substring scan over aliases of length >= 3, so a common word here
  // hijacks any sentence containing it: تاني · رسالة · شعر · مهر (inside مهرجان) ·
  // gym · شراء · جهاز · مشتريات · اشتراك.
  ["شرب", "food"],
  ["لحوم", "food"],
  ["جزار", "food"],
  ["مخبز", "food"],
  ["فرن", "food"],
  ["kfc", "food"],
  ["mcdonalds", "food"],
  ["ماكدونالدز", "food"],
  ["كوك دور", "food"],
  ["قهوجي", "food"],

  ["careem", "transport"],
  ["قطار", "transport"],
  ["قطارات", "transport"],
  ["سولار", "transport"],
  ["ميكانيكي", "transport"],
  ["سايس", "transport"],
  ["توك توك", "transport"],
  ["سويفل", "transport"],
  ["swvl", "transport"],

  ["ميه", "bills"],
  ["ارضي", "bills"],
  ["موبايل", "bills"],
  ["وي", "bills"],
  ["اورنج", "bills"],
  ["فودافون", "bills"],
  ["اتصالات", "bills"],
  ["نتفليكس", "subscriptions"],

  ["بواب", "home"],
  ["حارس", "home"],

  ["شوبنج", "shopping"],
  ["قميص", "shopping"],
  ["بنطلون", "shopping"],
  ["فستان", "shopping"],
  ["حذاء", "shopping"],
  ["امازون", "shopping"],
  ["amazon", "shopping"],
  ["جوميا", "shopping"],
  ["نون", "shopping"],
  ["noon", "shopping"],
  ["نظارة", "shopping"],
  ["ساعة", "shopping"],
  ["حلاق", "personal_care"],
  ["حلاقة", "personal_care"],
  ["دقن", "personal_care"],
  ["كوافير", "personal_care"],
  ["بيوتي سنتر", "personal_care"],
  ["برفيوم", "personal_care"],
  ["مكياج", "personal_care"],
  ["مناديل", "shopping"],
  ["شامبو", "personal_care"],
  ["معجون سنان", "personal_care"],

  ["طبيب", "health"],
  ["كشف", "health"],
  ["عيادة", "health"],
  ["اشعة", "health"],
  ["أشعة", "health"],
  ["روشتة", "health"],

  ["كلية", "education"],
  ["كليه", "education"],
  ["كشكول", "education"],
  ["دبلومة", "education"],

  ["خروج", "entertainment"],
  ["فسحة", "entertainment"],
  ["فسحه", "entertainment"],
  ["مسرح", "entertainment"],
  ["ملاهي", "entertainment"],
  ["مصيف", "entertainment"],
  ["بحر", "entertainment"],
  ["اوتيل", "entertainment"],
  ["فندق", "entertainment"],
  ["ماتش", "entertainment"],

  ["هدية", "gifts"],
  ["هديه", "gifts"],
  ["سبوع", "gifts"],
  ["شبكة", "gifts"],
  ["جامع", "gifts"],
  ["كنيسة", "gifts"],
  ["اورمان", "gifts"],
  ["٥٧٣٥٧", "gifts"],
  ["مساعدة محتاج", "gifts"],

  ["سبائك", "investment"],
  ["ثاندر", "investment"],
  ["thndr", "investment"],
  ["ربح", "investment_income"],
  ["مبيعات", "freelance"],
  ["حوالة واردة", "transfer"],

  ["ديون", "transfer"],
  ["سداد", "installments"],
  ["تسديد", "installments"],
  ["ارجاع فلوس", "transfer"],

  ["غير مصنف", "miscellaneous"],
  ["نثرية", "miscellaneous"],
  ["نثريات", "miscellaneous"],

  // ── Collision repairs (must stay last: buildAliasMap applies this table AFTER the
  //    auto-generated subcategory names, so these entries win) ──────────────────
  //
  // "أكل" is the single most common Egyptian food word, but `pets` declares a
  // subcategory literally named "أكل" (pet food), so the auto-generated alias sent
  // every "الاكل" query to حيوانات أليفة.
  ["أكل", "food"],
  ["اكل", "food"],
  // "طعام" was worse: it is not a direct alias, so canonicalCategoryId fell through to
  // its unanchored substring scan, where "طعام" contains "عام" — the generic
  // subcategory name every category declares — and resolved to whichever category
  // happened to own the last "عام" entry.
  ["طعام", "food"],
];

const ALIAS_TO_ID = new Map<string, string>();

function buildAliasMap(): void {
  for (const cat of CATEGORIES) {
    ALIAS_TO_ID.set(comparableArabic(cat.id), cat.id);
    ALIAS_TO_ID.set(comparableArabic(cat.name), cat.id);
    ALIAS_TO_ID.set(comparableArabic(cat.name_ar), cat.id);
    for (const sub of cat.subcategories) {
      ALIAS_TO_ID.set(comparableArabic(sub.id), cat.id);
      ALIAS_TO_ID.set(comparableArabic(sub.name), cat.id);
      ALIAS_TO_ID.set(comparableArabic(sub.name_ar), cat.id);
    }
  }
  for (const [alias, id] of EXTRA_ALIASES_TO_ID) {
    ALIAS_TO_ID.set(comparableArabic(alias), id);
  }
  for (const [from, to] of CATEGORY_ALIASES) {
    const targetCat = findCategoryByAnyName(to);
    if (targetCat) {
      ALIAS_TO_ID.set(comparableArabic(from), targetCat.id);
    }
  }
}

buildAliasMap();

const VIRTUAL_AGGREGATE_IDS: Record<string, { id: string; arabicName: string; type: string }> = {
  income: { id: "income", arabicName: "الدخل", type: "income" },
  saving: { id: "saving", arabicName: "الادخار", type: "transfer" },
  uncategorized: { id: "uncategorized", arabicName: "غير مصنف", type: "expense" },
};

/**
 * Exact-alias resolution only, for callers that must not guess.
 *
 * `canonicalCategoryId` deliberately falls through to an unanchored substring scan so it
 * can pull a category out of free-form user text. That is the right behaviour there and
 * the wrong behaviour when the input is a MODEL answering an enum: "business" contains
 * "bus", so an invalid category was silently "repaired" into مواصلات and written down as
 * if the model had said it. Returns null instead of a guess.
 */
export function exactCategoryId(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = comparableArabic(input);
  if (!normalized) return null;
  return ALIAS_TO_ID.get(normalized) ?? findCategoryByAnyName(input)?.id ?? null;
}

export function canonicalCategoryId(input: string | null | undefined): string {
  if (!input) return "uncategorized";
  const normalized = comparableArabic(input);
  if (!normalized) return "uncategorized";

  const direct = ALIAS_TO_ID.get(normalized);
  if (direct) return direct;

  for (const [alias, id] of ALIAS_TO_ID) {
    if (normalized.includes(alias) && alias.length >= 3) {
      return id;
    }
  }

  const cat = findCategoryByAnyName(input);
  if (cat) return cat.id;

  return "uncategorized";
}

export function arabicDisplayName(id: string | null | undefined): string {
  if (!id) return "غير مصنف";
  if (VIRTUAL_AGGREGATE_IDS[id]) return VIRTUAL_AGGREGATE_IDS[id].arabicName;
  const cat = CATEGORY_ID_MAP.get(id);
  return cat?.name_ar ?? (id || "غير مصنف");
}

export function getCategoryAliasesById(id: string): string[] {
  if (VIRTUAL_AGGREGATE_IDS[id]) {
    const aliases: string[] = [id];
    if (id === "income") aliases.push("دخل", "مرتب", "راتب", "salary", "قبض");
    if (id === "saving") aliases.push("ادخار", "تحويش", "جمعية", "جمعيه");
    if (id === "uncategorized") aliases.push("غير مصنف", "أخرى", "متنوعات");
    return [...new Set(aliases)];
  }
  const cat = CATEGORY_ID_MAP.get(id);
  if (!cat) return [id];
  const aliases = [id, cat.name, cat.name_ar];
  for (const [alias, targetId] of ALIAS_TO_ID) {
    if (targetId === id) {
      const originalAlias = [...EXTRA_ALIASES_TO_ID].find(([a]) => comparableArabic(a) === alias)?.[0];
      if (originalAlias) aliases.push(originalAlias);
    }
  }
  return [...new Set(aliases)];
}

export function categoryTypeOf(id: string | null | undefined): string {
  if (!id) return "expense";
  if (VIRTUAL_AGGREGATE_IDS[id]) return VIRTUAL_AGGREGATE_IDS[id].type;
  const cat = CATEGORY_ID_MAP.get(id);
  return cat?.type ?? "expense";
}

export function normalizeCategoryFromUserText(text: string): string {
  return canonicalCategoryId(text);
}

/**
 * The ONLY function permitted to produce a value for `expenses.category` or
 * `user_budgets.category`.
 *
 * `expenses.category` is a varchar holding the ARABIC `name_ar`, and historical rows
 * already hold it. Readers compare it by exact string equality in the places users
 * actually look — budget-router.ts matches budgets to spend, expense-router filters
 * and the person-category set, export-router writes it straight into the export file —
 * so a row written with an English canonical id is invisible to all of them.
 *
 * Accepts an English id, an Arabic name_ar, an alias, or free text; always returns a
 * real CATEGORIES[].name_ar. Virtual aggregate ids are report buckets, never storage,
 * so they are resolved to the concrete category that represents them.
 */
export function storageCategoryName(input: string | null | undefined): string {
  const id = canonicalCategoryId(input);
  if (VIRTUAL_AGGREGATE_IDS[id]) {
    if (id === "saving") return "تحويل";
    if (id === "income") return "دخل آخر";
    return "متنوعات";
  }
  return CATEGORY_ID_MAP.get(id)?.name_ar ?? "متنوعات";
}

export function normalizeStoredCategory(stored: string | null | undefined): string {
  if (!stored) return "uncategorized";
  const id = canonicalCategoryId(stored);
  return id;
}

export function taxonomyVersion(): string {
  return "tax_v3_2026_09";
}
