/**
 * SmartSpend Relationship Normalizer
 * Normalizes Egyptian Arabic colloquial relationship terms into standard terminology
 * and generates appropriate suffixes for categorization.
 */

import { comparableArabic } from "./category-registry";
import { EGYPTIAN_MALE_NAMES, EGYPTIAN_FEMALE_NAMES } from "./egyptian-names-dictionary";

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
  صحبتي: "صديقة",
  صحبه: "صديقة",
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
      category: "تحويلات",   // FIX: neutral fallback — not "العائلة" to avoid wrong classification
      subCategory: "تحويلات شخصية",
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

  // Fallback: If it's a multi-word phrase (e.g., "مساعد صاحبي"), try to find any known relationship word inside it
  if (!normalized) {
    const words = rawRelation.trim().split(/\s+/);
    for (const w of words) {
      const wClean = w.replace(/^[بلكف]/, "");
      let match = RELATIONSHIP_MAP[comparableArabic(wClean)] || RELATIONSHIP_MAP[comparableArabic(w)];
      if (match) {
        normalized = match;
        break;
      }
    }
  }

  // If still not found, return the raw relation
  if (!normalized) {
    normalized = rawRelation.trim();
  }

  // FIX: Determine category safely — default to "تحويلات" (neutral) not "العائلة"
  // Only assign "العائلة" for explicitly known family relationships
  const FAMILY_RELATIONS = new Set([
    "أخ", "أخت", "أب", "أم", "ابن", "ابنة",
    "عم", "عمة", "خال", "خالة", "جد", "جدة",
    "زوج", "زوجة", "خطيب", "خطيبة", "قريب",
  ]);
  const FRIEND_RELATIONS = new Set(["صديق", "صديقة", "زميل", "زميلة", "جار", "جارة"]);
  const WORK_RELATIONS = new Set(["مدير", "عامل", "حارس", "سائق", "موظف"]);

  let category = "تحويلات"; // FIX: safe neutral default
  if (FAMILY_RELATIONS.has(normalized)) {
    category = "العائلة";
  } else if (FRIEND_RELATIONS.has(normalized)) {
    category = "أصدقاء";
  } else if (WORK_RELATIONS.has(normalized)) {
    category = "موظفين";
  }

  return {
    normalized,
    category,
    subCategory: (normalized === "شخص معروف" || category === "تحويلات") ? "تحويلات شخصية" : normalized,
  };
}

/**
 * Gets the proper suffix for displaying a relationship (e.g., "صديق" -> "صاحبك")
 */
export function getRelationshipSuffix(normalizedRelation: string, personName?: string): string {
  let relation = normalizedRelation;
  
  if (personName) {
    const cleanName = comparableArabic(personName.trim());
    const isMale = EGYPTIAN_MALE_NAMES.has(cleanName);
    const isFemale = EGYPTIAN_FEMALE_NAMES.has(cleanName);
    
    if (isMale && !isFemale) {
      if (relation === "صديقة") relation = "صديق";
      if (relation === "زميلة") relation = "زميل";
      if (relation === "أخت") relation = "أخ";
      if (relation === "عمة") relation = "عم";
      if (relation === "خالة") relation = "خال";
    } else if (isFemale && !isMale) {
      if (relation === "صديق") relation = "صديقة";
      if (relation === "زميل") relation = "زميلة";
      if (relation === "أخ") relation = "أخت";
      if (relation === "عم") relation = "عمة";
      if (relation === "خال") relation = "خالة";
    }
  }

  return SUFFIX_MAP[relation] || relation;
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
