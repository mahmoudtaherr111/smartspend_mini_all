/**
 * Financial events precede categories. This plan retains non-realized and incomplete
 * clauses separately so no later category guess can turn them into paid transactions.
 * IDs are request-local positions in the lightly normalized narrative, not DB IDs.
 */
import { normalizeV2 } from "./normalizer-v2";
import { normalizeArabic } from "./unified-normalizer";
import { extractAmounts } from "./entity-extractor";
import { detectNegation, stripNegationCircumfix } from "./negation-detector";
import {
  ALL_FINANCIAL_VERBS,
  decomposeHeuristic,
  type DecomposedSegment,
} from "./narrative-decomposer";
import { SUB_CATEGORY_MAP } from "./rule-engine";
import { CATEGORY_DICTIONARY } from "./lexicon/dictionary";
import { resolveAmountRoles, stripListMarkers } from "./amount-roles";

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
  totals: number[];
}

const verbs = new Set(ALL_FINANCIAL_VERBS.map(normalizeArabic));
const future =
  /(?:^|\s)(?:[وف])?(?:ه|ح)(?:دفع|صرف|شتري|جيب|حول|سدد|شحن|قبض|ستلم|روح|ركب|طلب|حجز)(?:\S*)?(?=\s|$)/;
// "غدا" is not here: in Egyptian it is lunch ("جبت غدا ب 150"), and a real "tomorrow"
// comes with a future verb ("هدفع غدا") that `future` already catches.
const planned =
  /(?:^|\s)(?:بكره|بكرة|سوف|ناوي|ناويه|عايز اشتري|عايزه اشتري|لو اشتريت)(?=\s|$)/;
const approximate = /(?:^|\s)(?:حوالي|تقريبا|قرابه|يمكن|مش فاكر|او|أو)(?=\s|$)/;
const foreignCurrency =
  /(?:^|\s)(?:دولار|يورو|ريال|درهم|USD|EUR|SAR|AED|GBP)(?=\s|$)/i;
const dateHint =
  /(?:^|\s)(?:امبارح|أمس|اول الشهر|أول الشهر|يوم|سنه|سنة|عام)(?=\s|$)|\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/;
/** Filing destination after a completed expense is metadata, not another unpaid transaction. */
const ledgerDirective =
  /^(?:[وف])?(?:سجلها|سجله|سجلهم|احفظها|احفظه|احفظهم|ضيفها|ضيفهم)\s+(?:في|علي)\s+(?:حساب|دفتر|سجل)\s+(?:مشروع|المشروع|المحل|الشخصي|البيزنس|مصاريفي)(?:\s+[^\d]+)?[،.!]?$/;

function action(word: string): boolean {
  const token = normalizeArabic(word).replace(/^[وف](?=.)/, "");
  return (
    verbs.has(normalizeArabic(word)) ||
    verbs.has(token) ||
    stripNegationCircumfix(token) !== null ||
    future.test(token)
  );
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
    const separate = [
      "و",
      "ثم",
      "وبعدين",
      "بعدين",
      "وكمان",
      "بعدها",
      "بس",
    ].includes(word);
    const candidate =
      attached && !separate ? word.slice(1) : words[i + 1]?.[0] || "";
    const hasPrice = extractAmounts(before).length > 0;
    const nextText = text.slice(
      separate ? (words[i + 1]?.index ?? text.length) : current.index,
    );
    const rightHasPrice = extractAmounts(nextText).length > 0;
    const leftUnpricedPurchase =
      /(?:^|\s)(?:دفعت|اشتريت|جبت|صرفت|ركبت|اكلت|أكلت|شربت|شحنت|طلبت)(?=\s)/.test(
        before,
      );
    const leftRejected =
      detectNegation(before).negated || future.test(normalizeArabic(before));
    const explicitBoundary =
      (attached || separate) &&
      (action(candidate) ||
        planned.test(normalizeArabic(candidate)) ||
        (hasPrice && /^\d/.test(candidate)) ||
        (hasPrice &&
          financialNoun(candidate) &&
          extractAmounts(nextText).length > 0));
    // A comma separates clauses only if it is not inside a numeric literal.
    const punctuation = /[،؛;.!]$/.test(words[i - 1][0]) && hasPrice;
    const retrospectiveNegation =
      !rightHasPrice && detectNegation(nextText).negated;
    if (
      (explicitBoundary &&
        !retrospectiveNegation &&
        (hasPrice ||
          (rightHasPrice && (leftUnpricedPurchase || leftRejected)))) ||
      punctuation
    ) {
      cuts.push(current.index);
      start = current.index;
    }
  }
  return cuts
    .map((cut, i) => {
      const clause = text
        .slice(cut, cuts[i + 1] ?? text.length)
        .replace(/^(?:وبعدين|بعدين|وكمان|بعدها|ثم|بس|و)(?:\s+)/, "")
        .trim();
      const first = clause.split(/\s+/)[0];
      return first.startsWith("و") &&
        !verbs.has(normalizeArabic(first)) &&
        (action(first.slice(1)) ||
          financialNoun(first.slice(1)) ||
          /^و\d/.test(first))
        ? clause.slice(1)
        : clause;
    })
    .filter(Boolean);
}

