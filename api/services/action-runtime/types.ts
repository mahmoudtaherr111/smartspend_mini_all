import type { ActionDraft, Artifact } from "../ai-kernel/types";

export type RuntimeActionName =
  | "goal.create"
  | "goal.update"
  | "goal.stop"
  | "expense.create"
  | "expense.recategorize"
  | "budget.create"
  | "profile.update"
  | "wallet.create"
  | "wallet.update"
  | "action.undo";

export type RuntimeActionStatus =
  | "draft"
  | "pending_confirmation"
  | "confirmed"
  | "executed"
  | "cancelled"
  | "failed";

export interface ActionRuntimeContext {
  userId: number;
  userType: string;
  userPlan: string;
  conversationId?: number;
}

export interface GoalCreatePayload {
  title: string;
  description?: string;
  targetAmount?: number;
  targetDate?: string;
}

export interface GoalUpdatePayload {
  goalId: number;
  title?: string;
  description?: string;
  targetAmount?: number;
  targetDate?: string;
  status?: "active" | "completed" | "cancelled";
}

export interface GoalStopPayload {
  goalId: number;
  reason?: string;
}

export interface ExpenseCreatePayload {
  amount: number;
  type?: "income" | "expense" | "transfer" | "investment";
  category: string;
  subCategory?: string;
  description?: string;
  rawText: string;
  date?: string;
  placeHint?: string;
}

export interface ExpenseRecategorizePayload {
  expenseId: number;
  category: string;
  subCategory?: string;
  reason?: string;
}

export interface BudgetCreatePayload {
  title: string;
  category?: string;
  monthlyLimit: number;
  linkedGoalId?: number;
}

export interface ProfileUpdatePayload {
  section: "basicInfo" | "financialInfo" | "lifestyleInfo" | "preferences";
  patch: Record<string, unknown>;
}

export interface WalletCreatePayload {
  name: string;
  provider: string;
  lastFourDigits?: string;
  balance?: string;
}

export interface WalletUpdatePayload {
  walletId: number;
  name?: string;
  provider?: string;
  lastFourDigits?: string;
  balance?: string;
}

export interface UndoPayload {
  targetActionMemoryId?: number;
  targetActionName?: RuntimeActionName;
}

export type RuntimeActionPayload =
  | GoalCreatePayload
  | GoalUpdatePayload
  | GoalStopPayload
  | ExpenseCreatePayload
  | ExpenseRecategorizePayload
  | BudgetCreatePayload
  | ProfileUpdatePayload
  | WalletCreatePayload
  | WalletUpdatePayload
  | UndoPayload;

export interface PendingActionRecord {
  id: number;
  userId: number;
  userType: string;
  conversationId?: number | null;
  actionName: RuntimeActionName;
  status: RuntimeActionStatus;
  risk: "low" | "medium" | "high";
  summary: string;
  payload: RuntimeActionPayload;
  expiresAt: Date;
}

export interface ActionExecutionResult {
  actionId: number;
  actionName: RuntimeActionName;
  status: RuntimeActionStatus;
  message: string;
  result?: Record<string, unknown>;
  artifact?: Artifact;
  artifacts?: Artifact[];
}

export interface ActionDraftResult {
  action: ActionDraft;
  artifact: Artifact;
}
