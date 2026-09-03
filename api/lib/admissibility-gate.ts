/**
 * Is this utterance a financial statement at all?
 *
 * This runs before anything that costs money, and it is the only place allowed to end
 * a request with "I did not understand". The rule it enforces: **never spend a token
 * on text that cannot possibly be a transaction.**
 *
 * The filter it replaces only fired when the amount count was zero, so
 * "فكرني اكلم ماما بكرة الساعة خمسة" sailed through on the 5, and it carried a fourth
 * private copy of the spoken-number list. This one reuses the real extractor and the
 * real verb lexicon, and matches on word boundaries rather than substrings.
 *
 * Bias: conservative. A false "not financial" is worse than a wasted local pass, so
 * every rejection needs positive evidence of non-financial intent, not merely an
 * absence of financial evidence.
 */
import { extractAmounts } from "./entity-extractor";
import { detectNegation } from "./negation-detector";
import { ALL_FINANCIAL_VERBS } from "./narrative-decomposer";
import { SUB_CATEGORY_MAP } from "./rule-engine";
import { CATEGORY_DICTIONARY } from "./egyptian-dictionary";
import { buildTokenSet, findMatchingWord } from "./arabic-token-match";

export type AdmissibilityVerdict =
  /** Proceed to classification. */
  | "financial"
  /** Nothing financial here — answer the user, spend nothing. */
  | "not_financial"
  /** A query about their spending, not a record of it. Belongs to the chat path. */
  | "question"
  /** An amount was named for something that explicitly did not happen. */
  | "negated";

export interface AdmissibilitySignals {
  amountCount: number;
  wordCount: number;
  matchedVerb: string | null;
  matchedNoun: string | null;
  isQuestion: boolean;
  isNegated: boolean;
}

export interface AdmissibilityResult {
  verdict: AdmissibilityVerdict;
  /** Stable machine code for telemetry and the admin funnel. */
  reason: string;
  /** Arabic reply, present only when the verdict is not "financial". */
  userMessage?: string;
  signals: AdmissibilitySignals;
}

/**
 * Egyptian question markers. Deliberately tight: these words appear in questions and
 * almost nowhere else in a spending statement.
 */
const QUESTION_WORDS = [
  "كام", "كم", "قد", "ايه", "إيه", "فين", "امتى", "إمتى", "ليه", "ازاي", "إزاي",
  "هل", "مين", "اقدر", "أقدر", "ينفع", "عايزاعرف",
];

/** Phrases that make a question unmistakable even without a marker word. */
const QUESTION_PHRASES = ["عايز اعرف", "عايزة اعرف", "ممكن تقولي", "اعرف اجمالي", "اعرف مجموع"];

const QUESTION_MARK = /[؟?]\s*$/;

/** Currency words that corroborate a bare noun into an actual transaction. */
const CURRENCY_WORDS = ["جنيه", "جنية", "جنيهات", "ج", "قرش", "قروش", "دولار", "يورو", "درهم", "ريال"];

/**
 * Nouns that carry a financial event without any verb — "فاتورة الكهربا 450" has no
 * verb at all. Derived from the same dictionaries the classifier uses, so the gate can
 * never be narrower than the thing it guards.
 */
let financialNouns: string[] | null = null;
function getFinancialNouns(): string[] {
  if (financialNouns) return financialNouns;
  financialNouns = [
    ...Object.keys(SUB_CATEGORY_MAP),
    ...Object.keys(CATEGORY_DICTIONARY),
  ].filter((w) => w.length >= 3);
  return financialNouns;
}

function isQuestion(text: string, tokens: Set<string>): boolean {
  if (QUESTION_PHRASES.some((p) => text.includes(p))) return true;
  const marker = findMatchingWord(text, QUESTION_WORDS, tokens);
  if (marker) return true;
  return QUESTION_MARK.test(text);
}

export function checkAdmissibility(text: string): AdmissibilityResult {
  const trimmed = String(text || "").trim();
  const tokens = buildTokenSet(trimmed);
  const words = trimmed.split(/\s+/).filter(Boolean);

  const amounts = extractAmounts(trimmed);
  const matchedVerb = findMatchingWord(trimmed, ALL_FINANCIAL_VERBS, tokens) ?? null;
  const matchedNoun = findMatchingWord(trimmed, getFinancialNouns(), tokens) ?? null;
  const negation = detectNegation(trimmed);
  const question = isQuestion(trimmed, tokens);

  const signals: AdmissibilitySignals = {
    amountCount: amounts.length,
    wordCount: words.length,
    matchedVerb,
    matchedNoun,
    isQuestion: question,
    isNegated: negation.negated,
  };

  if (!trimmed) {
    return {
      verdict: "not_financial",
      reason: "empty_input",
      userMessage: "ما وصلنيش أي كلام. جرّب تاني.",
      signals,
    };
  }

  // A question about spending is a query, not a record of one. Answering it with a
  // transaction would invent data; routing it to the classifier would also waste a call.
  // Only treat it as a question when there is no amount to record — "دفعت كام؟ 50"
  // is a statement with a stray marker.
  if (question && amounts.length === 0) {
    return {
      verdict: "question",
      reason: "query_not_statement",
      userMessage: "ده سؤال عن مصاريفك مش عملية جديدة — اسألني في الشات وهجاوبك.",
      signals,
    };
  }

  // A single amount attached to something that explicitly did not happen.
  // With several amounts the message may mix real and unreal clauses, so that case is
  // left to the per-segment negation check rather than rejected wholesale.
  if (negation.negated && amounts.length <= 1) {
    return {
      verdict: "negated",
      reason: `negated_${negation.kind ?? "unknown"}`,
      userMessage: "فهمت إن العملية دي ما تمتش، فما سجّلتهاش. لو تمت فعلاً قولي تاني.",
      signals,
    };
  }

  // Positive financial evidence. An amount or a financial verb stands alone.
  if (amounts.length > 0 || matchedVerb) {
    return { verdict: "financial", reason: "has_financial_evidence", signals };
  }

  // A noun on its own signals a TOPIC, not a transaction — the classifier dictionaries
  // contain words like "حلو" (from حلويات) and "صاحبي" (from the friends category),
  // which appear in ordinary chatter. A bare noun only counts when something
  // corroborates it: a currency word, or a phrase short enough to be a terse entry
  // ("فاتورة الكهربا") rather than prose.
  if (matchedNoun) {
    const hasCurrency = Boolean(findMatchingWord(trimmed, CURRENCY_WORDS, tokens));
    if (hasCurrency || words.length <= 4) {
      return { verdict: "financial", reason: "corroborated_financial_noun", signals };
    }
  }

  // Very short input is ambiguous rather than wrong — "بنزين" alone is a real thing a
  // user types. Let it through; the classifier will ask if it cannot resolve it.
  if (words.length <= 2) {
    return { verdict: "financial", reason: "short_input_benefit_of_doubt", signals };
  }

  return {
    verdict: "not_financial",
    reason: "no_financial_evidence",
    userMessage: "مش لاقي عملية مالية واضحة في كلامك — اكتب المبلغ والحاجة اللي دفعت فيها.",
    signals,
  };
}
