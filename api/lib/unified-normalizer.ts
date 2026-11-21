/**
 * Unified Arabic Normalizer — Single Source of Truth
 * ════════════════════════════════════════════════════
 * Replaces 6 duplicate normalizeArabic functions scattered across:
 *  - fuzzy-match.ts
 *  - intent-detector.ts
 *  - local-rag-engine.ts
 *  - smart-pipeline.ts
 *  - narrative-decomposer.ts
 *  - post-classifier-verifier.ts
 *
 * Three variants for different use cases:
 *  1. normalizeArabic()        — standard: tashkeel + alef + ya + ta + hamza
 *  2. normalizeArabicCompact() — same + removes all whitespace (for fast comparison)
 *  3. normalizeArabicEgyptian() — same + ث→س, ذ→ز, ظ→ز, tatweel removal (for RAG/search)
 *  4. expandArabicSearchVariants() — expands (ا/أ/إ/آ, ه/ة, ي/ى) variants for database search
 */

/** Standard Arabic normalization (tashkeel, alef, ya, ta marbuta, hamza) */
export function normalizeArabic(text: string): string {
  return String(text || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .trim();
}

/** Compact: same as normalizeArabic + removes ALL whitespace (for hash/compare) */
export function normalizeArabicCompact(text: string): string {
  return normalizeArabic(text)
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Egyptian: same as normalizeArabic + phonetic substitutions + tatweel + collapse whitespace */
export function normalizeArabicEgyptian(text: string): string {
  return normalizeArabic(text)
    .replace(/ـ/g, "")
    .replace(/ث/g, "س")
    .replace(/ذ/g, "ز")
    .replace(/ظ/g, "ز")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Expands a search query into Arabic letter variants (ا/أ/إ/آ, ه/ة, ي/ى)
 * so queries match regardless of spelling variations in names or notes (REC-11).
 */
export function expandArabicSearchVariants(query: string, maxVariants = 8): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [query];

  const charGroups: Record<string, string[]> = {
    "ا": ["ا", "أ", "إ", "آ"],
    "أ": ["ا", "أ", "إ", "آ"],
    "إ": ["ا", "أ", "إ", "آ"],
    "آ": ["ا", "أ", "إ", "آ"],
    "ه": ["ه", "ة"],
    "ة": ["ه", "ة"],
    "ي": ["ي", "ى"],
    "ى": ["ي", "ى"],
  };

  const results = new Set<string>();
  results.add(trimmed);
  results.add(normalizeArabic(trimmed));

  let currentList = [trimmed];
  for (let i = 0; i < trimmed.length && results.size < maxVariants; i++) {
    const char = trimmed[i];
    const group = charGroups[char];
    if (group) {
      const nextList: string[] = [];
      for (const item of currentList) {
        for (const replacement of group) {
          const variant = item.slice(0, i) + replacement + item.slice(i + 1);
          results.add(variant);
          nextList.push(variant);
          if (results.size >= maxVariants) break;
        }
        if (results.size >= maxVariants) break;
      }
      currentList = nextList;
    }
  }

  return Array.from(results);
}
