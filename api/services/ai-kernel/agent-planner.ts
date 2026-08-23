import { compileDataNeeds } from "./data-need-compiler";
import { routeIntent } from "./intent-router";
import { findCapability } from "./capability-registry";
import type { AgentTurnPlan, IntentResult } from "./types";
import { normalizePersonLookup } from "../../lib/fuzzy-match";

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

function clarificationFor(
  intent: IntentResult,
  contacts?: Array<{ id: number; name: string }>
): AgentTurnPlan["clarification"] | undefined {
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

  if (intent.kind === "finance_query" && intent.slots.personQuery && !intent.slots.contactId) {
    return {
      question: `مش لاقي حد بالاسم ده (${intent.slots.personQuery}) في جهات الاتصال بتاعتك. تحب تختار مين؟`,
      quickReplies: contacts && contacts.length > 0 ? contacts.map((c) => c.name).slice(0, 4) : ["إلغاء"],
      missing: ["contactId"],
    };
  }

  if (intent.kind === "action_request" || intent.kind === "expense_capture" || (intent.kind === "goal_planning" && intent.slots.actionName === "goal.create") || (intent.kind === "finance_query" && intent.slots.personQuery === "")) {
    const cap = findCapability(intent);
    if (cap && cap.requiredSlots && cap.requiredSlots.length > 0) {
      const missing = cap.requiredSlots.filter((slot) => {
        if (slot === "amount") return !hasAmount(query) && intent.slots.amount === undefined;
        return !(intent.slots as Record<string, unknown>)[slot];
      });
      if (missing.length > 0) {
        return (
          cap.clarificationTemplate ?? {
            question: `عشان أقدر أنفذ (${cap.description})، محتاج أعرف التفاصيل دي: ${missing.join("، ")}`,
            quickReplies: [],
            missing,
          }
        );
      }
    }
  }

  return undefined;
}

/**
 * Compiles one user turn into an explicit, bounded execution contract. This
 * is deliberately deterministic: no provider call is needed to decide what
 * data the provider would be allowed to see. Also handles restored prePlannedIntent.
 */
export function planAgentTurn(
  message: string,
  prePlannedIntent?: IntentResult,
  context?: { contacts?: Array<{ id: number; name: string }> }
): AgentTurnPlan {
  if (prePlannedIntent) {
    // Resolve contactId inside prePlannedIntent if possible
    if (prePlannedIntent.slots.personQuery && !prePlannedIntent.slots.contactId && context?.contacts) {
      const normalizedQuery = normalizePersonLookup(prePlannedIntent.slots.personQuery);
      if (normalizedQuery) {
        const matched = context.contacts
          .map((item) => ({ ...item, normalizedName: normalizePersonLookup(item.name) }))
          .filter((item) => item.normalizedName.length >= 2 && (normalizedQuery.includes(item.normalizedName) || item.normalizedName.includes(normalizedQuery)))
          .sort((left, right) => right.normalizedName.length - left.normalizedName.length)[0];
        if (matched) {
          prePlannedIntent.slots.contactId = matched.id;
          prePlannedIntent.slots.personQuery = matched.name;
        }
      }
    }

    const clarification = clarificationFor(prePlannedIntent, context?.contacts);
    if (clarification) {
      return {
        mode: "clarification",
        intent: prePlannedIntent,
        dataNeeds: [],
        historyMessages: 0,
        maxProviderCalls: 0,
        clarification,
        rationale: "preplanned_intent_still_missing_required_slots",
      };
    }

    const cap = findCapability(prePlannedIntent);
    const mode = asksForSynthesis(prePlannedIntent) || cap?.executionMode === "synthesis" ? "synthesis" : "deterministic";
    const historyMessages =
      prePlannedIntent.kind === "memory_question" ? 4 :
      prePlannedIntent.kind === "advice_request" || prePlannedIntent.kind === "goal_planning" ? 2 :
      prePlannedIntent.kind === "action_request" ? 1 : 0;

    return {
      mode,
      intent: prePlannedIntent,
      dataNeeds: compileDataNeeds(prePlannedIntent),
      historyMessages,
      maxProviderCalls: mode === "synthesis" ? 1 : 0,
      clarification: undefined,
      rationale: "restored_from_clarification_state",
    };
  }

  const intent = routeIntent(message);

  // Attempt to resolve contactId from context contacts
  if (intent.slots.personQuery && !intent.slots.contactId && context?.contacts) {
    const normalizedQuery = normalizePersonLookup(intent.slots.personQuery);
    if (normalizedQuery) {
      const matched = context.contacts
        .map((item) => ({ ...item, normalizedName: normalizePersonLookup(item.name) }))
        .filter((item) => item.normalizedName.length >= 2 && (normalizedQuery.includes(item.normalizedName) || item.normalizedName.includes(normalizedQuery)))
        .sort((left, right) => right.normalizedName.length - left.normalizedName.length)[0];
      if (matched) {
        intent.slots.contactId = matched.id;
        intent.slots.personQuery = matched.name;
      }
    }
  }

  const clarification = clarificationFor(intent, context?.contacts);
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

  const cap = findCapability(intent);
  const mode = asksForSynthesis(intent) || cap?.executionMode === "synthesis" ? "synthesis" : "deterministic";
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
    clarification: undefined,
    rationale: mode === "synthesis" ? "compact_fact_synthesis_required" : "facts_are_sufficient_or_no_provider_needed",
  };
}
