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
