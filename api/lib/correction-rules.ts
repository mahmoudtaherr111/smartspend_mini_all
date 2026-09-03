/**
 * What the user explicitly told us the answer is.
 *
 * Muscle memory infers patterns from aggregate history, and its filter list starts with
 * `if (log.wasCorrected) continue` — the single case where the user handed us the right
 * answer was the one case it refused to learn from. It also needs two occurrences and an
 * `auto_save` decision, so calibration moving most items to review starved it further.
 * Net effect: correcting a category could not change what happened next, no matter how
 * many times you did it.
 *
 * A correction is different in kind from a pattern, so this treats it differently:
 *
 *   - EXPLICIT, not inferred. The user said it; there is nothing to be unsure about.
 *   - FIRST occurrence, not the second. Being told twice is not a higher standard of
 *     evidence, it is the same evidence plus an annoyed user.
 *   - SEGMENT-scoped, not message-scoped. Correcting "قسط الجمعية" once fixes it inside
 *     every future narrative that mentions it, not only in that exact sentence.
 *   - AMOUNT-BOUNDED. A rule learned at 35 EGP is evidence about a coffee, not about a
 *     3500 EGP payment whose text happens to mention coffee.
 *   - SELF-RETIRING. Corrected twice after firing, and the rule removes itself rather
 *     than arguing with the user indefinitely.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../queries/connection";
import { userCorrectionRules } from "../../db/schema";
import { normalizeArabic } from "./unified-normalizer";
import { tokenVariants } from "./arabic-token-match";

/** Person categories carry a name in `sub_category`; a rule must never generalise one. */
const PERSON_CATEGORIES = new Set(["العائلة", "أصدقاء", "موظفين"]);

/**
 * Rules retire after this many post-firing corrections.
 *
 * One is not enough — a single unusual case should not delete something the user asked
 * for. Two is a pattern, and at that point the rule is doing harm.
 */
const MAX_OVERRIDES = 2;

/**
 * Words that carry no categorising information, so a pattern built from them matches
 * everything.
 *
 * Run through the SAME normalizer the input goes through. Written as typed, "على" never
 * matched anything, because normalization folds the final alef-maqsura and the token
 * arrives as "علي" — the same orthography mismatch that made the negation markers inert
 * earlier in this rebuild. A stop list that silently stops nothing is worse than none:
 * it looks like a guard while every rule keys on connectives and fires on everything.
 */
const STOP_TOKENS = new Set(
  [
    "في", "من", "على", "الى", "إلى", "عن", "مع", "و", "ب", "بـ",
    "جنيه", "جنيها", "ج", "الف", "ألف", "كام", "ده", "دي", "اللي",
    "كان", "كانت", "يوم", "امبارح", "النهارده", "النهاردة", "بكرة",
  ].map((w) => canonicalToken(normalizeArabic(w))),
);

/**
 * One deterministic form per word: the most clitic-stripped variant.
 *
 * Without this a correction learned from "قهوة" would not fire on "القهوة" — the exact
 * "different phrasing" case the whole mechanism promises to handle, since Arabic attaches
 * its articles directly to the word.
 */
function canonicalToken(token: string): string {
  const variants = tokenVariants(token);
  let shortest = token;
  for (const v of variants) {
    if (v.length < shortest.length) shortest = v;
  }
  return shortest;
}

/**
 * The signature a correction is keyed on.
 *
 * Digits are dropped: the amount varies between occurrences of the same purchase and is
 * carried by the band instead. Stop words are dropped so a rule keys on what makes the
 * segment recognisable rather than on Arabic connectives, which would make it fire on
 * anything. Tokens are sorted so word order does not fragment one rule into several.
 */
export function correctionPattern(text: string): string {
  const tokens = normalizeArabic(String(text || ""))
    .replace(/[0-9٠-٩]+/g, " ")
    .split(/[\s،,.؟?!؛;:()]+/)
    .map((t) => canonicalToken(t.trim()))
    .filter((t) => t.length >= 2 && !STOP_TOKENS.has(t));

  const unique = [...new Set(tokens)].sort();
  return unique.slice(0, 6).join(" ");
}