/** A clause that is only a verb and an amount ("دفعت 100") says nothing of what the money was for. */
function bareClause(clause: string): boolean {
  return clause
    .split(/\s+/)
    .every(
      (word) =>
        !word ||
        /\d/.test(word) ||
        action(word) ||
        /^(?:جنيه|ج|ج\.م|الف|ألف|و|بس|انا|أنا)$/.test(word),
    );
}

/**
 * "دفعت 100 و 150 مواصلات", "صرفت 40 و 60 على القهوة": two amounts joined by و and followed by one purpose are two
 * payments for that purpose. The bare clause takes the words after the next clause's amount; a clause that says its
 * own purpose, or a next clause that starts with its own verb ("دفعت 100 وجبت عيش بـ 20"), shares nothing.
 */
function shareCoordinatedPurpose(clauses: string[]): string[] {
  const out = [...clauses];
  for (let i = out.length - 2; i >= 0; i--) {
    const next = out[i + 1];
    if (
      !bareClause(out[i]) ||
      !/^\d/.test(next) ||
      extractAmounts(out[i]).length !== 1
    )
      continue;
    const purpose = next
      .replace(/^\d+(?:\.\d+)?\s*(?:جنيه|ج\.م|ج)?\s*/, "")
      .trim();
    if (purpose && !bareClause(purpose)) out[i] = `${out[i]} ${purpose}`;
  }
  return out;
}

/** "بداله", "زيه", "واحد تاني": the thing is the one the clause before named. */
const REPLACEMENT =
  /(?:^|\s)(?:بداله|بدالها|بدلها|بدله|زيه|زيها|غيره|غيرها|واحد\s+تاني|واحده\s+تانيه)(?=\s|$)/;

/** The first word of a clause that names a thing bought, without its attached و/ف/ال. */
function namedThing(clause: string): string | null {
  for (const word of clause.split(/\s+/)) {
    const bare = word.replace(/^[وف](?=\S{2,})/, "");
    if (!/\d/.test(bare) && !action(bare) && financialNoun(bare)) return bare;
  }
  return null;
}

/**
 * "رجعت التيشيرت واسترجعت 250 وجبت بداله واحد بـ 300": the replacement is another of the thing returned. A clause
 * that points back and names nothing of its own takes the previous clause's thing.
 */
function resolveReplacements(clauses: string[]): string[] {
  return clauses.map((clause, i) => {
    if (
      i === 0 ||
      !REPLACEMENT.test(normalizeArabic(clause)) ||
      namedThing(clause)
    )
      return clause;
    const thing = namedThing(clauses[i - 1]);
    return thing ? `${clause} ${thing}` : clause;
  });
}

