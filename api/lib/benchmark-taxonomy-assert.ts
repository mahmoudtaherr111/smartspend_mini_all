/**
 * Legal-pair validator built from the authoritative registry.
 *
 * A (category, subCategory) pair is legal when the category exists in CATEGORIES
 * and the subcategory is one of its declared subcategories — with one deliberate
 * exemption: for العائلة / أصدقاء / موظفين the subcategory carries a PERSON NAME
 * (category-registry.ts:893 returns the raw subcategory verbatim, and
 * expense-router.ts:238-246 parses it back into a contact). Any non-empty string
 * is legal there.
 *
 * Used by the benchmark fixtures (so a fixture can never assert a category the app
 * cannot store) and by the scorer (taxonomyViolationRate is a hard gate at zero).
 */
import { CATEGORIES, comparableArabic } from "./category-registry";

/** Categories whose sub_category slot holds a person label, not a taxonomy leaf. */
export const PERSON_LABEL_CATEGORIES = new Set(["العائلة", "أصدقاء", "موظفين"]);

const CATEGORY_BY_COMPARABLE = new Map(
  CATEGORIES.map((c) => [comparableArabic(c.name_ar), c]),
);

export function isKnownCategory(categoryNameAr: string): boolean {
  return CATEGORY_BY_COMPARABLE.has(comparableArabic(categoryNameAr || ""));
}

export interface TaxonomyPairResult {
  legal: boolean;
  /** Present when illegal — a human-readable reason for the report. */
  reason?: string;
}

export function checkTaxonomyPair(
  categoryNameAr: string,
  subCategoryNameAr: string | null | undefined,
): TaxonomyPairResult {
  const category = CATEGORY_BY_COMPARABLE.get(comparableArabic(categoryNameAr || ""));
  if (!category) {
    return { legal: false, reason: `فئة غير موجودة في السجل: "${categoryNameAr}"` };
  }

  const sub = String(subCategoryNameAr || "").trim();
  if (!sub) {
    // An absent subcategory is legal; normalizeSubCategoryName defaults to "عام".
    return { legal: true };
  }

  if (PERSON_LABEL_CATEGORIES.has(category.name_ar)) {
    // Person-name smuggling: any non-empty label is legal here by design.
    return { legal: true };
  }

  const subComparable = comparableArabic(sub);
  const match = category.subcategories.some(
    (s) => comparableArabic(s.name_ar) === subComparable,
  );
  if (match) return { legal: true };

  // "عام" is the universal default even where a category does not declare it.
  if (subComparable === comparableArabic("عام")) return { legal: true };

  return {
    legal: false,
    reason: `فرعية "${sub}" غير موجودة تحت "${category.name_ar}"`,
  };
}

export function isLegalTaxonomyPair(
  categoryNameAr: string,
  subCategoryNameAr?: string | null,
): boolean {
  return checkTaxonomyPair(categoryNameAr, subCategoryNameAr).legal;
}
