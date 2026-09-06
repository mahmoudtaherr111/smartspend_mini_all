/** Merge category suggestions onto admitted events; never manufacture an event. */
import type { CategoryDecision } from "./classifier-contract";
import { resolveSubcategory } from "./classifier-contract";
import { arabicDisplayName } from "./category-registry";
import type { ParsedTransaction } from "./rule-engine";
import type { DecomposedSegment } from "./narrative-decomposer";
import { emptyEvidence } from "./classification-evidence";
import { BlockerReason, withBlocker } from "./final-acceptance";
import { normalizeRelationship } from "./relationship-normalizer";

export interface EscalationClause {
  segment: DecomposedSegment;
  localItems: ParsedTransaction[];
  /**
   * Identity of this clause within the request. Answers are matched to it, and the item
   * carries it out as `sourceEventId`, so a reordered reply cannot move an amount from
   * one event to another.
   */
  clauseId?: number;
}

export interface MergeOutcome {
  items: ParsedTransaction[];
  /**
   * Clauses the model answered for but that the local pass produced no event for.
   *
   * The category is not the missing piece here — the amount is, and the model is not
   * asked for amounts precisely because it is bad at them. Naming these separately is
   * what keeps "I could not extract this" from being reported as "there was nothing
   * here": the caller turns them into a question or a draft, never into a row.
   */
  unresolvedClauseIds: number[];
  /** Clauses that got no usable answer, for the trace and the review reasons. */
  unansweredClauseIds: number[];
}

const PERSON_CATEGORIES = new Set(["العائلة", "أصدقاء", "موظفين"]);

export function mergeCategoryDecisions(
  clauses: EscalationClause[],
  decisions: CategoryDecision[],
  context: { businessMode?: boolean; businessId?: number | null;
    businessCategories?: Array<{ nameAr: string; type: string }> } = {},
): MergeOutcome {
  const byIndex = new Map(decisions.map((d) => [d.i, d]));
  const items: ParsedTransaction[] = [];
  const unresolvedClauseIds: number[] = [];
  const unansweredClauseIds: number[] = [];

  clauses.forEach((clause, i) => {
    const clauseId = clause.clauseId ?? i + 1;
    const decision = byIndex.get(i + 1);
    const category = decision && arabicDisplayName(decision.category);

    if (clause.localItems.length === 0) {
      // The local pass found no event in this fragment. A category answer cannot supply
      // the amount, the direction or the date it is missing, and inferring them from the
      // fact that the model was willing to name a category is exactly how a negated
      // "ماشتريتش جزمة ب500" came back as a 500 shopping expense.
      if (decision) unresolvedClauseIds.push(clauseId);
      return;
    }

    if (!decision || !category) {
      unansweredClauseIds.push(clauseId);
    }

    for (const item of clause.localItems) {
      const carried = { ...item, sourceEventId: item.sourceEventId ?? clauseId };

      // An empty/rejected clause stays empty; category answers cannot invent identities.
      if (!decision || !category) {
        items.push(withBlocker(carried, BlockerReason.CATEGORY_REPLY_UNRESOLVED));
        continue;
      }

      if (decision.issue) {
        items.push(withBlocker(carried, `model_${decision.issue}`));
        continue;
      }
      // The model may suggest a relationship category, but never an identity. A locally
      // resolved name and relationship must corroborate it; otherwise ask for review.
      if (PERSON_CATEGORIES.has(category)) {
        const supported = item.person_mentioned && item.person_relationship &&
          normalizeRelationship(item.person_relationship).category === category;
        if (!supported || item.category !== category) {
          items.push(withBlocker(carried, BlockerReason.CATEGORY_REPLY_UNRESOLVED));
          continue;
        }
      }
      const businessSub = context.businessMode && context.businessId && decision.category === "work"
        ? context.businessCategories?.find((c) => c.nameAr === decision.sub && c.type === item.type)
        : undefined;
      const subCategory = PERSON_CATEGORIES.has(category) ? item.subCategory
        : businessSub?.nameAr ?? resolveSubcategory(decision.category, decision.sub);
      const invalidSub = Boolean(decision.sub && !PERSON_CATEGORIES.has(category) &&
        !businessSub && subCategory !== decision.sub);

      items.push({
        ...carried,
        category,
        subCategory,
        ...(businessSub ? { businessId: context.businessId! } : {}),
        inferenceSource: "ai" as const,
        parsedBy: "ai" as const,
        // The category changed, so the calibration that priced the OLD category is no
        // longer a statement about this item. Clearing it forces a fresh estimate rather
        // than carrying a strong_rule 95 onto an answer the strong rule never gave: the
        // audit found exactly that, a food item recalled as health that kept both the
        // score and the `calibrated:strong_rule` marker of the resolver it replaced.
        calibration: undefined,
        ambiguityFlags: (item.ambiguityFlags || []).filter((f) => !f.startsWith("calibrated:")),
        evidence: {
          ...emptyEvidence("llm"),
          ...item.evidence,
          matchKind: "llm" as const,
          // A prompted local guess makes agreement dependent, not a second observation.
          agreement: 0,
          disagreement: item.category !== "متنوعات" && item.category !== category ? 1 : 0,
          categoryIsFallback: decision.category === "miscellaneous",
        },
        needsReview: true,
        reviewReasons: invalidSub
          ? [...new Set([...(item.reviewReasons || []), "model_subcategory_invalid"])]
          : item.reviewReasons,
      });
    }
  });

  return { items, unresolvedClauseIds, unansweredClauseIds };
}
