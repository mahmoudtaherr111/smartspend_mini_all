/**
 * Which commitment a recorded payment pays, decided by fixed rules, never by a model (docs/decisions/0051).
 *
 * A payment is linked on its own only when all five hold:
 *   1. exactly one commitment could take it, and no other commitment shows any sign of it;
 *   2. a strong identifier names it: the commitment's own name, a phrase or sender the user confirmed before, or the
 *      very person a debt is with;
 *   3. the amount is what is due, exactly (or a whole number of installments the sentence says);
 *   4. the direction and kind fit (the caller filters with `canPayCashflow`);
 *   5. the due date is open: up to ten days before it, or any time after while unpaid.
 * Anything short of that with some sign of a commitment is a question with buttons; no sign at all is silence.
 *
 * Pure: the caller loads the rows and the open due dates. Text is compared as normalized tokens, never logged.
 */
import Decimal from "decimal.js";
import { normalizeArabic } from "../../lib/unified-normalizer";
import { addDays } from "./schedule";

export interface MatchPayment {
  id: number;
  /** A magnitude in pounds. */
  amount: number | string;
  /** Description and the sentence it came from. */
  text: string;
  contactId: number | null;
  /** Cairo day of the payment. */
  day: string;
  /** The bank or wallet a captured message came from, normalized ("cib", "vf-cash"). */
  sender?: string | null;
}

export interface OpenDue {
  dueDay: string;
  effectiveDay: string;
  /** What is still owed; null when unknown. */
  remaining: number | null;
  undated?: boolean;
}

export interface MatchCommitment {
  id: number;
  title: string;
  kind: string;
  contactId: number | null;
  beneficiaryName?: string | null;
  provider?: string | null;
  hints: Array<{ kind: string; value: string; weight: number }>;
  /** Open due dates, oldest first. */
  open: OpenDue[];
}

export interface Allocation {
  cashflowId: number;
  dueDay: string;
  amount: number;
}

export type MatchDecision =
  | { status: "linked"; cashflowId: number; allocations: Allocation[] }
  | { status: "ask"; candidates: Array<{ cashflowId: number; dueDay: string; amount: number | null }> }
  | { status: "none" };

/** Words that say nothing about which commitment: paying verbs, money, prepositions. */
const STOP = new Set([
  "دفعت", "دفع", "دفعنا", "ادفع", "هدفع", "سددت", "سدد", "سداد", "تسديد", "دفعه", "دفعة",
  "جنيه", "جنية", "جنيهات", "ج", "جم", "egp", "le", "الف", "آلاف", "الاف", "مية", "ميه", "مليون",
  "في", "من", "علي", "على", "عن", "الى", "الي", "ل", "و", "ب", "مع", "بتاع", "بتاعت", "بتاعه", "ده", "دي", "النهارده", "امبارح",
  "انا", "احنا", "شهر", "الشهر", "النهاردة",
]);

/** Generic words of a commitment's name: they do not tell two commitments apart. */
const GENERIC = new Set(["قسط", "اقساط", "قسطين", "التزام", "مصاريف", "مصروفات", "فاتوره", "اشتراك", "دفعه", "سداد"]);

/** "قسطين", "شهرين", "2 قسط": how many installments a sentence says it pays. */
function statedCount(tokens: string[]): number {
  if (tokens.some((token) => token === "قسطين" || token === "شهرين")) return 2;
  const words: Record<string, number> = { "اتنين": 2, "تلات": 3, "تلاته": 3, "ثلاث": 3, "تلاتة": 3, "اربع": 4, "اربعه": 4 };
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const next = tokens[index + 1];
    if (next !== "اقساط" && next !== "قسط" && next !== "شهور") continue;
    const count = Number(tokens[index]) || words[tokens[index]];
    if (count >= 2 && count <= 12) return count;
  }
  return 1;
}

/** Normalized tokens: no diacritics or digit groups, the article and common prefixes off, stop words out. */
export function matchTokens(text: string): string[] {
  return normalizeArabic(text)
    .toLowerCase()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    // The article and its fused prepositions, only when a real word stays ("فاليو" keeps its letters).
    .map((token) => token.replace(/^(وال|بال|لل|ال)(?=\p{L}{3,})/u, ""))
    .filter((token) => token.length > 0 && !STOP.has(token));
}

