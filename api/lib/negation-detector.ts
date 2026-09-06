/**
 * Did the transaction actually happen?
 *
 * Egyptians routinely mention amounts for things they did NOT pay:
 *
 *   "كنت هروح الجيم وادفع 500 بس مروحتش"        — intended, never happened
 *   "الشقة كانت بمليون ونص بس مشتريتهاش"          — a price, not a purchase
 *   "صاحبي عزمني ومادفعتش مليم"                   — someone else paid
 *   "كنت هطلب بس لغيت"                            — cancelled
 *
 * These are not low-confidence transactions; they are not transactions. Emitting them
 * with a low score still lets them reach the review screen and, worse, an auto-save.
 *
 * Egyptian negation is a circumfix — مـ … ـش wrapped around the verb — so the forms are
 * generated rather than enumerated: مروحتش, مدفعتش, ماشتريتش, مشتريتهاش all decompose to
 * a known financial verb once the circumfix and any object pronoun are peeled off.
 */
import { normalizeArabic } from "./unified-normalizer";

export type NegationKind =
  | "negated_verb"
  | "counterfactual"
  | "cancelled"
  | "paid_by_someone_else";

export interface NegationResult {
  negated: boolean;
  kind?: NegationKind;
  /** The literal that triggered it, for the trace and for tests. */
  marker?: string;
}

/**
 * Verb stems that carry a financial event. Kept local rather than imported from the
 * decomposer: the rule engine consumes this module, and the decomposer consumes the
 * rule engine, so importing across would close a cycle.
 */
const FINANCIAL_VERB_STEMS = [
  "روحت", "رحت", "دفعت", "دفعنا", "صرفت", "صرفنا", "اشتريت", "شتريت", "جبت", "خدت",
  "اخدت", "حولت", "سلفت", "استلفت", "حجزت", "طلبت", "ركبت", "اكلت", "كلت", "شربت",
  "حاسبت", "سددت", "شحنت", "جددت", "عزمت", "وديت", "بعت", "قبضت", "استلمت", "لحقت",
  "لحقنا", "دفعتها", "خدتها",
];

/** Object pronouns that attach after the verb and before the negation ش. */
const OBJECT_SUFFIXES = ["ها", "هو", "هم", "ني", "نا", "ه"];

/**
 * Peels the Egyptian negation circumfix off a token and returns the bare verb, or null.
 * "مروحتش" -> "روحت" · "مشتريتهاش" -> "شتريت" · "مادفعتش" -> "دفعت"
 */
export function stripNegationCircumfix(token: string): string | null {
  if (!token.endsWith("ش") || token.length < 5) return null;
  if (!/^م/.test(token)) return null;

  let core = token.slice(0, -1); // drop the final ش
  core = core.replace(/^ما?/, ""); // drop the leading م or ما

  for (const suffix of OBJECT_SUFFIXES) {
    if (core.length > suffix.length + 2 && core.endsWith(suffix)) {
      core = core.slice(0, -suffix.length);
      break;
    }
  }
  return core.length >= 3 ? core : null;
}

function isFinancialStem(stem: string): boolean {
  if (FINANCIAL_VERB_STEMS.includes(stem)) return true;
  // "شتريت" is "اشتريت" with the initial hamza absorbed by the negation prefix.
  return FINANCIAL_VERB_STEMS.includes(`ا${stem}`);
}

/**
 * Markers are normalized through the same function as the input. Written literally they
 * silently stop matching: "على حساب" keeps ى, while normalizeArabic folds the text's ى
 * to ي, so the marker could never fire.
 */
const normalizeMarkers = (list: string[]): string[] => list.map((m) => normalizeArabic(m).toLowerCase());

const COUNTERFACTUAL = normalizeMarkers([
  "كنت ه", "كنا ه", "كنت عايز", "كنت ناوي", "كنت رايح", "كنت هروح",
  "فكرت اشتري", "فكرت اخد", "نويت",
]);

const CANCELLED = normalizeMarkers([
  "لغيت", "كنسلت", "الغيت", "بطلت", "رجعت الاوردر", "استرجعت",
]);

const PAID_BY_OTHERS = normalizeMarkers([
  "عزمني", "عزمتني", "عزمنا", "ببلاش", "مجانا",
  "ولا مليم", "ولا قرش", "الحساب عليه", "هو اللي دفع",
]);

/**
 * A counterfactual on its own ("كنت هروح الجيم") is only a non-transaction when it is
 * not followed by the thing actually happening. The reliable Egyptian signal is the
 * contrastive بس plus a negation, or an explicit cancellation.
 */
export function detectNegation(text: string): NegationResult {
  if (!text) return { negated: false };
  const norm = normalizeArabic(text).toLowerCase().replace(
    /(?:^|\s)(?:مادفعتش|مدفعتش|ما دفعتش|مادفعناش|مدفعناش)\s+(?:غير|الا)(?=\s|[0-9٠-٩۰-۹])\s*/g,
    " دفعت ",
  );

  if (/(?:^|\s)(?:علي|ع) حساب(?:ه|ها|هم)(?=\s|$|[،,.؟?!])/.test(norm) ||
      /(?:^|\s)(?:علي|ع) حساب (?:صاحبي|اخويا|ابويا|الشركه|حد تاني)(?=\s|$)/.test(norm)) {
    return { negated: true, kind: "paid_by_someone_else", marker: "على حساب شخص آخر" };
  }

  for (const marker of PAID_BY_OTHERS) {
    if (norm.includes(marker)) {
      return { negated: true, kind: "paid_by_someone_else", marker };
    }
  }

  for (const marker of CANCELLED) {
    if (norm.includes(marker)) return { negated: true, kind: "cancelled", marker };
  }

  // Generated circumfix negation on a financial verb.
  const tokens = norm.split(/[\s،,.؟?!؛;:()]+/);
  for (const [index, token] of tokens.entries()) {
    if (!token) continue;
    if (token === "ما" && tokens[index + 1]) {
      const separated = stripNegationCircumfix(`ما${tokens[index + 1]}`);
      if (separated && isFinancialStem(separated)) return {negated: true,kind:"negated_verb",marker:`ما ${tokens[index + 1]}`};
    }
    const stem = stripNegationCircumfix(token.replace(/^[وف](?=ما?)/, ""));
    if (stem && isFinancialStem(stem)) {
      return { negated: true, kind: "negated_verb", marker: token };
    }
  }

  // Intent that was never realised: "كنت ه..." with no completing action.
  for (const marker of COUNTERFACTUAL) {
    if (norm.includes(marker)) {
      return { negated: true, kind: "counterfactual", marker };
    }
  }

  return { negated: false };
}
