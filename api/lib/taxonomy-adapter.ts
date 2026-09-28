import {
  CATEGORIES,
  comparableArabic,
  normalizeCategoryName,
  normalizeSubCategoryName,
} from "./category-registry";
import { buildTokenSet, matchesWord } from "./arabic-token-match";
import { SYNONYM_GRAPH } from "./lexicon/phrases";

export interface TaxonomyMatch {
  category: string;
  subCategory: string;
  confidence: number;
  inferenceSource: "synonym" | "rule" | "dictionary";
  ambiguityFlags?: string[];
}

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

  // Whole words only: "واخيرا" must not match "اخي", nor "ياميش" match "امي".
  const tokens = buildTokenSet(comparable);
  let best: TaxonomyMatch | null = null;
  for (const [phrase, entry] of Object.entries(SYNONYM_GRAPH)) {
    if (!matchesWord(comparable, comparableArabic(phrase), tokens)) continue;
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
