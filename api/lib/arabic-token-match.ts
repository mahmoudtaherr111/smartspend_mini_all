/**
 * Word-boundary matching for Arabic keyword lookups.
 *
 * Raw `text.includes(needle)` is the single most productive source of silent
 * misclassification in this codebase, because Arabic packs meaning into short roots
 * that sit inside longer, unrelated words:
 *
 *   "وبعدين"  contains "دين"  -> a coffee became a loan
 *   "اتغدينا" contains "دين"  -> lunch became a transfer
 *   "طعام"    contains "عام"  -> food matched the generic subcategory
 *   "أعمل"    contains "عمل"  -> "what do I do?" claimed the work category
 *
 * Prefixes are the reason a naive `split(/\s+/)` is not enough either: Arabic clitics
 * attach directly to the word (ال، و، ب، ل، ف، بال، لل), so "الجمعيه" must still match
 * the needle "جمعيه".
 *
 * The rule implemented here: a single-word needle matches a whole token, after that
 * token has had its clitics peeled. A multi-word needle falls back to substring
 * matching, since a phrase cannot collide by accident.
 */

/** Peels Arabic clitics off a token, returning every form worth testing. */
export function tokenVariants(token: string): string[] {
  const variants = new Set<string>([token]);
  const queue = [token];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const next: string[] = [];
    if (current.startsWith("بال") && current.length > 5) next.push(current.slice(3));
    if (current.startsWith("لل") && current.length > 4) next.push(current.slice(2));
    if (current.startsWith("ال") && current.length > 4) next.push(current.slice(2));
    if (/^[وبفل]/.test(current) && current.length > 3) next.push(current.slice(1));
    if (current.startsWith("بـ") && current.length > 3) next.push(current.slice(2));

    for (const variant of next) {
      if (!variants.has(variant)) {
        variants.add(variant);
        queue.push(variant);
      }
    }
  }
  return [...variants];
}

/** Builds the searchable token set for a text, once, so callers can reuse it. */
export function buildTokenSet(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of String(text || "").split(/[\s،,.؟?!؛;:()]+/)) {
    if (!raw) continue;
    for (const variant of tokenVariants(raw)) tokens.add(variant);
  }
  return tokens;
}

/**
 * True when `needle` occurs in `text` as a word rather than as a fragment.
 * Pass a prebuilt `tokens` set when testing many needles against the same text.
 */
export function matchesWord(text: string, needle: string, tokens?: Set<string>): boolean {
  const n = String(needle || "").trim();
  if (!n) return false;
  // A phrase cannot collide with the inside of a single word.
  if (/\s/.test(n)) return text.includes(n);
  return (tokens ?? buildTokenSet(text)).has(n);
}

/** Returns the first needle that matches as a word, or undefined. */
export function findMatchingWord(
  text: string,
  needles: readonly string[],
  tokens?: Set<string>,
): string | undefined {
  const set = tokens ?? buildTokenSet(text);
  return needles.find((n) => matchesWord(text, n, set));
}
