import { normalizeRelationship, getRelationshipSuffix } from "./relationship-normalizer";
import { matchArabicPhrase, normalizeArabic } from "./fuzzy-match";

export interface KnownPersonForResolver {
  name: string;
  relationship?: string;
  category?: string;
  subCategory?: string;
}

export interface PersonResolution {
  name: string | null;
  relationship: string | null;
  category: string | null;
  subCategory: string | null;
  isKnown: boolean;
  shouldLearn: boolean;
  needsClarification: boolean;
  clarificationQuestion?: string;
}

const PERSON_CATEGORIES = new Set(["العائلة", "أصدقاء", "موظفين"]);

const NON_PERSON_TERMS = new Set([
  "السباك",
  "سباك",
  "السايس",
  "سايس",
  "السواق",
  "سواق",
  "السائق",
  "البواب",
  "بواب",
  "الكهربائي",
  "كهربائي",
  "النقاش",
  "نقاش",
  "النجار",
  "نجار",
  "الدكتور",
  "دكتور",
  "الصيدلية",
  "صيدلية",
  "المطعم",
  "مطعم",
  "السوبر",
  "ماركت",
  "فلوس",
  "جنيه",
  "الف",
  "ألف",
  "نت",
  "النت",
  "كهربا",
  "الكهربا",
  "كهرباء",
  "الكهرباء",
  "مياه",
  "المياه",
  "ميه",
  "المية",
  "غاز",
  "الغاز",
  "به",
  "بي",
  "في",
  "على",
  "علي",
]);

const RELATION_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "أخ", aliases: ["اخويا", "أخويا", "اخوي", "اخو", "اخ", "أخ"] },
  { canonical: "أخت", aliases: ["اختي", "أختي", "اخت", "أخت"] },
  { canonical: "أب", aliases: ["ابويا", "أبويا", "بابا", "والدي", "اب"] },
  { canonical: "أم", aliases: ["امي", "أمي", "ماما", "والدتي", "ام"] },
  { canonical: "ابن", aliases: ["ابني", "ابن", "ولدي"] },
  { canonical: "ابنة", aliases: ["بنتي", "بنت"] },
  { canonical: "زوج", aliases: ["جوزي", "زوجي", "جوز"] },
  { canonical: "زوجة", aliases: ["مراتي", "زوجتي", "مرات"] },
  { canonical: "صديق", aliases: ["صاحبي", "صديقي", "صاحب", "صديق"] },
  { canonical: "صديقة", aliases: ["صاحبتي", "صحبتي", "صديقتي", "صاحبة", "صديقة"] },
  { canonical: "زميل", aliases: ["زميلي", "زميل"] },
  { canonical: "زميلة", aliases: ["زميلتي", "زميلة"] },
  { canonical: "مدير", aliases: ["مديري", "المدير", "مدير"] },
  { canonical: "موظف", aliases: ["موظف عندي", "موظفي", "موظف", "عامل عندي", "عامل"] },
  { canonical: "حارس", aliases: ["البواب", "بواب", "حارس"] },
  { canonical: "سائق", aliases: ["السواق", "سواق", "السائق", "سائق"] },
  { canonical: "قريب", aliases: ["قريبي", "قريب", "قريبتي", "قرايبي"] },
];

function compactArabic(value: string): string {
  return normalizeArabic(String(value || ""))
    .replace(/[^\u0600-\u06FFa-zA-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function cleanPersonName(value: string | null | undefined): string | null {
  const cleaned = compactArabic(String(value || ""))
    .replace(/^(?:ل|لل|الى|إلى)\s*/u, "")
    .replace(/^ل(?=[\u0600-\u06FF]{2,}$)/u, "")
    .trim();

  if (!cleaned || cleaned.length < 2) return null;
  if (/^\d+$/.test(cleaned)) return null;
  if (NON_PERSON_TERMS.has(cleaned)) return null;
  return cleaned;
}

function contextAroundName(text: string, name: string): string {
  const normalizedText = compactArabic(text);
  const normalizedName = compactArabic(name);
  const index = normalizedText.indexOf(normalizedName);
  const clarificationIndex = normalizedText.indexOf("التوضيح");
  const clarificationTail =
    clarificationIndex >= 0 ? normalizedText.slice(clarificationIndex) : "";
  if (index < 0) return `${normalizedText} ${clarificationTail}`.trim();
  return `${normalizedText.slice(Math.max(0, index - 45), index + normalizedName.length + 45)} ${clarificationTail}`.trim();
}

export function inferRelationshipFromText(text: string, name?: string | null): string | null {
  const target = name ? contextAroundName(text, name) : compactArabic(text);

  for (const entry of RELATION_ALIASES) {
    for (const alias of entry.aliases) {
      if (target.includes(compactArabic(alias))) {
        return entry.canonical;
      }
    }
  }

  return null;
}

function findKnownPerson(
  name: string,
  knownPeople: KnownPersonForResolver[],
): KnownPersonForResolver | null {
  for (const person of knownPeople) {
    if (!person?.name) continue;
    if (matchArabicPhrase(name, person.name) || matchArabicPhrase(person.name, name)) {
      return person;
    }

    const first = person.name.split(/\s+/)[0];
    if (first && first.length >= 2 && matchArabicPhrase(name, first)) {
      return person;
    }
  }

  return null;
}

export function buildPersonSubCategory(name: string, relationship: string): string {
  const normalized = normalizeRelationship(relationship);
  const suffix = getRelationshipSuffix(normalized.normalized) || relationship;
  return `${name} ${suffix}`.trim();
}

export function resolvePersonForTransaction(input: {
  candidateName?: string | null;
  transactionText: string;
  originalText: string;
  knownPeople: KnownPersonForResolver[];
}): PersonResolution {
  const name = cleanPersonName(input.candidateName);
  if (!name) {
    return {
      name: null,
      relationship: null,
      category: null,
      subCategory: null,
      isKnown: false,
      shouldLearn: false,
      needsClarification: false,
    };
  }

  const known = findKnownPerson(name, input.knownPeople);
  const explicitRelationship =
    inferRelationshipFromText(input.transactionText, name) ||
    inferRelationshipFromText(input.originalText, name);

  if (known) {
    const relationship =
      known.relationship || explicitRelationship || known.subCategory || "شخص معروف";
    const normalized = normalizeRelationship(relationship);
    const category = PERSON_CATEGORIES.has(known.category || "")
      ? known.category!
      : normalized.category;
    const subCategory =
      known.subCategory && known.subCategory.includes(known.name)
        ? known.subCategory
        : buildPersonSubCategory(known.name, relationship);

    return {
      name: known.name,
      relationship,
      category,
      subCategory,
      isKnown: true,
      shouldLearn: false,
      needsClarification: false,
    };
  }

  if (explicitRelationship) {
    const normalized = normalizeRelationship(explicitRelationship);
    return {
      name,
      relationship: normalized.normalized,
      category: normalized.category,
      subCategory: buildPersonSubCategory(name, normalized.normalized),
      isKnown: false,
      shouldLearn: true,
      needsClarification: false,
    };
  }

  return {
    name,
    relationship: null,
    category: null,
    subCategory: null,
    isKnown: false,
    shouldLearn: false,
    needsClarification: true,
    clarificationQuestion: `مين ${name}؟ (أخوك، صديقك، موظف عندك...)`,
  };
}
