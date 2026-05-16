/**
 * SmartSpend Confidence Scorer (Step 6)
 * Evaluates and adjusts confidence scores for parsed transactions
 */

import type { ParsedTransaction } from "./rule-engine";

export interface ScoredResult {
  items: ParsedTransaction[];
  overallConfidence: number;
  decision: "auto_save" | "review" | "clarify";
  clarificationQuestion?: string;
}

/** Confidence thresholds (can be overridden by admin settings) */
export const DEFAULT_THRESHOLDS = {
  autoSave: 85,   // >= 85% → save automatically
  review: 60,     // 60-84% → show review screen
  clarify: 0,     // < 60% → ask for clarification
};

/**
 * Apply scoring adjustments based on context
 */
function adjustConfidence(item: ParsedTransaction): ParsedTransaction {
  let conf = item.confidence;

  // Penalty: "متنوعات" category = low quality classification
  if (item.category === "متنوعات") conf = Math.min(conf, 40);

  // Penalty: subCategory is "عام" when category was found
  if (item.subCategory === "عام" && item.category !== "متنوعات" && item.parsedBy !== "ai") {
    conf = Math.max(conf - 5, 30);
  }

  // Boost: user dictionary match (parsedBy check is implicit via confidence=100)
  if (item.confidence === 100) conf = 100;

  // Penalty: very large amounts in food/transport (likely misclassified)
  if (item.amount > 10000 && ["أكل وشرب", "مواصلات"].includes(item.category)) {
    conf = Math.min(conf, 60);
  }

  // Boost: amount makes sense for category
  if (item.amount <= 500 && ["أكل وشرب", "مواصلات"].includes(item.category)) {
    conf = Math.min(conf + 5, 100);
  }

  // Penalty: income with very small amount
  if (item.type === "income" && item.amount < 100) {
    conf = Math.min(conf, 70);
  }

  return { ...item, confidence: conf, needsReview: conf < 85 };
}

/**
 * Generate smart clarification questions
 */
function generateClarification(items: ParsedTransaction[], originalText: string): string | undefined {
  const hasAmbiguityFlags = items.some(i => (i.ambiguityFlags?.length || 0) > 0);
  if (hasAmbiguityFlags) {
    return "في تفاصيل مش واضحة (زي نوع العملية أو وجهتها). وضحها بكلمة واحدة عشان أصنف بدقة.";
  }

  // Check for ambiguous transfers
  if (originalText.match(/حولت|اديت|سلفت/) && !originalText.match(/حولت\s+ل|اديت\s+ل/)) {
    return "هل العملية دي:\n• تحويل لشخص؟\n• دين/سلفة؟\n• مصروف شخصي؟";
  }

  // Check for "حطيت فلوس" ambiguity
  if (originalText.match(/حطيت|حط|ودعت/)) {
    return "هل تقصد:\n• دخل (استلمت فلوس)؟\n• إيداع بنكي؟\n• تحويل؟";
  }

  // Check for approximate amounts
  if (originalText.match(/حوالي|تقريبا|كده/)) {
    return "المبلغ مش واضح بالظبط. ممكن تقولي الرقم بالظبط؟";
  }

  // Check for uncertain amounts
  if (originalText.match(/ولا\s+\d/)) {
    return "مش متأكد من المبلغ. ممكن تأكدلي؟";
  }

  // General low confidence
  if (items.length > 0 && items.every(i => i.confidence < 50)) {
    return "مش قادر أفهم العملية كويس. ممكن تكتبها بطريقة تانية؟";
  }

  return undefined;
}

/**
 * Score and decide on parsed transactions
 */
export function scoreAndDecide(
  items: ParsedTransaction[],
  originalText: string,
  thresholds = DEFAULT_THRESHOLDS,
  skipClarification = false
): ScoredResult {
  if (items.length === 0) {
    // If user skipped, never ask for clarification – tell them we can't parse it
    if (skipClarification) {
      return {
        items: [],
        overallConfidence: 0,
        decision: "review",
        clarificationQuestion: undefined,
      };
    }
    return {
      items: [],
      overallConfidence: 0,
      decision: "clarify",
      clarificationQuestion: "مش قادر أفهم. ممكن تكتب المصروف أو الدخل بطريقة أوضح؟",
    };
  }

  // Apply confidence adjustments
  let scoredItems = items.map(adjustConfidence);

  // Multi-transaction boost (if 4+ items and all have decent confidence, boost them)
  if (scoredItems.length >= 4 && scoredItems.every(i => i.confidence >= 60)) {
    scoredItems = scoredItems.map(i => ({ ...i, confidence: Math.min(i.confidence + 10, 100), needsReview: i.confidence + 10 < 85 }));
  }

  // Calculate overall confidence
  const overallConfidence = Math.round(
    scoredItems.reduce((sum, item) => sum + item.confidence, 0) / scoredItems.length
  );

  // Decision logic
  let decision: "auto_save" | "review" | "clarify";
  let clarificationQuestion: string | undefined;
  const hasCriticalMissingFields = scoredItems.some(i => !i.category || !i.subCategory || !i.amount);
  const hasIntentTaxonomyConflict = scoredItems.some(
    (i) => i.type === "income" && ["أكل وشرب", "خروجات", "خدمات سيارات", "التزامات يومية"].includes(i.category)
  );

  if (hasCriticalMissingFields || hasIntentTaxonomyConflict) {
    // If skip is active, downgrade clarify → review
    decision = skipClarification ? "review" : "clarify";
    clarificationQuestion = skipClarification ? undefined : generateClarification(scoredItems, originalText);
  } else if (overallConfidence >= thresholds.autoSave && scoredItems.every(i => i.confidence >= thresholds.autoSave)) {
    decision = "auto_save";
  } else if (overallConfidence >= thresholds.review) {
    decision = "review";
  } else {
    // Low confidence – clarify or review depending on skip flag
    decision = skipClarification ? "review" : "clarify";
    clarificationQuestion = skipClarification ? undefined : generateClarification(scoredItems, originalText);
  }

  return { items: scoredItems, overallConfidence, decision, clarificationQuestion };
}
