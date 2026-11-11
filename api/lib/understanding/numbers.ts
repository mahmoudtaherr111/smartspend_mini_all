/**
 * What the code itself can read in a sentence without understanding it: the numbers that are
 * there, and whether a quoted span is really part of it.
 *
 * This is the guard's independent witness. A model reads «بتلتمية وعشرين» as 320; the
 * existing Arabic number parser reads the same words as 320 with no model involved. When the
 * two agree the amount is the user's; when the model's amount is nowhere in the sentence, it
 * invented it.
 */
import { parseArabicNumbers } from "../arabic-number-parser";

/** Letters folded, marks removed, punctuation dropped, digits Latin: for comparing spans, never for display. */
export function foldForMatch(text: string): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when `quote` is the user's own words: a span of the sentence, or the sentence's words
 * in their order with at most a few dropped or rewritten (a model that writes «ب 320» where
 * the user said «بتلتمية وعشرين» still quoted the user).
 */
export function quoteIsFromText(quote: string, sentence: string): boolean {
  const needle = foldForMatch(quote);
  if (!needle) return false;
  const haystack = foldForMatch(sentence);
  if (haystack.includes(needle)) return true;
  const spoken = foldForMatch(parseArabicNumbers(sentence));
  if (spoken.includes(needle)) return true;

  const words = needle.split(" ").filter((word) => word.length > 1);
  if (words.length < 3) return false;
  const pool = `${haystack} ${spoken}`.split(" ");
  let cursor = 0;
  let found = 0;
  for (const word of words) {
    const at = pool.indexOf(word, cursor);
    if (at >= 0) {
      found++;
      cursor = at + 1;
    }
  }
  return found / words.length >= 0.8;
}

/**
 * Every number in the sentence, spoken or written, as values in reading order.
 *
 * A digit glued to Latin letters is Franco spelling («7awelt», «a7med»), not a number.
 */
export function numberMentions(sentence: string): number[] {
  const digits = parseArabicNumbers(foldDigits(sentence));
  const values: number[] = [];
  for (const match of digits.matchAll(/(?<![A-Za-z\d.])\d+(?:\.\d+)?(?![A-Za-z\d]|\.\d)/g)) {
    const value = Number(match[0]);
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

function foldDigits(text: string): string {
  return String(text ?? "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/(\d)[,،٬](?=\d{3}(?:\D|$))/g, "$1");
}

const CENTS = (value: number) => Math.round(value * 100);
const same = (a: number, b: number) => CENTS(a) === CENTS(b);

export type AmountSource =
  /** The amount is a number of the sentence, at this position in `numberMentions`. */
  | { kind: "stated"; index: number }
  /** The amount follows from numbers of the sentence by one simple step. */
  | { kind: "derived"; how: "sum" | "difference" | "product" | "quotient" | "fraction" | "piastres"; indexes: number[] }
  | { kind: "absent" };

/**
 * Where an amount comes from, given the sentence's numbers and which of them are already
 * taken by other events. A stated number is preferred; a derivation is accepted only from at
 * most three numbers, so an invented amount cannot be explained by a lucky subset of a long
 * sentence.
 */
export function sourceOfAmount(amount: number, mentions: readonly number[], taken: ReadonlySet<number>): AmountSource {
  for (let i = 0; i < mentions.length; i++) {
    if (!taken.has(i) && same(mentions[i], amount)) return { kind: "stated", index: i };
  }
  // The same stated number said once and used twice («اديت كل واحد 50») is a derivation.
  for (let i = 0; i < mentions.length; i++) {
    if (same(mentions[i], amount)) return { kind: "derived", how: "product", indexes: [i] };
  }
  for (let i = 0; i < mentions.length; i++) {
    for (let j = 0; j < mentions.length; j++) {
      if (i === j) continue;
      const [a, b] = [mentions[i], mentions[j]];
      if (i < j && same(a + b, amount)) return { kind: "derived", how: "sum", indexes: [i, j] };
      if (same(a - b, amount)) return { kind: "derived", how: "difference", indexes: [i, j] };
      if (i < j && same(a * b, amount)) return { kind: "derived", how: "product", indexes: [i, j] };
      if (b !== 0 && same(a / b, amount)) return { kind: "derived", how: "quotient", indexes: [i, j] };
      for (let k = j + 1; k < mentions.length; k++) {
        if (i < j && same(a + b + mentions[k], amount)) return { kind: "derived", how: "sum", indexes: [i, j, k] };
      }
    }
  }
  // One number and a spoken part of it: piastres, a half, a quarter.
  for (let i = 0; i < mentions.length; i++) {
    const value = mentions[i];
    if (same(value / 100, amount)) return { kind: "derived", how: "piastres", indexes: [i] };
    for (const part of [0.5, 0.25, 0.75, 1 / 3]) {
      if (same(value * part, amount)) return { kind: "derived", how: "fraction", indexes: [i] };
    }
  }
  return { kind: "absent" };
}
