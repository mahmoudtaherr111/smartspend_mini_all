export type AIChannel = "chat" | "voice" | "report" | "system";

export type AIIntentKind =
  | "finance_query"
  | "finance_analysis"
  | "goal_planning"
  | "action_request"
  | "advice_request"
  | "site_help"
  | "memory_question"
  | "report_request"
  | "chart_request"
  | "expense_capture"
  | "smalltalk"
  | "unknown";

export type DataNeedKind =
  | "finance.summary"
  | "finance.category_total"
  | "finance.breakdown"
  | "finance.transactions"
  | "finance.transaction_lookup"
  | "finance.period_comparison"
  | "finance.comparison_drivers"
  | "finance.category_inclusion"
  | "finance.business_cashflow"
  | "finance.goal_progress"
  | "goal.feasibility"
  | "wallet.summary"
  | "memory.search"
  | "site_guide.search"
  | "chart.data"
  | "profile.snapshot"
  | "goals.active"
  | "none";

export type DataNeedPriority = "hot" | "normal" | "deep";

export type ActionRisk = "low" | "medium" | "high";

export type ActionStatus =
  | "draft"
  | "pending_confirmation"
  | "confirmed"
  | "executed"
  | "cancelled"
  | "failed";

export type PeriodHint =
  | "today"
  | "yesterday"
  | "current_week"
  | "current_month"
  | "previous_month"
  | "salary_cycle"
  | "custom";

export interface AIRequest {
  requestId?: string;
  channel: AIChannel;
  userId: number;
  userType: string;
  userPlan: string;
  message: string;
  conversationId?: number;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface IntentResult {
  kind: AIIntentKind;
  confidence: number;
  reason: string;
  slots: {
    period?: PeriodHint;
    category?: string;
    categories?: string[];
    metric?: "total" | "count" | "average" | "comparison" | "trend";
    actionName?: string;
    query?: string;
    lookupQuery?: string;
    sourceCategory?: string;
    targetCategory?: string;
    wallet?: boolean;
    needsEvidence?: boolean;
    needsChart?: boolean;
  };
  secondaryIntents?: AIIntentKind[];
}

export interface DataNeed {
  id: string;
  kind: DataNeedKind;
  priority: DataNeedPriority;
  reason: string;
  scope?: {
    period?: PeriodHint;
    comparePeriod?: PeriodHint;
    category?: string;
    categories?: string[];
    sourceCategory?: string;
    targetCategory?: string;
    targetAmount?: number;
    targetDate?: string;
    goalTitle?: string;
    query?: string;
    limit?: number;
    startDate?: string;
    endDate?: string;
    granularity?: "day" | "week" | "month" | "category" | "merchant";
    transactionTypes?: string[];
  };
  maxRows?: number;
  cache?: {
    keyHint: string;
    ttlSeconds: number;
    hot: boolean;
  };
}

export interface ResolvedFact {
  id: string;
  dataNeedId: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
  source: DataNeedKind | "manual" | "legacy";
  confidence: number;
  evidence?: Array<{
    id: string | number;
    label: string;
    value?: string | number | boolean | null;
  }>;
}

export interface Artifact {
  id: string;
  type:
    | "metric_card"
    | "table"
    | "chart"
    | "action_confirmation"
    | "quick_replies"
    | "text_block";
  title?: string;
  payload: Record<string, unknown>;
}

export interface ActionDraft {
  id: string;
  name: string;
  status: ActionStatus;
  risk: ActionRisk;
  confirmationRequired: boolean;
  summary: string;
  payload: Record<string, unknown>;
}

export interface TokenBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxFactTokens: number;
  maxMemoryTokens: number;
  maxHistoryTokens: number;
  maxToolRounds: number;
}

export interface ContextSection {
  name:
    | "intent"
    | "facts"
    | "memory"
    | "history"
    | "site_guide"
    | "actions"
    | "guardrails";
  priority: DataNeedPriority;
  tokenBudget: number;
  content: string;
}

export interface ContextPack {
  channel: AIChannel;
  tokenBudget: TokenBudget;
  estimatedInputTokens: number;
  sections: ContextSection[];
  dataNeeds: DataNeed[];
}

export type ResponseRecipe =
  | "answer_first"
  | "evidence_then_answer"
  | "drivers_then_plan"
  | "plan_with_confirmation"
  | "action_confirmation"
  | "ask_clarification"
  | "simple_deterministic";

export interface AIResponse {
  traceId: string;
  channel: AIChannel;
  content: string;
  intent: IntentResult;
  dataNeeds: DataNeed[];
  facts: ResolvedFact[];
  artifacts: Artifact[];
  actions: ActionDraft[];
  proposedActions?: ActionDraft[];
  recipe?: ResponseRecipe;
  tokenBudget: TokenBudget;
  model?: string;
  tokensUsed?: number;
  debug?: Record<string, unknown>;
}

export interface AITraceEvent {
  traceId: string;
  mode: "shadow" | "active";
  status: "success" | "error";
  channel: AIChannel;
  userId: number;
  userType: string;
  userPlan: string;
  conversationId?: number;
  intent: IntentResult;
  dataNeeds: DataNeed[];
  contextPack?: ContextPack;
  cacheHits: string[];
  cost: {
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedEmbeddingCalls: number;
    llmCalls: number;
  };
  latencyMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}
