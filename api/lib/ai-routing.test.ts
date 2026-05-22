import { describe, expect, it } from "vitest";
import {
  decideClassificationRoute,
  ruleEngineIsStrongEnough,
  estimateClassificationPromptTokens,
} from "./ai-routing";
import type { RuleEngineResult } from "./rule-engine";

describe("ai-routing", () => {
  it("accepts high-confidence rule engine for free without AI", () => {
    const rule: RuleEngineResult = {
      items: [{
        amount: 20,
        category: "أكل وشرب",
        subCategory: "قهوة وكافيه",
        description: "قهوة",
        type: "expense",
        confidence: 93,
        currency: "EGP",
        needsReview: false,
        parsedBy: "rule_engine",
      }],
      usedAI: false,
      needsAI: false,
    };
    const decision = decideClassificationRoute(rule, null, {
      plan: "free",
      textLength: 28,
      amountCount: 1,
      hasMultipleTransactions: false,
      knownNameMentioned: false,
    });
    expect(decision.useAi).toBe(false);
    expect(decision.acceptRuleEngine).toBe(true);
    expect(decision.route).toBe("rule_engine");
  });

  it("prefers embedding-only path for simple free cases when embedding is confident", () => {
    const rule: RuleEngineResult = {
      items: [{
        amount: 20,
        category: "متنوعات",
        subCategory: "عام",
        description: "شي",
        type: "expense",
        confidence: 40,
        currency: "EGP",
        needsReview: true,
        parsedBy: "rule_engine",
      }],
      usedAI: false,
      needsAI: true,
    };
    const decision = decideClassificationRoute(rule, {
      matches: [{ category: "أكل وشرب", subCategory: "قهوة وكافيه", score: 88, margin: 12, rawSimilarity: 0.82 }],
      isSimple: true,
      complexityScore: 20,
      segments: ["قهوة"],
      cacheHit: false,
    }, {
      plan: "free",
      textLength: 28,
      amountCount: 1,
      hasMultipleTransactions: false,
      knownNameMentioned: false,
    });
    expect(decision.route).toBe("embedding");
    expect(decision.useAi).toBe(false);
  });

  it("estimates compact prompts under 500 tokens for typical free input", () => {
    const system = "محلل مالي مصري.فئات:أكل وشرب:[مطعم,قهوة]";
    const user = 'نص:"شربت قهوة 20"';
    const est = estimateClassificationPromptTokens(system.length, user.length);
    expect(est).toBeLessThan(500);
  });

  it("routes Pro to AI-primary when rule confidence below 95%", () => {
    const rule: RuleEngineResult = {
      items: [{
        amount: 20,
        category: "أكل وشرب",
        subCategory: "قهوة وكافيه",
        description: "قهوة",
        type: "expense",
        confidence: 90,
        currency: "EGP",
        needsReview: false,
        parsedBy: "rule_engine",
      }],
      usedAI: false,
      needsAI: true,
    };
    const decision = decideClassificationRoute(rule, null, {
      plan: "pro",
      textLength: 20,
      amountCount: 1,
      hasMultipleTransactions: false,
      knownNameMentioned: false,
    });
    expect(decision.useAi).toBe(true);
    expect(decision.reason).toBe("pro_ai_primary");
  });

  it("accepts Pro trivial rule at 95% without AI", () => {
    const rule: RuleEngineResult = {
      items: [{
        amount: 20,
        category: "أكل وشرب",
        subCategory: "قهوة وكافيه",
        description: "قهوة",
        type: "expense",
        confidence: 96,
        currency: "EGP",
        needsReview: false,
        parsedBy: "rule_engine",
      }],
      usedAI: false,
      needsAI: false,
    };
    const decision = decideClassificationRoute(rule, null, {
      plan: "pro",
      textLength: 20,
      amountCount: 1,
      hasMultipleTransactions: false,
      knownNameMentioned: false,
    });
    expect(decision.acceptRuleEngine).toBe(true);
    expect(decision.useAi).toBe(false);
    expect(decision.reason).toBe("pro_trivial_rule_95");
  });

  it("ruleEngineIsStrongEnough rejects متنوعات", () => {
    expect(ruleEngineIsStrongEnough([{
      amount: 10,
      category: "متنوعات",
      subCategory: "عام",
      description: "x",
      type: "expense",
      confidence: 95,
      currency: "EGP",
      needsReview: false,
      parsedBy: "rule_engine",
    }], 88)).toBe(false);
  });
});
