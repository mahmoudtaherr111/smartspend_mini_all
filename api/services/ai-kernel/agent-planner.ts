import { compileDataNeeds } from "./data-need-compiler";
import { routeIntent } from "./intent-router";
import type { AgentTurnPlan, IntentResult } from "./types";

function hasAmount(text: string): boolean {
  return /\d|[٠-٩۰-۹]/.test(text);
}

function asksForSynthesis(intent: IntentResult): boolean {
  const query = intent.slots.query ?? "";
  return (
    intent.kind === "advice_request" ||
    intent.kind === "goal_planning" ||
    /(?:ليه|لماذا|السبب|خطة|خطط|اقترح|اعمل ايه|أعمل ايه|نصحني|نصيحة|حلل)/i.test(query) ||
    [
      "composite_comparison_drivers_match",
      "business_cashflow_match",
      "goal_with_plan_composite_match",
      "finance_planning_composite_match",
    ].includes(intent.reason)
  );
}

function clarificationFor(intent: IntentResult): AgentTurnPlan["clarification"] | undefined {
  const query = intent.slots.query ?? "";

  if (intent.kind === "unknown") {
    return {
      question: "تحب أعرفك إيه بالظبط: مصاريفك، تحليل الشهر، هدف، ولا طريقة استخدام التطبيق؟",
      quickReplies: ["مصاريف النهارده", "حلل الشهر", "اعمل هدف", "مساعدة في التطبيق"],
      missing: ["intent"],
    };
  }

  if (intent.kind === "expense_capture" && !hasAmount(query)) {
    return {
      question: "تمام، اكتبلي المبلغ واتصرف في إيه أو لمين عشان أجهز العملية للمراجعة.",
      quickReplies: ["دفعت ٢٠٠ مواصلات", "اشتريت أكل بـ٣٥٠", "حولت ٥٠٠ لصاحبي"],
      missing: ["amount", "transaction_context"],
    };
  }

  if (intent.kind === "goal_planning" && intent.slots.actionName === "goal.create" && !hasAmount(query)) {
    return {
      question: "عايز توصل لكام، وفي خلال قد إيه؟",
      quickReplies: ["٢٠ ألف خلال ٦ شهور", "١٠٠ ألف في سنة"],
      missing: ["target_amount", "target_date"],
    };
  }

  return undefined;
}

/**
 * Compiles one user turn into an explicit, bounded execution contract.  This
 * is deliberately deterministic: no provider call is needed to decide what
 * data the provider would be allowed to see.
 */
export function planAgentTurn(message: string): AgentTurnPlan {
  const intent = routeIntent(message);
  const clarification = clarificationFor(intent);
  if (clarification) {
    return {
      mode: "clarification",
      intent,
      dataNeeds: [],
      historyMessages: 0,
      maxProviderCalls: 0,
      clarification,
      rationale: "one_required_slot_is_missing",
    };
  }

  const mode = asksForSynthesis(intent) ? "synthesis" : "deterministic";
  const historyMessages =
    intent.kind === "memory_question" ? 4 :
    intent.kind === "advice_request" || intent.kind === "goal_planning" ? 2 :
    intent.kind === "action_request" ? 1 : 0;

  return {
    mode,
    intent,
    dataNeeds: compileDataNeeds(intent),
    historyMessages,
    maxProviderCalls: mode === "synthesis" ? 1 : 0,
    rationale: mode === "synthesis" ? "compact_fact_synthesis_required" : "facts_are_sufficient_or_no_provider_needed",
  };
}
