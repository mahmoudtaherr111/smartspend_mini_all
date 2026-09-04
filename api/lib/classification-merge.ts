/**
 * Puts the model's answer back where it belongs: on the category, and nowhere else.
 *
 * The flow this replaces rebuilt every transaction from the model's reply — amount,
 * direction, description, person, confidence, all of it — discarding what the local pass
 * had already resolved. Measured against the same 87 cases, that trade was a loss on
 * every field it touched: amounts 96.8% locally, direction 96.3%, segmentation 100%
 * against the model's 0%. The only field where the model wins is the category.
 *
 * So the local item survives and receives one edit. The consequence that matters: a
 * wrong or missing answer from the model now costs a category, not a transaction. It
 * cannot lose an amount it was never given.
 */
import type { CategoryDecision } from "./classifier-contract";
import { resolveSubcategory } from "./classifier-contract";
import { arabicDisplayName } from "./category-registry";
import type { ParsedTransaction } from "./rule-engine";
import type { DecomposedSegment } from "./narrative-decomposer";
import { extractAmounts } from "./entity-extractor";
import { emptyEvidence } from "./classification-evidence";

export interface EscalationClause {
  segment: DecomposedSegment;
  localItems: ParsedTransaction[];
}

/** Person categories keep the person in `subCategory`; a category answer must not erase it. */
const PERSON_CATEGORIES = new Set(["العائلة", "أصدقاء", "موظفين"]);

export function mergeCategoryDecisions(
  clauses: EscalationClause[],
  decisions: CategoryDecision[],
): ParsedTransaction[] {
  const byIndex = new Map(decisions.map((d) => [d.i, d]));
  const out: ParsedTransaction[] = [];

  clauses.forEach((clause, i) => {
    const decision = byIndex.get(i + 1);

    if (clause.localItems.length > 0) {
      for (const item of clause.localItems) {
        if (!decision) {
          // The model declined to answer this clause. The local answer stands — which
          // is a real answer, not a placeholder.
          out.push({ ...item, needsReview: true });
          continue;
        }

        const categoryAr = arabicDisplayName(decision.category);
        if (!categoryAr || PERSON_CATEGORIES.has(item.category)) {
          // A resolved person outranks a category guess: `subCategory` holds an
          // individual's name there, and overwriting it replaces the person with a
          // taxonomy value.
          out.push({ ...item, needsReview: true });
          continue;
        }

        out.push({
          ...item,
          category: categoryAr,
          subCategory: resolveSubcategory(decision.category, decision.sub),
          // Provenance is the model's now, because the category is. Everything else on
          // this item still came from the local pass.
          inferenceSource: "ai",
          parsedBy: "ai",
          // Keep the local pass's evidence and record that the model overruled its
          // category. `agreement` survives from the cross-check, which is what lets
          // calibration price "the model and the rule engine agreed" apart from "the
          // model overruled a local answer that said something else".
          evidence: {
            ...emptyEvidence(),
            ...((item.evidence as object) || {}),
            matchKind: "llm" as const,
            categoryIsFallback: decision.category === "miscellaneous",
          },
          person_mentioned: item.person_mentioned || decision.person || undefined,
          needsReview: true,
        });
      }
      return;
    }

    // No local item: the rule engine found nothing in this clause at all. The amount
    // still comes from the shared extractor rather than from the model, so even a
    // fabricated category cannot fabricate a figure.
    const amounts = extractAmounts(clause.segment.text);
    if (amounts.length === 0 || !decision) return;

    const categoryAr = arabicDisplayName(decision.category);
    if (!categoryAr) return;

    out.push({
      amount: amounts[0].amount,
      category: categoryAr,
      subCategory: resolveSubcategory(decision.category, decision.sub),
      description: clause.segment.text.slice(0, 80),
      type: (clause.segment.direction || "expense") as ParsedTransaction["type"],
      confidence: 60,
      needsReview: true,
      parsedBy: "ai",
      inferenceSource: "ai",
      currency: "EGP",
      person_mentioned: decision.person || undefined,
      evidence: {
        matchKind: "llm",
        rawStrength: 60,
        agreement: 0,
        disagreement: 0,
        anchorConsumed: true,
        personResolved: "none",
        hasAmbiguityPenalty: false,
        ambiguityFlagCount: 0,
        categoryIsFallback: decision.category === "miscellaneous",
      },
    } as ParsedTransaction);
  });

  return out;
}
