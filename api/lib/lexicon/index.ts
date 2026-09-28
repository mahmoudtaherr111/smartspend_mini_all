/**
 * The one lexicon: every word, phrase and brand the local engine reads a category from, in
 * the four data files of this folder, with one flat view of all of them for checks and
 * tools. Direction words (paid, received, lent) are not here: they live in
 * `api/lib/intent-detector.ts` and `api/lib/direction-governed-taxonomy.ts`, because a verb
 * says which way money moved, never what it was for.
 *
 * - `dictionary.ts`: single words and short phrases that name a category (`dict_*` layers).
 * - `subcategory-words.ts`: words that name a subcategory (`subcat_*` layers).
 * - `phrases.ts`: everyday phrases with their category and subcategory (`synonym_graph`).
 * - `merchants.ts`: brands, ambiguous names, payment rails and context rules.
 *
 * `lexicon.integrity.test.ts` checks every entry against the taxonomy and across sources.
 */
import { CATEGORY_DICTIONARY } from "./dictionary";
import { MERCHANT_REGISTRY } from "./merchants";
import { SYNONYM_GRAPH } from "./phrases";
import { SUB_CATEGORY_MAP } from "./subcategory-words";

export { CATEGORY_DICTIONARY } from "./dictionary";
export { AMBIGUOUS_MERCHANTS, DISAMBIGUATION_RULES, MERCHANT_REGISTRY, PAYMENT_RAIL_SUBCATEGORIES } from "./merchants";
export { SYNONYM_GRAPH } from "./phrases";
export { SUB_CATEGORY_MAP } from "./subcategory-words";

export type LexiconSource = "dictionary" | "subcategory" | "phrase" | "merchant";

export interface LexiconEntry {
  phrase: string;
  category: string;
  subCategory?: string;
  source: LexiconSource;
}

/** Every entry of every source, flat. */
export function lexiconEntries(): LexiconEntry[] {
  const entries: LexiconEntry[] = [];
  for (const [phrase, category] of Object.entries(CATEGORY_DICTIONARY)) {
    entries.push({ phrase, category, source: "dictionary" });
  }
  for (const [phrase, hit] of Object.entries(SUB_CATEGORY_MAP)) {
    entries.push({ phrase, category: hit.category, subCategory: hit.subCategory, source: "subcategory" });
  }
  for (const [phrase, hit] of Object.entries(SYNONYM_GRAPH)) {
    entries.push({ phrase, category: hit.category, subCategory: hit.subCategory, source: "phrase" });
  }
  for (const [phrase, hit] of Object.entries(MERCHANT_REGISTRY)) {
    entries.push({ phrase, category: hit.category, subCategory: hit.subCategory, source: "merchant" });
  }
  return entries;
}
