/**
 * SmartSpend Category Taxonomy — derived view.
 *
 * This file used to hold a second, hand-written 15-category taxonomy that called
 * itself the Single Source of Truth. It was not: `category-registry.ts` is what
 * drives storage, classification, analytics and the UI, and it has 26 categories.
 *
 * Worse, five of the ids declared here (housing, personal_care, charity,
 * debt_payment, other) exist in NO other module. Its only consumer,
 * `api/services/ai-kernel/intent-router.ts`, emits those ids into
 * `intent.slots.category`, where `category-matcher.getCategoryAliases()` resolved
 * them to an empty alias list — so AI-Center questions about سكن / عناية شخصية /
 * تبرعات / سداد ديون / أخرى silently matched no rows at all.
 *
 * The shape below is kept so `intent-router.ts` needs no change, but every value is
 * now derived from the registry. Its richer Egyptian aliases were migrated into
 * `EXTRA_ALIASES_TO_ID` in category-registry.ts, so nothing was lost and the whole
 * system gained them rather than just the AI kernel.
 */
import {
  CATEGORIES as REGISTRY_CATEGORIES,
  getCategoryAliasesById,
} from "./category-registry";

export interface TaxonomyCategory {
  /** Stable registry id, e.g. 'food'. */
  id: string;
  labelAr: string;
  labelEn: string;
  type: "expense" | "income" | "transfer" | "investment";
  /** Egyptian Arabic and English synonyms used for intent matching. */
  aliases: string[];
}

export const TAXONOMY_VERSION = 2;

export const CATEGORIES: TaxonomyCategory[] = REGISTRY_CATEGORIES.map((c) => ({
  id: c.id,
  labelAr: c.name_ar,
  labelEn: c.name,
  type: c.type as TaxonomyCategory["type"],
  aliases: getCategoryAliasesById(c.id),
}));

export function getTaxonomyCategory(id: string): TaxonomyCategory | undefined {
  return CATEGORIES.find((c) => c.id === id);
}
