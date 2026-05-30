/**
 * SmartSpend Relationship Normalizer
 * Normalizes Egyptian Arabic colloquial relationship terms into standard terminology
 * and generates appropriate suffixes for categorization.
 */

import { comparableArabic } from "./category-registry";

export interface NormalizedRelationship {
  normalized: string;
  category: string;
  subCategory: string; // The base subCategory without the person's name
}

// Map of normalized terms to their canonical Arabic relationship forms
const RELATIONSHIP_MAP: Record<string, string> = {
  // Family - Immediate
  اخ: "أخ",
  اخويا: "أخ",
  اخوي: "أخ",
  اخوك: "أخ",
  اخت: "أخت",
  اختي: "أخت",
  اب: "أب",
  ابويا: "أب",
  بابا: "أب",
  والدي: "أب",
  ام: "أم",
  امي: "أم",
  ماما: "أم",
  والدتي: "أم",
  ابن: "ابن",
  ابني: "ابن",
  بنت: "ابنة",
  بنتي: "ابنة",

  // Family - Extended
  عم: "عم",
  عمي: "عم",
  عمه: "عمة",
  عمتي: "عمة",
  خال: "خال",
  خالي: "خال",
  خاله: "خالة",
  خالتي: "خالة",
  جد: "جد",
  جدي: "جد",
  جدو: "جد",
  جده: "جدة",
  جدتي: "جدة",
  تيته: "جدة",
  تيتا: "جدة",

  // Spouse / Partner
  زوج: "زوج",
  جوزي: "زوج",
  زوجه: "زوجة",
  مراتي: "زوجة",
  خطيب: "خطيب",
  خطيبي: "خطيب",
  خطيبه: "خطيبة",
  خطيبتي: "خطيبة",

  // Friends & Social
  صاحب: "صديق",
  صاحبي: "صديق",
  صديق: "صديق",
  صديقي: "صديق",
  صاحبه: "صديقة",
  صاحبتي: "صديقة",
  صديقه: "صديقة",
  صديقتي: "صديقة",
  زميل: "زميل",
  زميلي: "زميل",
  زميله: "زميلة",
  زميلتي: "زميلة",
  جاري: "جار",
  جارتي: "جارة",

  // Work
  مدير: "مدير",
  مديري: "مدير",
  موظف: "موظف",
  "موظف عندي": "موظف",
  شغال: "عامل",
  بواب: "حارس",
  سواق: "سائق",
};

// Suffix mapping to create natural sounding subcategories (e.g. "مروان صاحبك")
const SUFFIX_MAP: Record<string, string> = {
  أخ: "أخوك",
  أخت: "أختك",
  أب: "والدك",
  أم: "والدتك",
  ابن: "ابنك",
  ابنة: "بنتك",
  عم: "عمك",
  عمة: "عمتك",
  خال: "خالك",
  خالة: "خالتك",
  جد: "جدك",
  جدة: "جدتك",
  زوج: "جوزك",
  زوجة: "مراتك",
  خطيب: "خطيبك",
  خطيبة: "خطيبتك",
  صديق: "صاحبك",
  صديقة: "صاحبتك",
  زميل: "زميلك",
  زميلة: "زميلتك",
  مدير: "مديرك",
  موظف: "موظفك",
  جار: "جارك",
  جارة: "جارتك",
};

/**
 * Normalizes a relationship word (e.g., "اخويا") into a standard form (e.g., "أخ")
 */
export function normalizeRelationship(
  rawRelation: string,
): NormalizedRelationship {
  if (!rawRelation) {
    return {
      normalized: "شخص معروف",
      category: "العائلة",
      subCategory: "شخص معروف",
    };
  }

  // Remove common prefixes
  let cleanWord = rawRelation.trim().replace(/^[بلكف]/, "");

  // Custom comparability for relations to handle trailing "ي" (my) properly without losing it entirely
  // but comparableArabic already turns ى to ي and ة to ه
  let compWord = comparableArabic(cleanWord);

  let normalized = RELATIONSHIP_MAP[compWord];

  // If not found with stripped prefix, try the original word in case the prefix wasn't a prefix
  if (!normalized) {
    normalized = RELATIONSHIP_MAP[comparableArabic(rawRelation.trim())];
  }

  // If still not found, return the raw relation
  if (!normalized) {
    normalized = rawRelation.trim();
  }

  let category = "العائلة";
  if (["صديق", "صديقة", "زميل", "زميلة", "جار", "جارة"].includes(normalized)) {
    category = "أصدقاء";
  } else if (["مدير", "عامل", "حارس", "سائق", "موظف"].includes(normalized)) {
    category = "موظفين";
  } else if (normalized === "شخص معروف") {
    category = "تحويلات";
  }

  return {
    normalized,
    category,
    subCategory: normalized === "شخص معروف" ? "تحويلات شخصية" : normalized,
  };
}

/**
 * Gets the proper suffix for displaying a relationship (e.g., "صديق" -> "صاحبك")
 */
export function getRelationshipSuffix(normalizedRelation: string): string {
  return SUFFIX_MAP[normalizedRelation] || normalizedRelation;
}

/**
 * Intelligently parses subCategory string into separate contact name and relationship.
 * Supports multi-word names (e.g. "عبد الرحمن صاحبي") and reverse order (e.g. "صاحبي جلال").
 */
export function parseNameAndRelationship(
  subCategory: string,
  category: string,
): { name: string; relationship: string } {
  const nameRaw = subCategory.trim();
  let name = nameRaw;
  let relationship = "شخص معروف";
  const relationWords = [
    "اخويا",
    "صاحبي",
    "اختي",
    "صاحبتي",
    "صحبتي",
    "صديقي",
    "زميلي",
    "زميلتي",
    "امي",
    "ابويا",
    "بابا",
    "ماما",
    "مراتي",
    "جوزي",
    "بنتي",
    "ابني",
    "أخويا",
    "أختي",
    "أمي",
    "أبويا",
    "قريب",
    "قريبي",
    "قريبتك",
    "صاحبك",
    "موظف عندي",
    "موظف",
  ];

  if (nameRaw.includes(" ")) {
    const parts = nameRaw.split(/\s+/);
    const firstWord = parts[0];
    const lastWord = parts[parts.length - 1];

    if (relationWords.includes(lastWord)) {
      relationship = lastWord;
      name = parts.slice(0, -1).join(" ");
    } else if (relationWords.includes(firstWord)) {
      relationship = firstWord;
      name = parts.slice(1).join(" ");
    } else {
      // Fallback: split by first space as name, rest as relationship
      name = parts[0];
      relationship = parts.slice(1).join(" ");
    }
  } else if (relationWords.includes(nameRaw)) {
    relationship = nameRaw;
    name = "شخص";
  } else {
    if (category === "أصدقاء") relationship = "صديق";
    else if (category === "موظفين") relationship = "موظف";
    else if (category === "العائلة") relationship = "قريب";
  }

  return { name: name.trim(), relationship: relationship.trim() };
}
