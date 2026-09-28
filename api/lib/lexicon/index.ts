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
import { MERCHANT_CATALOG } from "./merchant-catalog";
import { MERCHANT_REGISTRY } from "./merchants";
import { stripArabicPrefix } from "../fuzzy-match";
import { normalizeArabic } from "../unified-normalizer";
import { SYNONYM_GRAPH } from "./phrases";
import { SUB_CATEGORY_MAP } from "./subcategory-words";

export { CATEGORY_DICTIONARY } from "./dictionary";
export { AMBIGUOUS_MERCHANTS, DISAMBIGUATION_RULES, MERCHANT_REGISTRY, PAYMENT_RAIL_SUBCATEGORIES } from "./merchants";
export { MERCHANT_CATALOG } from "./merchant-catalog";
export { SYNONYM_GRAPH } from "./phrases";
export { SUB_CATEGORY_MAP } from "./subcategory-words";

export type LexiconSource = "dictionary" | "subcategory" | "phrase" | "merchant" | "catalog";

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
  for (const store of MERCHANT_CATALOG) {
    for (const phrase of store.keywords) {
      entries.push({ phrase, category: store.category, subCategory: store.subCategory, source: "catalog" });
    }
  }
  return entries;
}

export interface CatalogHit {
  merchant: string;
  category: string;
  subCategory: string;
}

const token = (word: string): string =>
  normalizeArabic(word).toLowerCase().replace(/^[^\u0600-\u06FFa-z0-9]+|[^\u0600-\u06FFa-z0-9+&']+$/g, "");

/** Catalog keywords by first word, longest first, so a text is scanned once per token. */
const CATALOG_INDEX: Map<string, Array<{ words: string[]; hit: CatalogHit }>> = (() => {
  const index = new Map<string, Array<{ words: string[]; hit: CatalogHit }>>();
  for (const store of MERCHANT_CATALOG) {
    for (const keyword of store.keywords) {
      const words = keyword.split(/\s+/).map(token).filter(Boolean);
      if (!words.length) continue;
      const list = index.get(words[0]) ?? [];
      list.push({ words, hit: { merchant: store.merchant, category: store.category, subCategory: store.subCategory } });
      index.set(words[0], list);
    }
  }
  for (const list of index.values()) list.sort((a, b) => b.words.length - a.words.length);
  return index;
})();

/**
 * The first catalog store named in the text, matched on whole words (a leading و/ب/ل/ال is
 * allowed), longest name first.
 */
export function findCatalogMerchant(text: string): CatalogHit | null {
  const words = String(text || "").split(/\s+/).map(token).filter(Boolean);
  const same = (a: string, b: string) => a === b || stripArabicPrefix(a) === b;
  for (let i = 0; i < words.length; i++) {
    const candidates = [words[i], stripArabicPrefix(words[i])];
    for (const first of new Set(candidates)) {
      for (const entry of CATALOG_INDEX.get(first) ?? []) {
        if (entry.words.every((w, j) => (j === 0 ? true : words[i + j] !== undefined && same(words[i + j], w)))) {
          return entry.hit;
        }
      }
    }
  }
  return null;
}
