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
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

/** Normalize Arabic text: remove diacritics, normalize alef/ya/ta marbuta */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove tashkeel
    .replace(/[إأآٱ]/g, "ا")              // normalize alef
    .replace(/ى/g, "ي")                    // ya
    .replace(/ة/g, "ه")                    // ta marbuta → ha
    .replace(/ؤ/g, "و")                    // waw hamza
    .replace(/ئ/g, "ي")                    // ya hamza
    .trim();
}

/**
 * Find best matching keyword from dictionary
 * Returns category if match found within threshold, null otherwise
 */
export function fuzzyFindCategory(
  word: string,
  dictionary: Record<string, string>,
  maxDistance: number = 2
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
