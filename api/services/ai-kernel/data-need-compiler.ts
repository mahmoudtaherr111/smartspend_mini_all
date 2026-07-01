import type { DataNeed, DataNeedKind, DataNeedPriority, IntentResult, PeriodHint } from "./types";

function makeNeed(
  index: number,
  kind: DataNeedKind,
  priority: DataNeedPriority,
  reason: string,
  scope: DataNeed["scope"] = {},
  maxRows?: number,
): DataNeed {
  const period = scope.period ?? "current_month";
  const keyParts = [kind, period, scope.category, scope.targetAmount, scope.granularity, scope.limit]
    .filter(Boolean)
    .join(":");

  return {
    id: `need_${index}_${kind.replace(".", "_")}`,
    kind,
    priority,
    reason,
    scope,
    maxRows,
    cache:
      kind === "none"
        ? undefined
        : {
            keyHint: keyParts,
            ttlSeconds: priority === "hot" ? 60 : 300,
            hot: priority === "hot",
          },
  };
}

function defaultPeriod(intent: IntentResult, fallback: PeriodHint = "current_month"): PeriodHint {
  return intent.slots.period ?? fallback;
}

function comparisonBasePeriod(intent: IntentResult): PeriodHint {
  const query = intent.slots.query ?? "";
  if (
    query.includes("الشهر ده") ||
    query.includes("هذا الشهر") ||
    query.includes("الشهر الحالي") ||
    query.includes("current month")
  ) {
    return "current_month";
  }
  return defaultPeriod(intent, "current_month");
}

function lastMonthsScope(query: string | undefined, months: number): DataNeed["scope"] | null {
  const text = (query ?? "").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const hasMonths = /(شهور|اشهر|شهر|months?)/i.test(text);
  const explicitNumber = new RegExp(`(^|\\D)${months}(\\D|$)`).test(text);
  if (!hasMonths || !explicitNumber) return null;

  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - (months - 1));
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  return {
    period: "custom",
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    granularity: "month",
  };
}

function isGoalProgressQuestion(intent: IntentResult): boolean {
  if (intent.slots.actionName) return false;
  const query = intent.slots.query ?? "";
  return [
    "وصلت",
    "تقدم",
    "نسبه",
    "نسبة",
    "باقي",
    "فاضل",
    "اهداف الادخار",
    "هدف الادخار",
    "progress",
  ].some((term) => query.includes(term));
}

function asksCategoryInclusion(intent: IntentResult): boolean {
  const query = intent.slots.query ?? "";
  return [
    "بتشمل",
    "تضم",
    "داخل",
    "يعني",
    "زي ايه",
    "مثل ماذا",
    "عبارة عن",
    "معناها",
    "تفاصيل",
    "محسوب",
    "حساب",
  ].some((term) => query.includes(term));
}

function goalTargetAmountFromQuery(query?: string): number | undefined {
  if (!query) return undefined;
  const text = query.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const match = text.match(/(\d+)(?:\s*(?:الف|ألف|جنية|جنيه|k|kilo))?/i);
  if (!match) return undefined;
  let amount = parseInt(match[1], 10);
  if (text.includes("الف") || text.includes("ألف") || text.toLowerCase().includes("k")) {
    if (amount < 1000) amount *= 1000;
  }
  return amount;
}

