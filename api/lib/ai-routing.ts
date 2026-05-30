/**
 * Plan-aware classification routing (Free vs Pro vs Ultra).
 * Free: maximize rule/embedding paths, minimal LLM tokens.
 * Pro/Ultra: AI-primary; rule engine only for trivial 95%+ cases.
 */
import type { PlanId } from "./ai-usage-policy";
import type { ParsedTransaction, RuleEngineResult } from "./rule-engine";
import type { EmbeddingResult } from "./embedding-engine";

export type ClassificationRoute = "rule_engine" | "embedding" | "ai" | "hybrid";

/** Pro accepts backend-only when every item is ≥ this confidence */
export const PRO_RULE_TRIVIAL_THRESHOLD = 95;

export interface RoutingContext {
  plan: PlanId;

  textLength: number;
  amountCount: number;
  hasMultipleTransactions: boolean;
  knownNameMentioned: boolean;
  personMentioned: boolean;
}

export interface RoutingDecision {
  route: ClassificationRoute;
  useAi: boolean;
  useEmbedding: boolean;
  acceptRuleEngine: boolean;
  ruleConfidenceFloor: number;
  runDisputeResolution: boolean;
  includeRichAiContext: boolean;
  maxAiOutputTokens: number;
  reason: string;
}

const PLAN_DEFAULTS: Record<
  PlanId,
  Omit<
    RoutingDecision,
    "route" | "useAi" | "useEmbedding" | "acceptRuleEngine" | "reason"
  >
> = {
  free: {
    ruleConfidenceFloor: 88,
    runDisputeResolution: false,
    includeRichAiContext: false,
    maxAiOutputTokens: 300,
  },
  pro: {
    ruleConfidenceFloor: PRO_RULE_TRIVIAL_THRESHOLD,
    runDisputeResolution: true,
    includeRichAiContext: true,
    maxAiOutputTokens: 1000,
  },
  ultra: {
    ruleConfidenceFloor: PRO_RULE_TRIVIAL_THRESHOLD,
    runDisputeResolution: true,
    includeRichAiContext: true,
    maxAiOutputTokens: 1500,
  },
};

export function ruleEngineIsStrongEnough(
  items: ParsedTransaction[],
  floor: number,
): boolean {
  if (items.length === 0) return false;
  return items.every(
    (it) => it.category !== "متنوعات" && it.confidence >= floor,
  );
}

export function isProTrivialRuleResult(items: ParsedTransaction[]): boolean {
  return (
    ruleEngineIsStrongEnough(items, PRO_RULE_TRIVIAL_THRESHOLD) &&
    items.every((item) => {
      const flags = item.ambiguityFlags || [];
      const trustedUserOrMerchant =
        item.inferenceSource === "dictionary" &&
        (item.confidence >= 100 ||
          flags.includes("merchant_registry_hit") ||
          item.category === "العائلة");
      const deterministicRule =
        item.inferenceSource === "rule" &&
        item.confidence >= 98 &&
        flags.length === 0;
      return trustedUserOrMerchant || deterministicRule;
    })
  );
}

export function shouldForceAi(
  ruleResult: RuleEngineResult,
  ctx: RoutingContext,
  floor: number,
): boolean {
  const isFamilyTransaction =
    ruleResult.items.length > 0 &&
    ruleResult.items.every(
      (item) => item.category === "العائلة" && item.confidence >= floor,
    );

  // If ANY person is mentioned (known or unknown), force AI so it can ask for clarification if needed
  if (!isFamilyTransaction && ctx.personMentioned) return true;
  if (!isFamilyTransaction && ctx.knownNameMentioned) return true;
  if (ruleResult.items.length === 0) return true;

  if (ctx.plan === "pro" || ctx.plan === "ultra") {
    return !isProTrivialRuleResult(ruleResult.items);
  }

  if (!ruleEngineIsStrongEnough(ruleResult.items, floor)) return true;
  return !!ruleResult.needsAI;
}

export function decideClassificationRoute(
  ruleResult: RuleEngineResult,
  embeddingResult: EmbeddingResult | null,
  ctx: RoutingContext,
): RoutingDecision {
  const defaults = PLAN_DEFAULTS[ctx.plan];
  const floor = defaults.ruleConfidenceFloor;
  const isPaid = ctx.plan === "pro" || ctx.plan === "ultra";

  const acceptRule =
    ruleResult.items.length > 0 &&
    (!ctx.knownNameMentioned ||
      ruleResult.items.every((i) => i.category === "العائلة")) &&
    (isPaid
      ? isProTrivialRuleResult(ruleResult.items)
      : ruleEngineIsStrongEnough(ruleResult.items, floor));

  if (acceptRule) {
    return {
      route: "rule_engine",
      useAi: false,
      useEmbedding: false,
      acceptRuleEngine: true,
      ...defaults,
      reason: isPaid ? "pro_trivial_rule_95" : "high_confidence_rule_engine",
    };
  }

  const embeddingReady =
    embeddingResult?.isSimple === true &&
    (embeddingResult.matches?.length ?? 0) > 0;

  // Free: embedding can fully replace LLM
  if (embeddingReady && ctx.plan === "free") {
    return {
      route: "embedding",
      useAi: false,
      useEmbedding: true,
      acceptRuleEngine: false,
      ...defaults,
      reason: "free_embedding_confident",
    };
  }

  // Pro/Ultra: AI-primary — skip embedding-only shortcut
  if (isPaid) {
    const hasRuleHints = ruleResult.items.some((it) => it.confidence >= 60);
    return {
      route: hasRuleHints ? "hybrid" : "ai",
      useAi: true,
      useEmbedding: false,
      acceptRuleEngine: false,
      ...defaults,
      reason: "pro_ai_primary",
    };
  }

  const forceAi = shouldForceAi(ruleResult, ctx, floor);
  if (!forceAi && ruleResult.items.length > 0) {
    return {
      route: "rule_engine",
      useAi: false,
      useEmbedding: false,
      acceptRuleEngine: true,
      ...defaults,
      reason: "rule_engine_fallback",
    };
  }

  const hasRuleHints = ruleResult.items.some((it) => it.confidence >= 60);
  return {
    route: hasRuleHints ? "hybrid" : "ai",
    useAi: true,
    useEmbedding: !embeddingReady,
    acceptRuleEngine: false,
    ...defaults,
    reason: forceAi ? "ai_required" : "hybrid_enrichment",
  };
}

export function estimateClassificationPromptTokens(
  systemChars: number,
  userChars: number,
): number {
  return Math.ceil((systemChars + userChars) / 3.2) + 48;
}
