/**
 * Fuzzy matching engine for Egyptian Arabic financial text
 * Uses Levenshtein distance for typo correction
 */

export function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

/** Normalize Arabic text: remove diacritics, normalize alef/ya/ta marbuta */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove tashkeel
    .replace(/[إأآٱ]/g, "ا") // normalize alef
    .replace(/ى/g, "ي") // ya
    .replace(/ة/g, "ه") // ta marbuta → ha
    .replace(/ؤ/g, "و") // waw hamza
    .replace(/ئ/g, "ي") // ya hamza
    .trim();
}

/**
 * Find best matching keyword from dictionary
 * Returns category if match found within threshold, null otherwise
 */
export function fuzzyFindCategory(
  word: string,
  dictionary: Record<string, string>,
  maxDistance: number = 2,
): string | null {
  const normalized = normalizeArabic(word);
  if (normalized.length < 2) return null;

  // Exact match first
  if (dictionary[word]) return dictionary[word];
  if (dictionary[normalized]) return dictionary[normalized];

  let bestMatch: string | null = null;
  let bestDist = maxDistance + 1;

  for (const key of Object.keys(dictionary)) {
    const normKey = normalizeArabic(key);
    // Skip if length difference is too big
    if (Math.abs(normKey.length - normalized.length) > maxDistance) continue;

    const dist = levenshtein(normalized, normKey);
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
  const w = normalizeArabic(wordInText).toLowerCase();
  const k = normalizeArabic(targetKey).toLowerCase();
  if (w === k) return true;

  // Strict matching for short keys (e.g. "وي") to avoid noisy false positives
  if (k.length <= 2) {
    const prefixes = ["و", "ف", "ب", "ل", "ال", "لل"];
    for (const p of prefixes) {
      if (w === p + k) return true;
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

