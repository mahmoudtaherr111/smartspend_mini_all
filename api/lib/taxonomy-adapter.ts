import {
  CATEGORIES,
  comparableArabic,
  normalizeCategoryName,
  normalizeSubCategoryName,
} from "./category-registry";

export interface TaxonomyMatch {
  category: string;
  subCategory: string;
  confidence: number;
  inferenceSource: "synonym" | "rule" | "dictionary";
  ambiguityFlags?: string[];
}

type SynonymEntry = {
  category: string;
  subCategory: string;
  confidence?: number;
  ambiguityFlags?: string[];
};

const SYNONYM_GRAPH: Record<string, SynonymEntry> = {
  // ─── Cars & Transport (مواصلات / خدمات سيارات) ───
  "فكيت بنزين": { category: "مواصلات", subCategory: "بنزين", confidence: 94 },
  تفويلة: { category: "مواصلات", subCategory: "بنزين", confidence: 96 },
  "بنزين للعربية": {
    category: "مواصلات",
    subCategory: "بنزين",
    confidence: 97,
  },
  "دفعت للسايس": {
    category: "خدمات سيارات",
    subCategory: "ركنة",
    confidence: 93,
  },
  "حطيت للراجل بتاع الركنة": {
    category: "خدمات سيارات",
    subCategory: "ركنة",
    confidence: 91,
  },
  سايس: { category: "خدمات سيارات", subCategory: "ركنة", confidence: 90 },
  "ركنة العربية": {
    category: "خدمات سيارات",
    subCategory: "ركنة",
    confidence: 95,
  },
  "غيرت زيت": {
    category: "خدمات سيارات",
    subCategory: "تغيير زيت",
    confidence: 96,
  },
  "زيت الموتور": {
    category: "خدمات سيارات",
    subCategory: "تغيير زيت",
    confidence: 95,
  },
  كارتة: { category: "خدمات سيارات", subCategory: "كارتة", confidence: 94 },
  "غسلت العربية": {
    category: "مواصلات",
    subCategory: "صيانة عربية",
    confidence: 96,
  },
  "غسيل وكار كير": {
    category: "مواصلات",
    subCategory: "صيانة عربية",
    confidence: 97,
  },
  ميكانيكي: { category: "مواصلات", subCategory: "صيانة عربية", confidence: 95 },
  "ركبت اوبر": {
    category: "مواصلات",
    subCategory: "أوبر/كريم",
    confidence: 98,
  },
  "ركبت كريم": {
    category: "مواصلات",
    subCategory: "أوبر/كريم",
    confidence: 98,
  },
  أوبر: { category: "مواصلات", subCategory: "أوبر/كريم", confidence: 97 },
  تاكسي: { category: "مواصلات", subCategory: "تاكسي", confidence: 98 },
  "تذكرة مترو": { category: "مواصلات", subCategory: "مترو", confidence: 98 },
  "مترو الأنفاق": { category: "مواصلات", subCategory: "مترو", confidence: 98 },
  ميكروباص: { category: "مواصلات", subCategory: "أتوبيس", confidence: 95 },

  // ─── Digital & Telecom (فواتير) ───
  "شحنت رصيد": {
    category: "فواتير",
    subCategory: "شحن رصيد",
    confidence: 97,
  },
  "رصيد موبايل": {
    category: "فواتير",
    subCategory: "شحن رصيد",
    confidence: 97,
  },
  "جددت الباقة": {
    category: "فواتير",
    subCategory: "إنترنت",
    confidence: 95,
  },
  "باقة الموبايل": {
    category: "فواتير",
    subCategory: "شحن رصيد",
    confidence: 95,
  },
  "شحنت باقة النت": {
    category: "فواتير",
    subCategory: "إنترنت",
    confidence: 97,
  },
  "فاتورة النت": {
    category: "فواتير",
    subCategory: "إنترنت",
    confidence: 98,
  },
  "نت منزلي": {
    category: "فواتير",
    subCategory: "إنترنت",
    confidence: 97,
  },
  "اشتركت vpn": {
    category: "خدمات رقمية",
    subCategory: "اشتراك VPN",
    confidence: 95,
  },
  "اشتركت cloud": {
    category: "خدمات رقمية",
    subCategory: "اشتراك Cloud",
    confidence: 95,
  },
  "اشتراك ai": {
    category: "خدمات رقمية",
    subCategory: "أدوات AI",
    confidence: 90,
  },

  // ─── Utilities (فواتير) ───
  "دفعت للكهربا": {
    category: "فواتير",
    subCategory: "كهرباء",
    confidence: 95,
  },
  "فاتورة الكهربا": {
    category: "فواتير",
    subCategory: "كهرباء",
    confidence: 98,
  },
  "فاتورة الكهرباء": {
    category: "فواتير",
    subCategory: "كهرباء",
    confidence: 98,
  },
  "فاتورة كهربا": {
    category: "فواتير",
    subCategory: "كهرباء",
    confidence: 98,
  },
  "فاتورة كهرباء": {
    category: "فواتير",
    subCategory: "كهرباء",
    confidence: 98,
  },
  "كارت الكهربا": {
    category: "فواتير",
    subCategory: "كهرباء",
    confidence: 98,
  },
  "فاتورة المياه": {
    category: "فواتير",
    subCategory: "مياه",
    confidence: 98,
  },
  "فاتورة مياه": {
    category: "فواتير",
    subCategory: "مياه",
    confidence: 98,
  },
  "فاتورة المية": {
    category: "فواتير",
    subCategory: "مياه",
    confidence: 98,
  },
  "فاتورة مية": {
    category: "فواتير",
    subCategory: "مياه",
    confidence: 98,
  },
  "فاتورة الغاز": {
    category: "فواتير",
    subCategory: "غاز",
    confidence: 98,
  },
  "فاتورة غاز": {
    category: "فواتير",
    subCategory: "غاز",
    confidence: 98,
  },

  // ─── Food & Groceries (أكل وشرب) ───
  فطرت: { category: "أكل وشرب", subCategory: "وجبات سريعة", confidence: 95 },
  اتعشيت: { category: "أكل وشرب", subCategory: "وجبات سريعة", confidence: 95 },
  "جبت غدا": {
    category: "أكل وشرب",
    subCategory: "وجبات سريعة",
    confidence: 95,
  },
  "جبت فطار": {
    category: "أكل وشرب",
    subCategory: "وجبات سريعة",
    confidence: 95,
  },
  "جبت عشا": {
    category: "أكل وشرب",
    subCategory: "وجبات سريعة",
    confidence: 95,
  },
  "شربت قهوة": {
    category: "أكل وشرب",
    subCategory: "قهوة وكافيه",
    confidence: 96,
  },
  "شربت شاي": {
    category: "أكل وشرب",
    subCategory: "قهوة وكافيه",
    confidence: 94,
  },
  "طلبات سوبرماركت": {
    category: "أكل وشرب",
    subCategory: "بقالة",
    confidence: 97,
  },
  "طلبات البيت": { category: "أكل وشرب", subCategory: "بقالة", confidence: 95 },
  "خضار وفاكهة": { category: "أكل وشرب", subCategory: "بقالة", confidence: 98 },
  "لحوم ودواجن": {
    category: "أكل وشرب",
    subCategory: "لحوم ودواجن",
    confidence: 98,
  },
  "جبت لحمة": {
    category: "أكل وشرب",
    subCategory: "لحوم ودواجن",
    confidence: 97,
  },
  "جبت فراخ": {
    category: "أكل وشرب",
    subCategory: "لحوم ودواجن",
    confidence: 97,
  },
  "عيش من الفرن": {
    category: "أكل وشرب",
    subCategory: "مخبوزات",
    confidence: 96,
  },
  دليفري: { category: "أكل وشرب", subCategory: "دليفري", confidence: 96 },
  بقال: { category: "أكل وشرب", subCategory: "بقالة", confidence: 95 },

  // ─── Home (سكن) ───
  "دفعت الإيجار": { category: "سكن", subCategory: "إيجار", confidence: 99 },
  "إيجار الشقة": { category: "سكن", subCategory: "إيجار", confidence: 99 },
  "منظفات للبيت": { category: "سكن", subCategory: "منظفات", confidence: 96 },
  "أديت للبواب": { category: "سكن", subCategory: "عام", confidence: 95 },
  "صيانة سباكة": { category: "سكن", subCategory: "صيانة", confidence: 95 },
  سباك: { category: "سكن", subCategory: "صيانة", confidence: 96 },
  "كهربائي للبيت": { category: "سكن", subCategory: "صيانة", confidence: 96 },

  // ─── Shopping (تسوق) ───
  "اشتريت لبس": { category: "تسوق", subCategory: "ملابس", confidence: 98 },
  "هدوم جديدة": { category: "تسوق", subCategory: "ملابس", confidence: 98 },
  "جبت جزمة": { category: "تسوق", subCategory: "أحذية", confidence: 97 },
  "قصيت شعري": { category: "تسوق", subCategory: "عناية شخصية", confidence: 95 },
  حلقت: { category: "تسوق", subCategory: "عناية شخصية", confidence: 95 },
  حلاق: { category: "تسوق", subCategory: "عناية شخصية", confidence: 96 },
  الحلاق: { category: "تسوق", subCategory: "عناية شخصية", confidence: 96 },
  كوافير: { category: "تسوق", subCategory: "عناية شخصية", confidence: 96 },
  الكوافير: { category: "تسوق", subCategory: "عناية شخصية", confidence: 96 },
  صالون: { category: "تسوق", subCategory: "عناية شخصية", confidence: 96 },
  الصالون: { category: "تسوق", subCategory: "عناية شخصية", confidence: 96 },
  "صالون حلاقة": { category: "تسوق", subCategory: "عناية شخصية", confidence: 98 },
  "صالون تجميل": { category: "تسوق", subCategory: "عناية شخصية", confidence: 98 },
  حلاقة: { category: "تسوق", subCategory: "عناية شخصية", confidence: 96 },
  "شامبو ومعجون": {
    category: "تسوق",
    subCategory: "عناية شخصية",
    confidence: 96,
  },
  "موبايل جديد": {
    category: "تسوق",
    subCategory: "أجهزة إلكترونية",
    confidence: 98,
  },
  "جبت سلك شاحن": {
    category: "تسوق",
    subCategory: "أجهزة إلكترونية",
    confidence: 85,
  },

  // ─── Health (صحة) ───
  "كشف دكتور": { category: "صحة", subCategory: "دكتور", confidence: 98 },
  روشتة: { category: "صحة", subCategory: "صيدلية", confidence: 97 },
  "علاج من الصيدلية": {
    category: "صحة",
    subCategory: "صيدلية",
    confidence: 98,
  },
  "ادويه من الصيدليه": {
    category: "صحة",
    subCategory: "صيدلية",
    confidence: 98,
  },
  "تحليل دم": { category: "صحة", subCategory: "تحاليل", confidence: 98 },
  "كشف سنان": { category: "صحة", subCategory: "أسنان", confidence: 98 },

  // ─── Education (تعليم) ───
  "مصاريف المدرسة": { category: "تعليم", subCategory: "مدرسة", confidence: 99 },
  "قسط الجامعة": { category: "تعليم", subCategory: "جامعة", confidence: 99 },
  "درس خصوصي": {
    category: "تعليم",
    subCategory: "دروس خصوصية",
    confidence: 98,
  },
  "كتب المدرسة": { category: "تعليم", subCategory: "كتب", confidence: 97 },

  // ─── Entertainment & Outings (ترفيه) ───
  سينما: { category: "ترفيه", subCategory: "سينما", confidence: 98 },
  "اشتراك الجيم": {
    category: "ترفيه",
    subCategory: "رياضة وجيم",
    confidence: 97,
  },
  "تذكرة كورة": {
    category: "ترفيه",
    subCategory: "رياضة وجيم",
    confidence: 95,
  },
  "حجزت ملعب": { category: "ترفيه", subCategory: "رياضة وجيم", confidence: 90 },
  بلايستيشن: { category: "ترفيه", subCategory: "ألعاب", confidence: 98 },
  "خروجة صحاب": {
    category: "ترفيه",
    subCategory: "خروجة",
    confidence: 98,
  },
  "سفرية مصيف": { category: "ترفيه", subCategory: "سفر", confidence: 98 },
  فسحة: { category: "ترفيه", subCategory: "خروجة", confidence: 95 },
  "حجزت ماتش": { category: "ترفيه", subCategory: "رياضة وجيم", confidence: 90 },

  // ─── Smoking (تدخين) ───
  "علبة سجائر": { category: "تدخين", subCategory: "سجائر", confidence: 98 },
  "علبة سجاير": { category: "تدخين", subCategory: "سجائر", confidence: 98 },
  "ليكود فيب": { category: "تدخين", subCategory: "فيب/ليكود", confidence: 97 },
  "حجر شيشة": { category: "تدخين", subCategory: "شيشة/معسل", confidence: 96 },

  // ─── Gifts & Charity (هدايا وصدقات) ───
  صدقة: { category: "هدايا وصدقات", subCategory: "صدقة/تبرع", confidence: 98 },
  اتبرعت: {
    category: "هدايا وصدقات",
    subCategory: "صدقة/تبرع",
    confidence: 98,
  },
  "زكاة مال": { category: "هدايا وصدقات", subCategory: "زكاة", confidence: 99 },
  "نقوط فرح": {
    category: "هدايا وصدقات",
    subCategory: "فرح/خطوبة",
    confidence: 98,
  },
  "هدية عيد ميلاد": {
    category: "هدايا وصدقات",
    subCategory: "عيد ميلاد",
    confidence: 98,
  },
  "اتبرعت للجمعية": {
    category: "هدايا وصدقات",
    subCategory: "صدقة/تبرع",
    confidence: 92,
  },
  "قسط الجمعية": { category: "فواتير", subCategory: "أقساط", confidence: 92 },

  // ─── Income & Freelance (مرتب / عمل حر / عوائد استثمار) ───
  "قبضت المرتب": {
    category: "مرتب",
    subCategory: "مرتب أساسي",
    confidence: 99,
  },
  "نزلي المرتب": {
    category: "مرتب",
    subCategory: "مرتب أساسي",
    confidence: 99,
  },
  "بونص الشغل": {
    category: "مرتب",
    subCategory: "مكافأة/بونص",
    confidence: 98,
  },
  "سبوبة فريلانس": { category: "عمل حر", subCategory: "سبوبة", confidence: 98 },
  "مشروع فريلانس": { category: "عمل حر", subCategory: "مشروع", confidence: 98 },
  "أرباح البنك": {
    category: "عوائد استثمار",
    subCategory: "أرباح",
    confidence: 97,
  },
  "كاش باك": {
    category: "عوائد استثمار",
    subCategory: "كاش باك",
    confidence: 98,
  },
  "كاشباك": {
    category: "عوائد استثمار",
    subCategory: "كاش باك",
    confidence: 98,
  },

  // ─── Financial Transfers & Payments (تحويل / استثمار) ───
  "سحبت من الـ ATM": {
    category: "تحويل",
    subCategory: "سحب ATM",
    confidence: 98,
  },
  "سحبت من ATM": {
    category: "تحويل",
    subCategory: "سحب ATM",
    confidence: 98,
  },
  "سحبت atm": {
    category: "تحويل",
    subCategory: "سحب ATM",
    confidence: 97,
  },
  "تحويل انستاباي": {
    category: "تحويل",
    subCategory: "انستاباي",
    confidence: 99,
  },
  "حولت فودافون كاش": {
    category: "تحويل",
    subCategory: "فودافون كاش",
    confidence: 98,
  },
  "حطيت فلوس في الكارت": {
    category: "تحويل",
    subCategory: "عام",
    confidence: 75,
    ambiguityFlags: ["card_type_unknown"],
  },
  "اشتريت ذهب": { category: "استثمار", subCategory: "ذهب", confidence: 98 },
  "شهادات البنك": {
    category: "استثمار",
    subCategory: "شهادات",
    confidence: 98,
  },
  "أسهم البورصة": { category: "استثمار", subCategory: "أسهم", confidence: 98 },
  "دفعت عربون": {
    category: "متنوعات",
    subCategory: "عام",
    confidence: 72,
    ambiguityFlags: ["target_unknown"],
  },

  // ─── Relationships & Family (العائلة / أصدقاء / موظفين) ───
  اخويا: { category: "العائلة", subCategory: "عام", confidence: 95 },
  أخويا: { category: "العائلة", subCategory: "عام", confidence: 95 },
  اخي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  أخي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  اختي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  أختي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  ابويا: { category: "العائلة", subCategory: "عام", confidence: 95 },
  أبويا: { category: "العائلة", subCategory: "عام", confidence: 95 },
  امي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  أمي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  ماما: { category: "العائلة", subCategory: "عام", confidence: 95 },
  بابا: { category: "العائلة", subCategory: "عام", confidence: 95 },
  ابني: { category: "العائلة", subCategory: "عام", confidence: 95 },
  بنتي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  مراتي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  زوجتي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  جوزي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  زوجي: { category: "العائلة", subCategory: "عام", confidence: 95 },
  صاحبي: { category: "أصدقاء", subCategory: "عام", confidence: 95 },
  صاحبتي: { category: "أصدقاء", subCategory: "عام", confidence: 95 },
  صديقي: { category: "أصدقاء", subCategory: "عام", confidence: 95 },
  صديقتي: { category: "أصدقاء", subCategory: "عام", confidence: 95 },
};