export function compileDataNeeds(intent: IntentResult): DataNeed[] {
  const needs: DataNeed[] = [];
  const add = (
    kind: DataNeedKind,
    priority: DataNeedPriority,
    reason: string,
    scope: DataNeed["scope"] = {},
    maxRows?: number,
  ) => {
    needs.push(makeNeed(needs.length + 1, kind, priority, reason, scope, maxRows));
  };

  switch (intent.kind) {
    case "finance_query": {
      const period = defaultPeriod(intent, "today");
      if (intent.slots.wallet) {
        add("wallet.summary", "hot", "wallet_balance_question_needs_wallet_summary", {}, 8);
      } else if (intent.slots.category) {
        add(
          "finance.category_total",
          "hot",
          "exact_category_total_for_finance_question",
          { period, category: intent.slots.category },
          1,
        );
      } else {
        add("finance.summary", "hot", "small_finance_question_needs_only_summary", { period }, 1);
      }
      if (intent.slots.needsEvidence) {
        add(
          "finance.transactions",
          "normal",
          "user_asked_for_evidence_rows",
          { period, category: intent.slots.category, limit: 12, transactionTypes: ["expense"] },
          12,
        );
      }
      if (intent.slots.category && asksCategoryInclusion(intent)) {
        add(
          "finance.category_inclusion",
          "normal",
          "explain_category_inclusion_for_user_question",
          { period, category: intent.slots.category, categories: intent.slots.categories },
          4,
        );
      }
      return needs;
    }

    case "finance_analysis": {
      const period = comparisonBasePeriod(intent);
      const isCompositeDrivers = intent.reason === "composite_comparison_drivers_match";
      const isBusiness = intent.reason === "business_cashflow_match";
      if (intent.reason === "classification_explanation_match") {
        add(
          "finance.transactions",
          "hot",
          "classification_question_needs_recent_matching_transactions",
          {
            period,
            category: intent.slots.category,
            categories: intent.slots.categories,
            limit: 12,
            transactionTypes: ["expense"],
          },
          12,
        );
        add(
          "finance.breakdown",
          "normal",
          "classification_question_needs_category_breakdown",
          { period, granularity: "category", limit: 8 },
          8,
        );
        add(
          "finance.category_inclusion",
          "normal",
          "explain_why_items_fall_under_category",
          { period, category: intent.slots.category, categories: intent.slots.categories },
          3,
        );
        return needs;
      }
      if (isBusiness) {
        add("finance.business_cashflow", "hot", "business_cashflow_with_plan", {
          period: "current_month",
          comparePeriod: "previous_month",
        }, 12);
        add("memory.search", "normal", "business_context_memory", { query: intent.slots.query, limit: 2 }, 2);
        return needs;
      }
      if (isCompositeDrivers || intent.slots.metric === "comparison") {
        add(
          "finance.period_comparison",
          "hot",
          "comparison_needs_current_and_previous_period_totals",
          { period, comparePeriod: "previous_month", category: intent.slots.category },
          2,
        );
        if (isCompositeDrivers || intent.slots.needsEvidence) {
          add(
            "finance.comparison_drivers",
            "normal",
            "explain_why_expense_changed_between_periods",
            { period, comparePeriod: "previous_month" },
            8,
          );
        }
        if (intent.slots.needsEvidence) {
          add(
            "finance.transactions",
            "deep",
            "comparison_requested_supporting_transactions",
            { period, category: intent.slots.category, limit: 10, transactionTypes: ["expense"] },
            10,
          );
        }
        return needs;
      }
      add("finance.summary", "hot", "analysis_needs_top_level_totals", { period }, 1);
      add(
        "finance.breakdown",
        "normal",
        "analysis_needs_grouped_breakdown_not_raw_rows",
        { period, category: intent.slots.category, granularity: intent.slots.category ? "merchant" : "category", limit: 8 },
        8,
      );
      if (intent.slots.needsEvidence) {
        add(
          "finance.transactions",
          "deep",
          "analysis_requested_supporting_transactions",
          { period, category: intent.slots.category, limit: 10, transactionTypes: ["expense"] },
          10,
        );
      }
      return needs;
    }

    case "goal_planning": {
      const period = defaultPeriod(intent, "current_month");
      if (isGoalProgressQuestion(intent)) {
        add("finance.goal_progress", "hot", "goal_progress_question_needs_active_goal_progress", {}, 8);
        return needs;
      }
      const isCompositePlan = intent.reason === "goal_with_plan_composite_match";
      add("profile.snapshot", "hot", "goal_planning_needs_income_and_profile_limits", {}, 1);
      add("goals.active", "hot", "avoid_duplicate_or_conflicting_goals", {}, 5);
      add("finance.summary", "normal", "goal_plan_needs_available_cash_context", { period }, 1);
      add("finance.breakdown", "normal", "goal_plan_needs_top_spending_levers", { period, granularity: "category", limit: 5 }, 5);
      if (isCompositePlan || intent.slots.actionName === "goal.create") {
        add("goal.feasibility", "normal", "estimate_feasibility_with_spending_levers", {
          period,
          targetAmount: goalTargetAmountFromQuery(intent.slots.query),
          query: intent.slots.query,
        }, 6);
        add("memory.search", "normal", "reuse_previous_goal_memories", { query: intent.slots.query, limit: 2 }, 2);
      }
      return needs;
    }

    case "action_request": {
      if (intent.slots.actionName === "expense.recategorize") {
        add(
          "finance.transaction_lookup",
          "hot",
          "recategorize_latest_matching_expense_requires_lookup",
          {
            period: defaultPeriod(intent, "current_month"),
            query: intent.slots.lookupQuery ?? intent.slots.query,
            sourceCategory: intent.slots.sourceCategory,
            targetCategory: intent.slots.targetCategory ?? intent.slots.category,
            limit: 1,
            transactionTypes: ["expense"],
          },
          1,
        );
        if (intent.slots.targetCategory ?? intent.slots.category) {
          add(
            "finance.category_inclusion",
            "normal",
            "recategorize_should_explain_target_category_rule",
            { period: defaultPeriod(intent, "current_month"), category: intent.slots.targetCategory ?? intent.slots.category },
            4,
          );
        }
        return needs;
      }
      add("profile.snapshot", "hot", "action_validation_needs_user_profile", {}, 1);
      add("goals.active", "normal", "generic_actions_may_depend_on_current_goals", {}, 5);
      return needs;
    }

    case "advice_request": {
      const period = defaultPeriod(intent, "current_month");
      add("profile.snapshot", "hot", "advice_needs_user_profile_limits", {}, 1);
      add("finance.summary", "hot", "advice_needs_current_financial_baseline", { period }, 1);
      if (intent.slots.category) {
        add(
          "finance.category_total",
          "hot",
          "exact_category_total_for_finance_question",
          { period, category: intent.slots.category },
          1,
        );
        add(
          "finance.category_inclusion",
          "normal",
          "category_total_needs_inclusion_explanation_for_trust",
          { period, category: intent.slots.category, categories: intent.slots.categories },
          4,
        );
      }
      add(
        "finance.breakdown",
        "normal",
        "advice_needs_small_spending_levers_not_raw_transactions",
        { period, category: intent.slots.category, granularity: intent.slots.category ? "merchant" : "category", limit: 6 },
        6,
      );
      add("goals.active", "normal", "advice_should_consider_active_goals", {}, 5);
      add("memory.search", "normal", "advice_should_reuse_relevant_user_preferences_and_old_plans", {
        query: intent.slots.query,
        limit: 4,
      }, 4);
      return needs;
    }

    case "site_help": {
      add("site_guide.search", "normal", "answer_should_use_product_knowledge_chunks", { query: intent.slots.query, limit: 4 }, 4);
      return needs;
    }

    case "memory_question": {
      add("memory.search", "normal", "user_is_asking_about_previous_conversation", { query: intent.slots.query, limit: 6 }, 6);
      return needs;
    }

    case "report_request": {
      const period = defaultPeriod(intent, "current_month");
      add("finance.summary", "hot", "report_needs_month_summary", { period }, 1);
      add("finance.breakdown", "normal", "report_needs_grouped_insights", { period, granularity: "category", limit: 10 }, 10);
      add("goals.active", "normal", "report_should_include_goal_progress_if_available", {}, 5);
      return needs;
    }

    case "chart_request": {
      const sixMonthScope = lastMonthsScope(intent.slots.query, 6);
      const period = sixMonthScope?.period ?? defaultPeriod(intent, "current_month");
      add("chart.data", "normal", "chart_request_needs_prepared_visual_dataset", {
        period,
        category: intent.slots.category,
        categories: intent.slots.categories,
        startDate: sixMonthScope?.startDate,
        endDate: sixMonthScope?.endDate,
        granularity: sixMonthScope?.granularity ?? (intent.slots.metric === "trend" ? "day" : "category"),
        limit: 12,
      });
      return needs;
    }

    case "expense_capture": {
      add("profile.snapshot", "hot", "expense_capture_needs_default_currency_and_wallet_context", {}, 1);
      return needs;
    }

    case "smalltalk":
    case "unknown":
    default:
      add("none", "hot", "no_external_data_needed_yet", {}, 0);
      return needs;
  }
}
