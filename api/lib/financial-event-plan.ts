/**
 * Financial events precede categories. This plan retains non-realized and incomplete
 * clauses separately so no later category guess can turn them into paid transactions.
 * IDs are request-local positions in the lightly normalized narrative, not DB IDs.
 */
import { normalizeV2 } from "./normalizer-v2";
import { normalizeArabic } from "./unified-normalizer";
import { extractAmounts } from "./entity-extractor";
import { detectNegation, stripNegationCircumfix } from "./negation-detector";
import { ALL_FINANCIAL_VERBS, decomposeHeuristic, type DecomposedSegment } from "./narrative-decomposer";
import { SUB_CATEGORY_MAP } from "./rule-engine";
import { CATEGORY_DICTIONARY } from "./egyptian-dictionary";

export interface FinancialEvent extends DecomposedSegment {
  status: "admitted" | "rejected" | "incomplete";
  reason?: string;
  reviewReasons: string[];
}

export interface FinancialEventPlan {
  text: string;
  events: FinancialEvent[];
  admitted: FinancialEvent[];
  pending: FinancialEvent[];
}

const verbs = new Set(ALL_FINANCIAL_VERBS.map(normalizeArabic));
const future = /(?:^|\s)(?:[وف])?(?:ه|ح)(?:دفع|صرف|شتري|جيب|حول|سدد|شحن|قبض|ستلم|روح|ركب|طلب|حجز)(?:\S*)?(?=\s|$)/;
const planned = /(?:^|\s)(?:بكره|غدا|سوف|ناوي|ناويه|عايز اشتري|عايزه اشتري|لو اشتريت)(?=\s|$)/;
const approximate = /(?:^|\s)(?:حوالي|تقريبا|قرابه|يمكن|مش فاكر|او|أو)(?=\s|$)/;
const foreignCurrency = /(?:^|\s)(?:دولار|يورو|ريال|درهم|USD|EUR|SAR|AED|GBP)(?=\s|$)/i;
const dateHint = /(?:^|\s)(?:امبارح|أمس|اول الشهر|أول الشهر|يوم|سنه|سنة|عام)(?=\s|$)|\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/;

function action(word: string): boolean {
  const token = normalizeArabic(word).replace(/^[وف](?=.)/, "");
  return verbs.has(normalizeArabic(word)) || verbs.has(token) ||
    stripNegationCircumfix(token) !== null || future.test(token);
}

function financialNoun(word: string): boolean {
  const token = normalizeArabic(word).replace(/^[وف]/, "");
  return Boolean(SUB_CATEGORY_MAP[token] || CATEGORY_DICTIONARY[token]);
}

/** Explicit new actions/amounts bind before a neighbouring category can claim them. */
function explicitClauses(text: string): string[] {
  const words = [...text.matchAll(/\S+/g)];
  const cuts = [0];
  let start = 0;
  for (let i = 1; i < words.length; i++) {
    const current = words[i];
    const word = current[0];
    const before = text.slice(start, current.index);
    const attached = word.startsWith("و") && word.length > 1;
    const separate = ["و", "ثم", "وبعدين", "بعدين", "وكمان", "بعدها", "بس"].includes(word);
    const candidate = attached && !separate ? word.slice(1) : words[i + 1]?.[0] || "";
    const hasPrice = extractAmounts(before).length > 0;
    const nextText = text.slice(separate ? (words[i + 1]?.index ?? text.length) : current.index);
    const explicitBoundary = (attached || separate) && (
      action(candidate) ||
      (hasPrice && /^\d/.test(candidate)) ||
      (hasPrice && financialNoun(candidate) && extractAmounts(nextText).length > 0)
    );
    // A comma separates clauses only if it is not inside a numeric literal.
    const punctuation = /[،؛;.!]$/.test(words[i - 1][0]) && hasPrice;
    if ((explicitBoundary && (hasPrice || extractAmounts(nextText).length > 0)) || punctuation) {
      cuts.push(current.index);
      start = current.index;
    }
  }
  return cuts.map((cut, i) => text.slice(cut, cuts[i + 1] ?? text.length)
    .replace(/^(?:وبعدين|بعدين|وكمان|بعدها|ثم|بس|و)(?:\s+)/, "")
    .replace(/^و(?=[\u0621-\u064A\d])/, "")
    .trim()).filter(Boolean);
}

export function planFinancialEvents(rawText: string, knownNames: string[] = []): FinancialEventPlan {
  // Keep waw boundaries that the spoken-number composer would otherwise consume.
  const light = normalizeV2(rawText.replace(/و(?=[0-9٠-٩۰-۹])/g, " و ")).forAI;
  // Only an adjacent explicit replacement is locally resolvable. More complex repairs
  // retain a blocker; never keep both the superseded and the corrected amount.
  const text = light.replace(/(\d+(?:\.\d+)?)\s+(?:لا\s+)?(?:قصدي|اقصد|أقصد)\s+(\d+(?:\.\d+)?)/g, "$2");
  const events: FinancialEvent[] = [];
  for (const clause of explicitClauses(text)) {
    const norm = normalizeArabic(clause);
    const isQuestion = /[؟?]\s*$/.test(clause) || /^(?:هو انا|هل|انا دفعت ولا)/.test(norm);
    const notRealized = future.test(norm) || planned.test(norm);
    const negated = detectNegation(clause).negated;
    // Assess scope before normalization and inheritance: a negated stem contains the
    // paid verb as a substring and must never become the next clause's inherited verb.
    const rejected = isQuestion || notRealized || negated;
    const pieces = rejected ? [{ text: clause, amount: null, direction: "unknown" as const,
      linkedVerb: null, personMentioned: null, segmentIndex: 0 }]
      : decomposeHeuristic(clause, knownNames).segments;
    for (const piece of pieces) {
      const amounts = extractAmounts(piece.text);
      const reasons: string[] = [];
      if (approximate.test(normalizeArabic(piece.text))) reasons.push("approximate_or_alternative");
      if (foreignCurrency.test(piece.text)) reasons.push("currency_requires_confirmation");
      if (dateHint.test(piece.text)) reasons.push("date_requires_confirmation");
      if (/(?:قصدي|اقصد|أقصد)/.test(piece.text)) reasons.push("correction_unresolved");
      if (amounts.length > 1) reasons.push("amount_binding_ambiguous");
      const status = rejected ? "rejected" : amounts.length === 0 ? "incomplete" : "admitted";
      events.push({ ...piece, amount: amounts.length === 1 ? amounts[0].amount : null,
        segmentIndex: events.length, status, reviewReasons: reasons,
        reason: isQuestion ? "question" : notRealized ? "planned" : negated ? "negated" :
          amounts.length === 0 ? "missing_amount" : undefined });
    }
  }
  return { text, events, admitted: events.filter((e) => e.status === "admitted"),
    pending: events.filter((e) => e.status === "incomplete") };
}