const tokensIn = (needle: string[], hay: Set<string>) => needle.length > 0 && needle.every((token) => hay.has(token));

/** The phrase a confirmed payment teaches: its tokens without numbers, sorted, at most 160 characters. */
export function learnedPhrase(text: string): string | null {
  const tokens = [...new Set(matchTokens(text).filter((token) => !/^\d+$/.test(token)))].sort();
  const phrase = tokens.join(" ").slice(0, 160).trim();
  return phrase.length >= 2 ? phrase : null;
}

interface Scored {
  commitment: MatchCommitment;
  strong: boolean;
  score: number;
  eligible: OpenDue[];
}

const cents = (value: number | string) => new Decimal(value).toDecimalPlaces(2);

function score(commitment: MatchCommitment, payment: MatchPayment, words: Set<string>): Scored {
  // Rule 5: open, up to ten days early or any time late; an undated debt is always open.
  const latest = addDays(payment.day, 10);
  const eligible = commitment.open.filter((due) => due.undated || due.effectiveDay <= latest);
  let strong = false;
  let total = 0;
  if (commitment.contactId != null && payment.contactId === commitment.contactId) {
    strong = true;
    total += 3;
  }
  for (const hint of commitment.hints) {
    if (hint.weight <= 0) continue;
    if (hint.kind === "phrase" && tokensIn(hint.value.split(" "), words)) {
      strong = true;
      total += 3;
    }
    if (hint.kind === "sender" && payment.sender && hint.value === payment.sender) {
      strong = true;
      total += 3;
    }
  }
  const titleTokens = matchTokens(commitment.title).filter((token) => !GENERIC.has(token));
  if (tokensIn(titleTokens, words)) {
    strong = true;
    total += 3;
  } else if (titleTokens.some((token) => words.has(token))) {
    total += 1;
  }
  const beneficiary = matchTokens(commitment.beneficiaryName ?? "");
  if (tokensIn(beneficiary, words)) total += 2;
  const provider = matchTokens(commitment.provider ?? "");
  if (tokensIn(provider, words)) total += 2;
  return { commitment, strong, score: total, eligible };
}

/**
 * The decision for one payment among the commitments the caller already filtered by direction and kind.
 */
export function decideMatch(payment: MatchPayment, commitments: MatchCommitment[]): MatchDecision {
  const tokens = matchTokens(payment.text);
  const words = new Set(tokens);
  const amount = cents(payment.amount);
  if (amount.lte(0)) return { status: "none" };
  const scored = commitments.map((commitment) => score(commitment, payment, words)).filter((item) => item.eligible.length > 0);
  const signed = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  if (!signed.length) return { status: "none" };

  const [top] = signed;
  const count = statedCount(tokens);
  // Several installments at once may run past the ten-day window: they start at the first open one.
  const firstOpen = top.commitment.open.indexOf(top.eligible[0]);
  const due = count > 1 ? top.commitment.open.slice(firstOpen, firstOpen + count) : top.eligible.slice(0, 1);
  const allKnown = due.length === count && due.every((item) => item.remaining != null);
  const exact = allKnown && due.reduce((sum, item) => sum.plus(item.remaining!), new Decimal(0)).toDecimalPlaces(2).eq(amount);
  if (signed.length === 1 && top.strong && exact) {
    return {
      status: "linked",
      cashflowId: top.commitment.id,
      allocations: due.map((item) => ({ cashflowId: top.commitment.id, dueDay: item.dueDay, amount: item.remaining! })),
    };
  }
  // A question only when something points at a commitment: a strong name, or a weaker sign with the amount due.
  const candidates = signed
    .filter((item) => item.strong || item.score >= 2 || (item.eligible[0].remaining != null && cents(item.eligible[0].remaining).eq(amount)))
    .slice(0, 3);
  if (!candidates.length) return { status: "none" };
  return {
    status: "ask",
    candidates: candidates.map((item) => ({ cashflowId: item.commitment.id, dueDay: item.eligible[0].dueDay, amount: item.eligible[0].remaining })),
  };
}