/**
 * The amount range a rule applies to: half to double what it was learned at.
 *
 * Wide enough that a coffee costing 35 one day and 45 the next is the same rule, narrow
 * enough that it cannot answer for something two orders of magnitude away.
 */
export function amountBand(amount: number): { min: number; max: number } | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { min: amount / 2, max: amount * 2 };
}

export interface CorrectionRule {
  id: number;
  pattern: string;
  category: string;
  subCategory: string;
  type: string;
  amountMin: number | null;
  amountMax: number | null;
}

export interface RecordCorrectionInput {
  userId: number;
  userType: string;
  /** The utterance that produced the wrong answer. */
  originalText: string;
  category: string;
  subCategory?: string | null;
  type: string;
  amount: number;
  sourceLogId?: number | null;
}

/**
 * True when a correction is worth storing as a rule.
 *
 * Person categories are excluded: `sub_category` holds an individual's name there, so a
 * rule would teach that every future mention of the pattern belongs to one person. And a
 * pattern of fewer than two meaningful tokens is not a pattern — it would fire on most
 * of what the user says.
 */
export function isLearnableCorrection(input: {
  category: string;
  originalText: string;
}): boolean {
  if (PERSON_CATEGORIES.has(input.category)) return false;
  if (input.category === "متنوعات") return false;
  return correctionPattern(input.originalText).split(" ").filter(Boolean).length >= 2;
}

/**
 * Store what the user just told us, or widen the rule that already covers it.
 *
 * Never throws: a correction that fails to persist must still save the user's expense.
 */
export async function recordCorrection(input: RecordCorrectionInput): Promise<boolean> {
  try {
    if (!isLearnableCorrection(input)) return false;

    const pattern = correctionPattern(input.originalText);
    const band = amountBand(input.amount);

    await db
      .insert(userCorrectionRules)
      .values({
        userId: input.userId,
        userType: input.userType,
        pattern,
        category: input.category,
        subCategory: input.subCategory || "عام",
        type: input.type,
        amountMin: band ? String(band.min) : null,
        amountMax: band ? String(band.max) : null,
        sourceLogId: input.sourceLogId ?? null,
        isActive: true,
      })
      .onDuplicateKeyUpdate({
        set: {
          // The newest correction wins. The user changing their mind is the user telling
          // us the answer again, not a conflict to resolve.
          category: input.category,
          subCategory: input.subCategory || "عام",
          type: input.type,
          amountMin: band ? String(band.min) : null,
          amountMax: band ? String(band.max) : null,
          isActive: true,
          timesOverridden: 0,
        },
      });

    return true;
  } catch (err) {
    console.warn("[Correction Rules] Could not record correction:", err);
    return false;
  }
}

/** Every active rule for a user, for matching against a new utterance. */
export async function loadCorrectionRules(
  userId: number,
  userType: string,
): Promise<CorrectionRule[]> {
  try {
    const rows = await db
      .select()
      .from(userCorrectionRules)
      .where(
        and(
          eq(userCorrectionRules.userId, userId),
          eq(userCorrectionRules.userType, userType),
          eq(userCorrectionRules.isActive, true),
        ),
      );

    return rows.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      category: r.category,
      subCategory: r.subCategory,
      type: r.type,
      amountMin: r.amountMin === null ? null : Number(r.amountMin),
      amountMax: r.amountMax === null ? null : Number(r.amountMax),
    }));
  } catch (err) {
    console.warn("[Correction Rules] Could not load rules:", err);
    return [];
  }
}

/**
 * Find the rule that covers this segment, if any.
 *
 * Matching is containment of the rule's tokens in the segment's, not equality: the rule
 * was learned from one phrasing and has to fire on the others. The most specific rule
 * wins, so a later, narrower correction takes precedence over an earlier broad one.
 */
