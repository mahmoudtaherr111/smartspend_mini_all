import type {
  ActionRisk,
  ActionStatus,
  Artifact,
  DataNeed,
  PeriodHint,
  ResolvedFact,
} from "../ai-kernel/types";
import type { EmbeddingApiStatus, RetrievalPolicy } from "../ai-kernel/retrieval-policy";
import type { RuntimeActionName, RuntimeActionPayload } from "../action-runtime/types";

export type VoiceSessionStatus = "active" | "ended";

export interface VoicePendingAction {
  id: string;
  actionName: RuntimeActionName;
  risk: ActionRisk;
  status: ActionStatus;
  summary: string;
  payload: RuntimeActionPayload;
  requiresUiConfirmation: boolean;
  dbActionId?: number;
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface VoiceSessionState {
  sessionId: string;
  userId: number;
  userType: string;
  userPlan: string;
  status: VoiceSessionStatus;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
  pendingActions: VoicePendingAction[];
  prefetch?: VoicePrefetchState;
}

export interface VoicePrefetchState {
  transcript: string;
  intentKind: string;
  dataNeedKinds: string[];
  factsPreview: Array<{ label: string; value: string | number | boolean | null }>;
  cacheHits: string[];
  errors: string[];
  startedAt: string;
  completedAt?: string;
}

export interface VoiceSessionInput {
  userId: number;
  userType: string;
  userPlan: string;
  sessionId?: string;
}

export interface VoiceFinanceSnapshot {
  period: string;
  totalIncome: number;
  totalExpense: number;
  netFlow: number;
  transactionCount: number;
  dailyAverageExpense?: number;
}

export interface VoiceGoalSnapshot {
  id: number;
  title: string;
  targetAmount: number;
  targetDate?: string | null;
  estimatedMonthlyCapacity: number;
  estimatedMonthsNeeded?: number | null;
}

export interface VoiceProfileSnapshot {
  monthlyIncome: number | null;
  financialGoal: string | null;
  financialPersonality: string | null;
  salaryDay: number;
}

export interface VoiceHotContext {
  profile?: VoiceProfileSnapshot;
  today?: VoiceFinanceSnapshot;
  month?: VoiceFinanceSnapshot;
  activeGoals: VoiceGoalSnapshot[];
  recentCapsules: string[];
  errors: string[];
}

export interface VoiceToolExecutionContext {
  userId: number;
  userType: string;
  userPlan: string;
  sessionId: string;
}

export type VoiceToolName =
  | "finance_query"
  | "memory_search"
  | "action_draft"
  | "action_confirm"
  | "action_cancel";

export type VoiceFinanceQueryKind =
  | "summary"
  | "wallet_summary"
  | "period_comparison"
  | "category_total"
  | "breakdown"
  | "transactions"
  | "chart"
  | "goal_progress";

export interface VoiceToolRequest {
  toolName: string;
  args: Record<string, unknown>;
  ctx: VoiceToolExecutionContext;
}

export interface VoiceToolSuccess {
  ok: true;
  tool: VoiceToolName;
  facts?: ResolvedFact[];
  artifacts?: Artifact[];
  dataNeeds?: DataNeed[];
  cacheHits?: string[];
  retrievalPolicy?: RetrievalPolicy;
  embeddingApiStatus?: EmbeddingApiStatus;
  result?: Record<string, unknown>;
  action?: VoicePendingAction;
  message?: string;
}

export interface VoiceToolFailure {
  ok: false;
  tool: string;
  error: string;
  requiresUiConfirmation?: boolean;
  result?: Record<string, unknown>;
}

export type VoiceToolResponse = VoiceToolSuccess | VoiceToolFailure;

export interface VoiceArchiveMessage {
  role: "user" | "assistant";
  content: string;
}

export interface VoiceArchiveInput {
  userId: number;
  userType: string;
  sessionId: string;
  transcript: VoiceArchiveMessage[];
}

export type VoicePeriodHint = PeriodHint | "salary_cycle";
