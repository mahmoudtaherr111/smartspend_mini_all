/**
 * Checks the numbers the assistant actually said (its transcribed speech) against the call's facts.
 *
 * A number that is money (said with "جنيه", or 20 and above and not a count, a day or a year) and matches no fact,
 * no rounding of one, and nothing the user said, is a mismatch. When the latest tool answer holds a fact it was
 * plainly meant to be, the model gets a correction note at once and says the right number; otherwise the
 * mismatch is only recorded, because a correction without a known truth would be a guess of our own.
 */
import { parseArabicNumbers } from "../../../lib/arabic-number-parser";
import type { CallFact, FactLedger } from "./facts";

export interface SpokenNumber {
  value: number;
  approximate: boolean;
  money: boolean;
}

const APPROXIMATE_BEFORE = /(حوالي|حوالى|تقريبا|تقريباً|يعني|أكتر من|اكتر من|أقل من|اقل من|قرب|يجي|ييجي|في حدود)\s*$/;
const CURRENCY_AFTER = /^\s*(جنيه|جنيهات|ج\.?م|ج(?=\s|$)|pound)/;
const COUNT_AFTER = /^\s*(يوم|أيام|ايام|مرة|مرات|عملية|عمليات|شهر|شهور|اشهر|أشهر|سنة|سنين|دقيقة|دقايق|دقائق|ساعة|ساعات|في المية|في المائة|%|حاجة|حاجات|بند|بنود|نفر)/;
const DATE_BEFORE = /(يوم|الساعة|سنة|عام|شهر)\s*$/;

/** The numbers in a stretch of speech, with what surrounds each one. */
export function extractSpokenNumbers(text: string): Array<SpokenNumber & { settled: boolean; index: number }> {
  const parsed = parseArabicNumbers(text);
  const out: Array<SpokenNumber & { settled: boolean; index: number }> = [];
  const pattern = /\d+(?:\.\d+)?/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(parsed))) {
    const value = Number(match[0]);
    const before = parsed.slice(0, match.index);
    const after = parsed.slice(match.index + match[0].length);
    const currency = CURRENCY_AFTER.test(after);
    const isYear = value >= 1900 && value <= 2100 && Number.isInteger(value) && !currency;
    const money = currency || (value >= 20 && !COUNT_AFTER.test(after) && !DATE_BEFORE.test(before) && !isYear);
    // A number is settled once two more words follow it: "تلتمية و" may still become "تلتمية وعشرين".
    const followingWords = after.trim().split(/\s+/).filter((word) => word && !/^\d/.test(word));
    out.push({
      value,
      approximate: APPROXIMATE_BEFORE.test(before),
      money,
      settled: followingWords.length >= 2,
      index: index++,
    });
  }
  return out;
}

export interface Mismatch {
  spoken: number;
  /** The fact it was most likely meant to be, when there is one. */
  intended: CallFact | null;
}

export class SpokenNumberValidator {
  private turnText = "";
  private checkedInTurn = 0;
  private correctionsThisTurn = 0;
  private corrections = 0;

  constructor(private readonly ledger: FactLedger, private readonly maxCorrections = 3) {}

  /** The user's words: numbers they said may be repeated back. */
  noteUserWords(text: string): void {
    for (const number of extractSpokenNumbers(text)) this.ledger.noteUserValue(number.value);
  }

  /** Adds a chunk of the assistant's speech; returns a mismatch found in what is now settled. */
  addAssistantWords(chunk: string): Mismatch | null {
    this.turnText += chunk;
    return this.check(false);
  }

  /** The assistant finished its turn: everything said is settled. */
  endTurn(): Mismatch | null {
    const mismatch = this.check(true);
    this.turnText = "";
    this.checkedInTurn = 0;
    this.correctionsThisTurn = 0;
    return mismatch;
  }

  /** Whether a mismatch should interrupt the model with a correction (at most one a turn, three a call). */
  shouldCorrect(mismatch: Mismatch): boolean {
    if (!mismatch.intended || this.correctionsThisTurn >= 1 || this.corrections >= this.maxCorrections) return false;
    this.correctionsThisTurn += 1;
    this.corrections += 1;
    return true;
  }

  private check(final: boolean): Mismatch | null {
    const numbers = extractSpokenNumbers(this.turnText);
    let found: Mismatch | null = null;
    for (const number of numbers) {
      if (number.index < this.checkedInTurn) continue;
      if (!final && !number.settled) break;
      this.checkedInTurn = number.index + 1;
      if (!number.money || this.ledger.allows(number.value, number.approximate)) continue;
      found ??= { spoken: number.value, intended: this.intendedFact(number.value) };
    }
    return found;
  }

  /**
   * The fact from the latest answer that was plainly meant: the same size and at most double what was said (a slipped
   * digit, "خمسمية وعشرين" for 320), or its teen/tens twin ("خمستاشر" for "خمسين", 1,500 for 5,000). Anything
   * further is recorded but not corrected, because a correction toward the wrong fact turns a right number wrong.
   */
  private intendedFact(spoken: number): CallFact | null {
    let best: CallFact | null = null;
    let bestRatio = Infinity;
    for (const fact of this.ledger.latestBatch()) {
      if (fact.value <= 0) continue;
      const ratio = Math.max(spoken, fact.value) / Math.min(spoken, fact.value);
      const sameSize = Math.floor(Math.log10(spoken)) === Math.floor(Math.log10(fact.value));
      if (((sameSize && ratio <= 2) || teenTensTwins(spoken, fact.value)) && ratio < bestRatio) {
        best = fact;
        bestRatio = ratio;
      }
    }
    return best;
  }
}

const TEEN_TENS: ReadonlyArray<[number, number]> = [[13, 30], [14, 40], [15, 50], [16, 60], [17, 70], [18, 80], [19, 90]];

/** Two amounts that differ only as a heard teen and ten do: 15 and 50, 1,700 and 7,000. */
export function teenTensTwins(a: number, b: number): boolean {
  for (let scale = 1; scale <= 1_000_000; scale *= 10) {
    if (a % scale !== 0 || b % scale !== 0) break;
    const x = a / scale;
    const y = b / scale;
    if (TEEN_TENS.some(([teen, ten]) => (x === teen && y === ten) || (x === ten && y === teen))) return true;
  }
  return false;
}

/** The note that makes the model correct itself, in its own words. */
export function correctionNote(mismatch: Mismatch): string {
  const fact = mismatch.intended!;
  return `(ملاحظة من التطبيق، مش من المستخدم: الرقم اللي اتقال لـ«${fact.label}» غلط. الصح «${fact.say}». ` +
    "صحح بجملة قصيرة وكمل من غير اعتذار طويل.)";
}