export function matchCorrectionRule(
  segmentText: string,
  amount: number,
  rules: CorrectionRule[],
): CorrectionRule | null {
  if (rules.length === 0) return null;

  const segmentTokens = new Set(correctionPattern(segmentText).split(" ").filter(Boolean));
  if (segmentTokens.size === 0) return null;

  let best: CorrectionRule | null = null;
  let bestSize = 0;

  for (const rule of rules) {
    const ruleTokens = rule.pattern.split(" ").filter(Boolean);
    if (ruleTokens.length === 0) continue;
    if (!ruleTokens.every((t) => segmentTokens.has(t))) continue;

    // Outside the band this rule is not evidence about this transaction.
    if (rule.amountMin !== null && amount < rule.amountMin) continue;
    if (rule.amountMax !== null && amount > rule.amountMax) continue;

    if (ruleTokens.length > bestSize) {
      best = rule;
      bestSize = ruleTokens.length;
    }
  }

  return best;
}

/** A rule fired and the user accepted it. Bookkeeping only; never blocks. */
export function noteRuleApplied(ruleId: number): void {
  void db
    .update(userCorrectionRules)
    .set({ timesApplied: sql`${userCorrectionRules.timesApplied} + 1` })
    .where(eq(userCorrectionRules.id, ruleId))
    .catch(() => {});
}

/**
 * A rule fired and the user corrected it anyway.
 *
 * After `MAX_OVERRIDES` the rule deactivates itself. A rule that keeps being overridden
 * is worse than no rule: it produces a confident wrong answer the user has to undo every
 * single time, which is precisely the experience this whole mechanism exists to end.
 */
export async function noteRuleOverridden(ruleId: number): Promise<void> {
  try {
    await db
      .update(userCorrectionRules)
      .set({
        timesOverridden: sql`${userCorrectionRules.timesOverridden} + 1`,
        isActive: sql`CASE WHEN ${userCorrectionRules.timesOverridden} + 1 >= ${MAX_OVERRIDES} THEN false ELSE true END`,
      })
      .where(eq(userCorrectionRules.id, ruleId));
  } catch (err) {
    console.warn("[Correction Rules] Could not record override:", err);
  }
}

/**
 * Overwrite what the classifier decided with what the user already told us.
 *
 * Stamped as `user_correction` evidence, which has two consequences that matter: the
 * decision layer treats it as user-taught and never pays a model to second-guess it, and
 * calibration prices it in the `exact` family rather than by the classifier's own score.
 *
 * Returns the ids of every rule that fired so the caller can record usage.
 */
export function applyCorrectionRules<
  T extends {
    amount: number;
    category: string;
    subCategory?: string;
    type: string;
    confidence: number;
    evidence?: unknown;
    inferenceSource?: string;
    parsedBy?: string;
  },
>(
  items: T[],
  segmentText: string,
  rules: CorrectionRule[],
): { items: T[]; appliedRuleIds: number[] } {
  if (rules.length === 0) return { items, appliedRuleIds: [] };

  const appliedRuleIds: number[] = [];
  const out = items.map((item) => {
    const rule = matchCorrectionRule(segmentText, item.amount, rules);
    if (!rule) return item;

    // Person categories are never learned, so a rule can never overwrite the person
    // resolution that produced this item's subcategory.
    if (PERSON_CATEGORIES.has(item.category)) return item;

    appliedRuleIds.push(rule.id);
    return {
      ...item,
      category: rule.category,
      subCategory: rule.subCategory,
      type: rule.type,
      inferenceSource: "user_correction",
      evidence: {
        matchKind: "user_correction",
        rawStrength: 100,
        agreement: 0,
        disagreement: 0,
        hasAmbiguityPenalty: false,
        categoryIsFallback: false,
      },
    };
  });

  return { items: out, appliedRuleIds };
}
