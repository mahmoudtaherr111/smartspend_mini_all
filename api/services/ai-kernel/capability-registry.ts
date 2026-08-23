import type { 
  AIIntentKind, 
  DataNeedKind, 
  ResponseRecipe, 
  AgentExecutionMode, 
  ActionRisk,
  IntentResult
} from "./types";

export interface CapabilityDef {
  id: string;
  intentKind: AIIntentKind;
  description: string;
  requiredSlots: string[];
  optionalSlots: string[];
  dataNeedKinds: DataNeedKind[];
  responseRecipe: ResponseRecipe;
  executionMode: AgentExecutionMode;
  maxProviderCalls: 0 | 1;
  actionPolicy?: {
    actionName: string;
    risk: ActionRisk;
    confirmationRequired: boolean;
  };
  clarificationTemplate?: {
    question: string;
    quickReplies: string[];
    missing: string[];
  };
}

export const CAPABILITIES: CapabilityDef[] = [
  {
    id: "daily_total",
    intentKind: "finance_query",
    description: "حساب إجمالي مصاريف اليوم الحالي",
    requiredSlots: ["period"],
    optionalSlots: ["category", "needsEvidence"],
    dataNeedKinds: ["finance.summary"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "weekly_total",
    intentKind: "finance_query",
    description: "حساب إجمالي مصاريف الأسبوع الحالي",
    requiredSlots: ["period"],
    optionalSlots: ["category", "needsEvidence"],
    dataNeedKinds: ["finance.summary"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "monthly_total",
    intentKind: "finance_query",
    description: "حساب إجمالي مصاريف الشهر الحالي",
    requiredSlots: ["period"],
    optionalSlots: ["category", "needsEvidence"],
    dataNeedKinds: ["finance.summary"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "salary_cycle_total",
    intentKind: "finance_query",
    description: "حساب إجمالي مصاريف دورة المرتب الحالية",
    requiredSlots: ["period"],
    optionalSlots: ["category", "needsEvidence"],
    dataNeedKinds: ["finance.summary"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "period_comparison",
    intentKind: "finance_analysis",
    description: "مقارنة المصاريف بين فترتين ماليتين مختلفة مع معالجة zero baseline",
    requiredSlots: ["period"],
    optionalSlots: ["category", "metric"],
    dataNeedKinds: ["finance.period_comparison", "finance.comparison_drivers"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "category_analysis",
    intentKind: "finance_analysis",
    description: "تحليل توزيع المصاريف حسب الفئات المختلفة لتقديم إحصائيات دقيقة",
    requiredSlots: [],
    optionalSlots: ["period", "needsChart"],
    dataNeedKinds: ["finance.breakdown"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "person_spending",
    intentKind: "finance_query",
    description: "حساب إجمالي المبالغ المنصرفة لشخص أو جهة معينة عبر contact_id",
    requiredSlots: ["contactId"],
    optionalSlots: ["period", "needsEvidence"],
    dataNeedKinds: ["finance.person_total", "finance.transactions"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0,
    clarificationTemplate: {
      question: "مين الشخص اللي تحب أحسبلك صرفت عليه كام؟ اكتب اسمه بالظبط.",
      quickReplies: ["ماما", "أحمد", "بابا"],
      missing: ["contactId"]
    }
  },
  {
    id: "classification_explain",
    intentKind: "finance_analysis",
    description: "شرح سبب تصنيف معاملة معينة بالاعتماد على Trace ID المخزن",
    requiredSlots: ["category"], // requires category to explain
    optionalSlots: ["lookupQuery"],
    dataNeedKinds: ["finance.classification_trace", "finance.transactions"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "expense_capture",
    intentKind: "expense_capture",
    description: "تسجيل معاملة مالية جديدة (مصروف أو دخل) كمسودة تحتاج لتأكيد المستخدم",
    requiredSlots: ["amount"],
    optionalSlots: ["category", "description", "wallet"],
    dataNeedKinds: ["none"],
    responseRecipe: "plan_with_confirmation",
    executionMode: "deterministic",
    maxProviderCalls: 0,
    actionPolicy: {
      actionName: "expense.create",
      risk: "low",
      confirmationRequired: true
    },
    clarificationTemplate: {
      question: "تمام، اكتبلي المبلغ واتصرف في إيه أو لمين عشان أجهز العملية للمراجعة.",
      quickReplies: ["دفعت ٢٠٠ مواصلات", "اشتريت أكل بـ٣٥٠", "حولت ٥٠٠ لصاحبي"],
      missing: ["amount"]
    }
  },
  {
    id: "expense_recategorize",
    intentKind: "action_request",
    description: "تعديل أو إعادة تصنيف معاملة مالية سابقة كمسودة آمنة",
    requiredSlots: ["targetCategory"],
    optionalSlots: ["sourceCategory", "lookupQuery"],
    dataNeedKinds: ["finance.transaction_lookup"],
    responseRecipe: "plan_with_confirmation",
    executionMode: "deterministic",
    maxProviderCalls: 0,
    actionPolicy: {
      actionName: "expense.recategorize",
      risk: "low",
      confirmationRequired: true
    }
  },
  {
    id: "goal_progress",
    intentKind: "goal_planning",
    description: "تتبع التقدم في أهداف الادخار والحصول على ملخص بالحالة الحالية",
    requiredSlots: [],
    optionalSlots: ["period"],
    dataNeedKinds: ["finance.goal_progress"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "goal_create",
    intentKind: "goal_planning",
    description: "إنشاء هدف ادخار مالي جديد مبني على إمكانيات المستخدم الفعلية وبخطة واضحة",
    requiredSlots: ["amount"],
    optionalSlots: ["goalName", "period"],
    dataNeedKinds: ["goals.active", "finance.summary", "goal.feasibility"],
    responseRecipe: "plan_with_confirmation",
    executionMode: "synthesis",
    maxProviderCalls: 1,
    actionPolicy: {
      actionName: "goal.create",
      risk: "low",
      confirmationRequired: true
    },
    clarificationTemplate: {
      question: "عايز توصل لكام، وفي خلال قد إيه؟",
      quickReplies: ["٢٠ ألف خلال ٦ شهور", "١٠٠ ألف في سنة"],
      missing: ["amount"]
    }
  },
  {
    id: "budget_create",
    intentKind: "action_request",
    description: "تحديد ميزانية جديدة لفئة مصروفات معينة",
    requiredSlots: ["category", "amount"],
    optionalSlots: ["period"],
    dataNeedKinds: ["finance.summary"],
    responseRecipe: "plan_with_confirmation",
    executionMode: "deterministic",
    maxProviderCalls: 0,
    actionPolicy: {
      actionName: "budget.create",
      risk: "medium",
      confirmationRequired: true
    }
  },
  {
    id: "memory_recall",
    intentKind: "memory_question",
    description: "استرجاع معلومات وتفضيلات سابقة حفظها المستخدم (معجمية أولاً)",
    requiredSlots: ["query"],
    optionalSlots: [],
    dataNeedKinds: ["memory.search"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "memory_forget",
    intentKind: "action_request",
    description: "مسح أو نسيان تفضيل/معلومة معينة بإذن المستخدم المباشر",
    requiredSlots: ["query"],
    optionalSlots: [],
    dataNeedKinds: ["memory.search"],
    responseRecipe: "action_confirmation",
    executionMode: "deterministic",
    maxProviderCalls: 0,
    actionPolicy: {
      actionName: "memory.forget",
      risk: "high",
      confirmationRequired: true
    }
  },
  {
    id: "site_help",
    intentKind: "site_help",
    description: "تقديم مساعدة في كيفية استخدام التطبيق وربط الحسابات استناداً لمحتوى مراجع فقط",
    requiredSlots: [],
    optionalSlots: ["query"],
    dataNeedKinds: ["site_guide.search"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "financial_advice",
    intentKind: "advice_request",
    description: "توجيه خطة مالية أو نصيحة ادخار شخصية محددة بالاعتماد على الـ facts المسترجعة فقط وبدون اختراع أرقام",
    requiredSlots: [],
    optionalSlots: ["query"],
    dataNeedKinds: ["profile.snapshot", "finance.summary", "finance.breakdown", "goals.active", "memory.search"],
    responseRecipe: "answer_first",
    executionMode: "synthesis",
    maxProviderCalls: 1
  },
  {
    id: "wallet_balance",
    intentKind: "finance_query",
    description: "استعراض أرصدة المحافظ البنكية والإلكترونية النشطة",
    requiredSlots: [],
    optionalSlots: ["wallet"],
    dataNeedKinds: ["wallet.summary"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "business_cashflow",
    intentKind: "finance_analysis",
    description: "تحليل التدفق النقدي وصافي الربحية لمشروع Freelance منفصل تماماً عن الحسابات الشخصية",
    requiredSlots: [],
    optionalSlots: ["period"],
    dataNeedKinds: ["finance.business_cashflow", "profile.snapshot"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  },
  {
    id: "smalltalk",
    intentKind: "smalltalk",
    description: "الرد التلقائي على التحيات والدردشات البسيطة بمصري ودود وبدون تكاليف ذكاء اصطناعي",
    requiredSlots: [],
    optionalSlots: ["query"],
    dataNeedKinds: ["none"],
    responseRecipe: "simple_deterministic",
    executionMode: "deterministic",
    maxProviderCalls: 0
  }
];

export function findCapability(intentResult: IntentResult): CapabilityDef | undefined {
  const query = intentResult.slots.query ?? "";

  // 1. Expense recategorize request
  if (intentResult.kind === "action_request" && intentResult.slots.actionName === "expense.recategorize") {
    return getCapabilityById("expense_recategorize");
  }

  // 2. Goal creation or planning
  if (intentResult.kind === "goal_planning") {
    if (intentResult.slots.actionName === "goal.create") {
      return getCapabilityById("goal_create");
    }
    return getCapabilityById("goal_progress");
  }

  // 3. Capture expense
  if (intentResult.kind === "expense_capture") {
    return getCapabilityById("expense_capture");
  }

  // 4. Memory questions
  if (intentResult.kind === "memory_question") {
    return getCapabilityById("memory_recall");
  }

  // 5. Memory forget request
  if (intentResult.kind === "action_request" && intentResult.slots.actionName === "memory.forget") {
    return getCapabilityById("memory_forget");
  }

  // 6. Help / Guide queries
  if (intentResult.kind === "site_help") {
    return getCapabilityById("site_help");
  }

  // 7. General finance queries & metrics
  if (intentResult.kind === "finance_query") {
    if (intentResult.slots.wallet) {
      return getCapabilityById("wallet_balance");
    }
    if (intentResult.slots.personQuery) {
      return getCapabilityById("person_spending");
    }
    
    // Period checks
    const period = intentResult.slots.period;
    if (period === "today") return getCapabilityById("daily_total");
    if (period === "current_week") return getCapabilityById("weekly_total");
    if (period === "current_month") return getCapabilityById("monthly_total");
    if (period === "salary_cycle") return getCapabilityById("salary_cycle_total");
    
    return getCapabilityById("monthly_total"); // fallback query
  }

  // 8. Finance analysis queries
  if (intentResult.kind === "finance_analysis") {
    if (intentResult.reason === "business_cashflow_match") {
      return getCapabilityById("business_cashflow");
    }
    if (intentResult.reason === "classification_explanation_match") {
      return getCapabilityById("classification_explain");
    }
    if (intentResult.reason === "composite_comparison_drivers_match" || intentResult.slots.metric === "comparison") {
      return getCapabilityById("period_comparison");
    }
    return getCapabilityById("category_analysis");
  }

  // 9. Advice / Planning queries
  if (intentResult.kind === "advice_request") {
    return getCapabilityById("financial_advice");
  }

  // 10. Smalltalk
  if (intentResult.kind === "smalltalk") {
    return getCapabilityById("smalltalk");
  }

  return undefined;
}

export function getCapabilityById(id: string): CapabilityDef | undefined {
  return CAPABILITIES.find(c => c.id === id);
}

export function isDeterministicCapability(capId: string): boolean {
  const cap = getCapabilityById(capId);
  return cap ? cap.executionMode === "deterministic" : false;
}

export function requiresConfirmation(capId: string): boolean {
  const cap = getCapabilityById(capId);
  return cap?.actionPolicy ? cap.actionPolicy.confirmationRequired : false;
}
