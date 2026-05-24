import { CATEGORIES, normalizeCategoryName, normalizeSubCategoryName } from "./category-registry";

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
  "فكيت بنزين": { category: "خدمات سيارات", subCategory: "بنزين", confidence: 94 },
  "دفعت للسايس": { category: "خدمات سيارات", subCategory: "ركنة", confidence: 93 },
  "حطيت للراجل بتاع الركنة": { category: "خدمات سيارات", subCategory: "ركنة", confidence: 91 },
  "شحنت رصيد": { category: "خدمات رقمية", subCategory: "شحن موبايل", confidence: 97 },
  "جددت الباقة": { category: "خدمات رقمية", subCategory: "باقات إنترنت", confidence: 95 },
  "دفعت للكهربا": { category: "التزامات يومية", subCategory: "كهرباء", confidence: 95 },
  "جبت سلك شاحن": { category: "أدوات شغل", subCategory: "ملحقات تقنية", confidence: 76, ambiguityFlags: ["could_be_personal_or_work"] },
  "دفعت قسط الجمعية": { category: "أقساط", subCategory: "جمعية", confidence: 92 },
  "حجزت ماتش": { category: "خروجات", subCategory: "PlayStation", confidence: 78, ambiguityFlags: ["could_be_sports_or_gaming"] },
  "اتبرعت للجمعية": { category: "مجاملات", subCategory: "تبرع", confidence: 90 },
  "حطيت فلوس في الكارت": { category: "تحويلات", subCategory: "شحن كارت", confidence: 75, ambiguityFlags: ["card_type_unknown"] },
  "دفعت عربون": { category: "مدفوعات طوارئ", subCategory: "عربون", confidence: 72, ambiguityFlags: ["target_unknown"] },
  "غيرت زيت": { category: "خدمات سيارات", subCategory: "تغيير زيت", confidence: 96 },
  "كارتة": { category: "خدمات سيارات", subCategory: "كارتة", confidence: 94 },
  "اشتركت vpn": { category: "خدمات رقمية", subCategory: "اشتراك VPN", confidence: 95 },
  "اشتركت cloud": { category: "خدمات رقمية", subCategory: "اشتراك Cloud", confidence: 95 },
  "اشتراك ai": { category: "خدمات رقمية", subCategory: "أدوات AI", confidence: 90 },
};

const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  "سكن وفواتير": "التزامات يومية",
  "فواتير": "التزامات يومية",
  "مواصلات": "خدمات سيارات",
  "ترفيه": "خروجات",
  "هدايا وصدقات": "مجاملات",
  "عمل": "أدوات شغل",
  "متنوعات": "مصروف شخصي",
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
  if (!normalized) return null;

  let best: TaxonomyMatch | null = null;
  for (const [phrase, entry] of Object.entries(SYNONYM_GRAPH)) {
    if (!normalized.includes(phrase.toLowerCase())) continue;
    const candidate: TaxonomyMatch = {
      category: toBackwardCompatibleCategory(entry.category),
      subCategory: "",
      confidence: entry.confidence ?? 80,
      inferenceSource: "synonym",
      ambiguityFlags: entry.ambiguityFlags,
    };
    candidate.subCategory = normalizeSubCategoryName(candidate.category, entry.subCategory, normalized);
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }
  return best;
}