export function planFinancialEvents(
  rawText: string,
  knownNames: string[] = [],
): FinancialEventPlan {
  // Keep waw boundaries that the spoken-number composer would otherwise consume.
  const listed = stripListMarkers(rawText);
  const light = normalizeV2(
    listed.text.replace(/و(?=[0-9٠-٩۰-۹])/g, " و "),
  ).forAI;
  // Give every number its role (a corrected price, a shared bill, a count, a label, a time) so only money that
  // moved reaches the clauses below; instructions addressed to the app are not narration.
  const roles = resolveAmountRoles(light, listed.found);
  // A share the engine divided out itself is shown for a tap; a share or a correction the speaker said is not.
  // Words telling the app how to file something are dropped, and what remains is confirmed, never saved alone.
  const roleReasons = roles.notes.filter(
    (note) => note === "split_share_computed" || note === "instruction_ignored",
  );
  // Only an adjacent explicit replacement is locally resolvable. More complex repairs
  // retain a blocker; never keep both the superseded and the corrected amount.
  let text = roles.text.replace(
    /(\d+(?:\.\d+)?)\s+(?:لا\s+)?(?:قصدي|اقصد|أقصد)\s+(\d+(?:\.\d+)?)/g,
    "$2",
  );
  const totals: number[] = [];
  text = text.replace(
    /(?:و?الإجمالي|و?الاجمالي|و?المجموع|و?إجمالي|و?اجمالي)\s*:?\s*(\d+(?:\.\d+)?)(?:\s*جنيه)?/g,
    (match, amount: string, offset: number) => {
      // A stated total is a check only when there are component prices to check.
      if (
        extractAmounts(
          text.slice(0, offset) + text.slice(offset + match.length),
        ).length < 2
      )
        return match;
      totals.push(Number(amount));
      return "";
    },
  );
  const clauses = resolveReplacements(
    shareCoordinatedPurpose(explicitClauses(text)),
  );
  const events: FinancialEvent[] = [];
  for (const dropped of roles.dropped) {
    events.push({
      text: dropped.text,
      amount: null,
      direction: "unknown",
      linkedVerb: null,
      personMentioned: null,
      segmentIndex: events.length,
      status: "rejected",
      reviewReasons: [],
      reason: "instruction",
    });
  }
  for (let clause of clauses) {
    const correction = /(?:لا\s+)?(?:قصدي|اقصد|أقصد)\s+(\d+(?:\.\d+)?)/.exec(
      clause,
    );
    if (correction) {
      const before = clause.slice(0, correction.index);
      const oldAmounts = extractAmounts(before);
      if (oldAmounts.length === 1) {
        const old = oldAmounts[0];
        clause =
          before.slice(0, old.index) +
          old.rawMatch.replace(/\d+(?:\.\d+)?/, correction[1]) +
          before.slice(old.index + old.length) +
          clause.slice(correction.index + correction[0].length);
      }
    }
    const norm = normalizeArabic(clause);
    const isQuestion =
      /[؟?]\s*$/.test(clause) || /^(?:هو انا|هل|انا دفعت ولا)/.test(norm);
    const notRealized = future.test(norm) || planned.test(norm);
    const negated = detectNegation(clause).negated;
    const filing =
      extractAmounts(clause).length === 0 && ledgerDirective.test(norm);
    // Assess scope before normalization and inheritance: a negated stem contains the
    // paid verb as a substring and must never become the next clause's inherited verb.
    const rejected = isQuestion || notRealized || negated || filing;
    const pieces = rejected
      ? [
          {
            text: clause,
            amount: null,
            direction: "unknown" as const,
            linkedVerb: null,
            personMentioned: null,
            segmentIndex: 0,
          },
        ]
      : decomposeHeuristic(clause, knownNames).segments;
    for (const piece of pieces) {
      const amounts = extractAmounts(piece.text);
      const reasons: string[] = [...roleReasons];
      if (approximate.test(normalizeArabic(piece.text)))
        reasons.push("approximate_or_alternative");
      if (foreignCurrency.test(piece.text))
        reasons.push("currency_requires_confirmation");
      if (dateHint.test(piece.text)) reasons.push("date_requires_confirmation");
      if (/(?:قصدي|اقصد|أقصد)/.test(piece.text))
        reasons.push("correction_unresolved");
      if (amounts.length > 1) reasons.push("amount_binding_ambiguous");
      const status = rejected
        ? "rejected"
        : amounts.length === 0
          ? "incomplete"
          : "admitted";
      events.push({
        ...piece,
        amount: amounts.length === 1 ? amounts[0].amount : null,
        segmentIndex: events.length,
        status,
        reviewReasons: reasons,
        reason: filing
          ? "instruction"
          : isQuestion
            ? "question"
            : notRealized
              ? "planned"
              : negated
                ? "negated"
                : amounts.length === 0
                  ? "missing_amount"
                  : undefined,
      });
    }
  }
  return {
    text,
    events,
    admitted: events.filter((e) => e.status === "admitted"),
    pending: events.filter((e) => e.status === "incomplete"),
    totals,
  };
}
