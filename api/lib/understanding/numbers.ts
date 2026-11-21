/**
 * What the code itself can read in a sentence without understanding it: the numbers that are
 * there, and whether a quoted span is really part of it.
 *
 * This is the guard's independent witness. A model reads «بتلتمية وعشرين» as 320; the
 * existing Arabic number parser reads the same words as 320 with no model involved. When the
 * two agree the amount is the user's; when the model's amount is nowhere in the sentence, it
 * invented it.
 */
import { arabicIndicToAscii, multiplierMap, parseArabicNumbers, parseNumericLiteral } from "../arabic-number-parser";

// Keep an entire decimal together. A rejected Latin token like "3.5kg" must not
// be retried at its last digit or read from just the part before the decimal.
const NUMBER_START = String.raw`(?<![\p{Script=Latin}\d_.]|\d[,٫٬])`;
const NUMBER_BODY = String.raw`(\d+(?:[.,٫٬]\d+)*)`;
const NUMBER_END = String.raw`(?![\p{Script=Latin}\d_]|[.,٫٬]\d)`;
const NUMBER_TOKEN = new RegExp(`${NUMBER_START}${NUMBER_BODY}${NUMBER_END}`, "gu");
const WRITTEN_AMOUNT = new RegExp(String.raw`${NUMBER_START}${NUMBER_BODY}(?:\s*([kK]))?${NUMBER_END}`, "gu");

/** Spelled and written numbers in one form for scanning the sentence and its quotes. */
export function normalizeNumbersForMatching(text: string): string {
  const digits = arabicIndicToAscii(text)
    .replace(/(?<![\d.,٫٬])\d{1,3}(?:،\d{3})+(?!\d)/g, (groups) => groups.replace(/،/g, ","));
  const written = digits.replace(WRITTEN_AMOUNT, (whole, literal: string, kilo: string | undefined, offset: number) => {
    const value = parseNumericLiteral(literal);
    if (!Number.isFinite(value)) return whole;
    if (kilo) return String(Math.round(value * 100_000) / 100);
    // Let the spoken parser compose an attached scale like "٢٫٥ألف" as it would "٢٫٥ ألف".
    const suffix = /^[\u0621-\u064A]+/.exec(digits.slice(offset + whole.length))?.[0];
    return suffix && Object.hasOwn(multiplierMap, suffix) ? `${value} ` : String(value);
  });
  return parseArabicNumbers(written);
}

/** Letters folded, marks removed, punctuation dropped, digits Latin: for comparing spans, never for display. */
export function foldForMatch(text: string): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[٠-٩۰-۹]/g, arabicIndicToAscii)
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
  const spoken = foldForMatch(normalizeNumbersForMatching(sentence));
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
  return numberMentionSpans(normalizeNumbersForMatching(sentence)).map((mention) => mention.value);
}

/** Start and end are offsets into the output of normalizeNumbersForMatching. */
export function numberMentionSpans(normalizedText: string): Array<{ value: number; start: number; end: number }> {
  const mentions: Array<{ value: number; start: number; end: number }> = [];
  for (const match of normalizedText.matchAll(NUMBER_TOKEN)) {
    const value = parseNumericLiteral(match[0]);
    if (Number.isFinite(value)) mentions.push({ value, start: match.index, end: match.index + match[0].length });
  }
  return mentions;
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