const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  "سكن وفواتير": "فواتير",
  // "فواتير" → "التزامات يومية" removed: both exist in CATEGORIES but "فواتير"
  // is the primary canonical name. Mapping it away caused circular conversions.
  // "ترفيه" → "خروجات" removed: both exist in CATEGORIES. "ترفيه" is canonical.
  // "هدايا وصدقات" → "مجاملات" removed: "مجاملات" does NOT exist in CATEGORIES → orphaned.
  // "عمل" → "أدوات شغل" removed: "أدوات شغل" does NOT exist in CATEGORIES → orphaned.
};

const KNOWN_CATEGORIES = new Set(CATEGORIES.map((c) => c.name_ar));

export function mapLegacyCategory(category: string): string {
  return LEGACY_CATEGORY_ALIASES[category] || category;
}

export function toBackwardCompatibleCategory(category: string): string {
  if (KNOWN_CATEGORIES.has(category)) return normalizeCategoryName(category);
  return normalizeCategoryName(mapLegacyCategory(category));
}

export function findTaxonomyMatch(text: string): TaxonomyMatch | null {
  const normalized = text.trim().toLowerCase();
  const comparable = comparableArabic(normalized);
  if (!normalized) return null;

  let best: TaxonomyMatch | null = null;
  for (const [phrase, entry] of Object.entries(SYNONYM_GRAPH)) {
    if (!comparable.includes(comparableArabic(phrase))) continue;
    const candidate: TaxonomyMatch = {
      category: toBackwardCompatibleCategory(entry.category),
      subCategory: "",
      confidence: entry.confidence ?? 80,
      inferenceSource: "synonym",
      ambiguityFlags: entry.ambiguityFlags,
    };
    candidate.subCategory = normalizeSubCategoryName(
      candidate.category,
      entry.subCategory,
      normalized,
    );
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }
  return best;
}
