/**
 * Fuzzy matching engine for Egyptian Arabic financial text
 * Uses Damerau-Levenshtein distance (C-optimized) for typo correction.
 *
 * Damerau-Levenshtein improves on plain Levenshtein by also counting
 * transpositions (swapped adjacent characters), which are extremely
 * common in Arabic typing errors (e.g. "كهربا" ↔ "كهراب" = distance 1
 * with Damerau vs 2 with plain Levenshtein).
 */

import damerauPkg from "damerau-levenshtein";
const damerauLevenshtein = (a: string, b: string): number => {
  const result = (damerauPkg as any)(a, b);
  return typeof result === "number" ? result : result.steps;
};

/**
 * Damerau-Levenshtein distance between two strings.
 * Re-exports the C-optimized implementation from the `damerau-levenshtein` package
 * so the rest of the codebase can import it from a single source of truth.
 */
export function levenshtein(a: string, b: string): number {
  return damerauLevenshtein(a, b);
}

import { normalizeArabic } from "./unified-normalizer";

// Re-export for backward compatibility — many files import normalizeArabic from fuzzy-match
export { normalizeArabic };

/**
 * Find best matching keyword from dictionary using Damerau-Levenshtein.
 * Returns category if match found within threshold, null otherwise.
 *
 * Performance: O(n) where n = dictionary size. For ~1000 entries this
 * takes < 1ms. The C-optimized damerau-levenshtein is ~10x faster
 * than the previous hand-rolled JavaScript implementation.
 */
export function fuzzyFindCategory(
  word: string,
  dictionary: Record<string, string>,
  maxDistance: number = 2,
): string | null {
  const normalized = normalizeArabic(word).toLowerCase();
  if (normalized.length < 2) return null;

  // Exact match first
  if (dictionary[word]) return dictionary[word];
  if (dictionary[normalized]) return dictionary[normalized];

  let bestMatch: string | null = null;
  let bestDist = maxDistance + 1;

  for (const key of Object.keys(dictionary)) {
    const normKey = normalizeArabic(key).toLowerCase();
    // Skip if length difference is too big
    if (Math.abs(normKey.length - normalized.length) > maxDistance) continue;

    const dist = damerauLevenshtein(normalized, normKey);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = dictionary[key];
    }
  }

  return bestDist <= maxDistance ? bestMatch : null;
}

/**
 * Checks if a single word in a text matches a target key, supporting standard
 * Arabic prefixes (ال, لل, و, ف, ب, ل, ك) and suffixes (ه, ة, ات, ين, ون, ي, نا).
 * Very strict matching is applied for short keys (length <= 2) to avoid false positives.
 */
export function isArabicWordMatch(
  wordInText: string,
  targetKey: string,
): boolean {
  // Strip leading/trailing non-Arabic, non-Latin punctuation so that
  // parenthesized / bracketed relationship tokens such as "(أختي)" or
  // "أختي)" still match the bare token "أختي". This is critical for
  // extracting inline relationship context from user input like
  // "دفعت لفريدة 200 (أختي)".
  const stripPunct = (s: string) =>
    s.replace(/^[^\u0600-\u06FFa-zA-Z]+|[^\u0600-\u06FFa-zA-Z]+$/g, "");
  const w = stripPunct(normalizeArabic(wordInText).toLowerCase());
  const k = stripPunct(normalizeArabic(targetKey).toLowerCase());
  if (!k || !w) return false;
  if (w === k) return true;

  // Strict matching for short keys (e.g. "اخ", "اب", "ام") with safe possessive pronoun suffixes
  // We strictly exclude plural formatives (ين, ون, ة, ات) to prevent short names like "امين" matching "ام"
  if (k.length <= 2) {
    const prefixes = ["", "و", "ف", "ب", "ل", "ال", "لل"];
    const safePossessives = ["", "ي", "يا", "ويا", "ه", "ها", "ك", "نا", "ونا", "كم", "هم", "وه", "وها", "وك", "وكم", "وهم"];
    for (const p of prefixes) {
      for (const s of safePossessives) {
        if (w === p + k + s) return true;
      }
    }
    return false;
  }

  // Flexible prefix/suffix matching for longer terms
  const escapedKey = k.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const pattern = new RegExp(
    `^(?:و|ف|ب|ل|ك|ال|لل|وال|بال|فال|كال|ول)?${escapedKey}(?:ه|ة|ات|ين|ون|ي|نا|كم|هم)?$`,
    "i",
  );
  return pattern.test(w);
}

/**
 * Checks if a phrase (single or multi-word) is present in a text using
 * word-boundary aware matches (via isArabicWordMatch).
 */
export function matchArabicPhrase(text: string, phrase: string): boolean {
  const normText = normalizeArabic(text).toLowerCase();
  const normPhrase = normalizeArabic(phrase).toLowerCase();

  if (normText === normPhrase) return true;

  const textWords = normText.split(/\s+/).filter(Boolean);
  const phraseWords = normPhrase.split(/\s+/).filter(Boolean);

  if (phraseWords.length === 0) return false;
  if (textWords.length < phraseWords.length) return false;

  for (let i = 0; i <= textWords.length - phraseWords.length; i++) {
    let match = true;
    for (let j = 0; j < phraseWords.length; j++) {
      if (!isArabicWordMatch(textWords[i + j], phraseWords[j])) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }

  return false;
}

/**
 * Strips common Arabic prefixes (و, ف, ب, ل, ال, لل, وال, بال, فال)
 * from a word if the remaining length is at least 3 characters.
 */
export function stripArabicPrefix(word: string): string {
  const normalized = normalizeArabic(word).toLowerCase();
  const prefixesRegex = /^(?:وال|بال|فال|لل|ال|ب|و|ف|ل)(?=[^\s]{3,})/i;
  return normalized.replace(prefixesRegex, "");
}
