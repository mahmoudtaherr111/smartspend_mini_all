import { and, eq } from "drizzle-orm";
import { aiActionAuditLogs, aiActionMemory, aiPendingActions } from "../../../db/schema";
import { db } from "../../queries/connection";
import { invalidateMemoryUserCache } from "../ai-memory";
import { recordAICostMetric } from "../ai-cost-policy";
import type { ActionDraft, Artifact } from "../ai-kernel/types";
import { actionConfirmationArtifact, actionSummary, goalSummary } from "./artifacts";
import {
  createBudgetSuggestionFromGoal,
  createPhase8PayloadFromMessage,
  executeRuntimeAction,
  validateRuntimeAction,
} from "./extended-actions";
import {
  createGoalPayloadFromMessage,
  executeGoalCreate,
  validateGoalCreate,
} from "./goal-create";
import type {
  ActionDraftResult,
  ActionExecutionResult,
  ActionRuntimeContext,
  GoalCreatePayload,
  PendingActionRecord,
  RuntimeActionPayload,
  RuntimeActionName,
} from "./types";

export * from "./types";
export {
  actionConfirmationArtifact,
  actionSummary,
  goalSummary,
} from "./artifacts";
export {
  createBudgetPayloadFromMessage,
  createBudgetSuggestionFromGoal,
  createExpensePayloadFromMessage,
  createExpenseRecategorizePayloadFromMessage,
  createPhase8PayloadFromMessage,
  createGoalStopPayloadFromMessage,
  createGoalUpdatePayloadFromMessage,
  createProfileUpdatePayloadFromMessage,
  createUndoPayloadFromMessage,
  createWalletPayloadFromMessage,
  createWalletUpdatePayloadFromMessage,
  executeRuntimeAction,
  validateRuntimeAction,
} from "./extended-actions";
export {
  createGoalPayloadFromMessage,
  executeGoalCreate,
  goalCreatePayloadSchema,
  isGoalCreateRequest,
  validateGoalCreate,
} from "./goal-create";

const ACTION_TTL_MINUTES = 30;

function expiresAt(): Date {
  const date = new Date();
  const timezoneSafetyMinutes = Math.max(0, -date.getTimezoneOffset());
  date.setMinutes(date.getMinutes() + ACTION_TTL_MINUTES + timezoneSafetyMinutes);
  return date;
}

function parsePayload(value: unknown): RuntimeActionPayload {
  if (value && typeof value === "object") return value as RuntimeActionPayload;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed as RuntimeActionPayload;
    } catch {
      // Fall through to the safe fallback below.
    }
  }
  return { title: "هدف ادخار جديد" };
}

function actionRisk(actionName: RuntimeActionName): ActionDraft["risk"] {
  if (actionName === "action.undo" || actionName === "goal.stop") return "high";
  if (
    actionName === "profile.update" ||
    actionName === "wallet.create" ||
    actionName === "wallet.update" ||
    actionName === "goal.update" ||
    actionName === "expense.recategorize"
  ) {
    return "medium";
  }
  return "medium";
}

function toActionDraft(id: number, actionName: RuntimeActionName, payload: RuntimeActionPayload): ActionDraft {
  return {
    id: String(id),
    name: actionName,
    status: "pending_confirmation",
    risk: actionRisk(actionName),
    confirmationRequired: true,
    summary: actionSummary(actionName, payload),
    payload: { ...payload },
  };
}

async function audit(
  ctx: ActionRuntimeContext,
  actionId: number | null,
  actionName: RuntimeActionName,
  event: string,
  status: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(aiActionAuditLogs).values({
    actionId,
    userId: ctx.userId,
    userType: ctx.userType,
    actionName,
    event,
    status,
    metadata,
  });
}

export async function createPendingRuntimeAction(
  ctx: ActionRuntimeContext,
  actionName: RuntimeActionName,
  payload: RuntimeActionPayload,
): Promise<ActionDraftResult> {
  const validated = await validateRuntimeAction(ctx, actionName, payload);
  const [inserted] = await db.insert(aiPendingActions).values({
    userId: ctx.userId,
    userType: ctx.userType,
    conversationId: ctx.conversationId,
    actionName,
    status: "pending_confirmation",
    risk: actionRisk(actionName),
    summary: actionSummary(actionName, validated),
    payload: validated,
    expiresAt: expiresAt(),
  });
  const actionId = Number((inserted as any)?.insertId || 0);
  await audit(ctx, actionId, actionName, "draft_created", "pending_confirmation", {
    conversationId: ctx.conversationId,
  });
  void recordAICostMetric({
    userId: ctx.userId,
    userType: ctx.userType,
    channel: "action",
    plan: ctx.userPlan,
    intentKind: "action_request",
    totalTokens: 0,
    toolCalls: 0,
    llmCalls: 0,
    metadata: {
      actionId,
      actionName,
      actionEvent: "draft_created",
      conversationId: ctx.conversationId,
    },
  });

  const action = toActionDraft(actionId, actionName, validated);
  return {
    action,
    artifact: actionConfirmationArtifact(action),
  };
}

export async function createPendingGoalAction(
  ctx: ActionRuntimeContext,
  payload: GoalCreatePayload,
): Promise<ActionDraftResult> {
  const validated = await validateGoalCreate(ctx, payload);
  const [inserted] = await db.insert(aiPendingActions).values({
    userId: ctx.userId,
    userType: ctx.userType,
    conversationId: ctx.conversationId,
    actionName: "goal.create",
    status: "pending_confirmation",
    risk: "medium",
    summary: goalSummary(validated),
    payload: validated,
    expiresAt: expiresAt(),
  });
  const actionId = Number((inserted as any)?.insertId || 0);
  await audit(ctx, actionId, "goal.create", "draft_created", "pending_confirmation", {
    conversationId: ctx.conversationId,
  });
  void recordAICostMetric({
    userId: ctx.userId,
    userType: ctx.userType,
    channel: "action",
    plan: ctx.userPlan,
    intentKind: "action_request",
    totalTokens: 0,
    toolCalls: 0,
    llmCalls: 0,
    metadata: {
      actionId,
      actionName: "goal.create",
      actionEvent: "draft_created",
      conversationId: ctx.conversationId,
    },
  });

  const action = toActionDraft(actionId, "goal.create", validated);
  return {
    action,
    artifact: actionConfirmationArtifact(action),
  };
}

export async function maybeCreateActionDraftFromMessage(
  ctx: ActionRuntimeContext,
  message: string,
): Promise<ActionDraftResult | null> {
  const payload = createGoalPayloadFromMessage(message);
  if (payload) return createPendingGoalAction(ctx, payload);

  const phase8 = createPhase8PayloadFromMessage(message);
  if (!phase8) return null;
  return createPendingRuntimeAction(ctx, phase8.actionName, phase8.payload);
}

async function loadPendingAction(
  ctx: ActionRuntimeContext,
  actionId: number,
): Promise<PendingActionRecord> {
  const [row] = await db
    .select()
    .from(aiPendingActions)
    .where(
      and(
        eq(aiPendingActions.id, actionId),
        eq(aiPendingActions.userId, ctx.userId),
        eq(aiPendingActions.userType, ctx.userType),
      ),
    )
    .limit(1);

  if (!row) throw new Error("Action not found");
  if (row.status !== "pending_confirmation") throw new Error(`Action is ${row.status}`);
  if (
    ctx.conversationId !== undefined &&
    Number(row.conversationId) !== Number(ctx.conversationId)
  ) {
    throw new Error("Action does not belong to this conversation");
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    throw new Error("Action expired");
  }

  return {
    id: row.id,
    userId: row.userId,
    userType: row.userType,
    conversationId: row.conversationId,
    actionName: row.actionName as RuntimeActionName,
    status: row.status as PendingActionRecord["status"],
    risk: row.risk as PendingActionRecord["risk"],
    summary: row.summary,
    payload: parsePayload(row.payload),
    expiresAt: new Date(row.expiresAt),
  };
}

export async function confirmAction(
  ctx: ActionRuntimeContext,
  actionId: number,
): Promise<ActionExecutionResult> {
  const action = await loadPendingAction(ctx, actionId);
  await db
    .update(aiPendingActions)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(aiPendingActions.id, actionId));
  await audit(ctx, actionId, action.actionName, "confirmed", "confirmed");
  void recordAICostMetric({
    userId: ctx.userId,
    userType: ctx.userType,
    channel: "action",
    plan: ctx.userPlan,
    intentKind: "action_request",
    totalTokens: 0,
    toolCalls: 0,
    llmCalls: 0,
    metadata: {
      actionId,
      actionName: action.actionName,
      actionEvent: "confirmed",
    },
  });

  try {
    const output =
      action.actionName === "goal.create"
        ? await executeGoalCreate(ctx, action.payload as GoalCreatePayload).then((result) => ({
            goalId: result.goalId,
            title: result.payload.title,
            targetAmount: result.payload.targetAmount,
            targetDate: result.payload.targetDate,
          }))
        : await executeRuntimeAction(ctx, action.actionName, action.payload);

    await db
      .update(aiPendingActions)
      .set({
        status: "executed",
        executedAt: new Date(),
        result: output,
      })
      .where(eq(aiPendingActions.id, actionId));
    await db.insert(aiActionMemory).values({
      userId: ctx.userId,
      userType: ctx.userType,
      actionName: action.actionName,
      status: "executed",
      summary: action.summary,
      payload: output,
      sourceConversationId: action.conversationId,
    });
    await invalidateMemoryUserCache(ctx.userId, ctx.userType).catch((error: unknown) => {
      console.warn("[AI Action Runtime] memory cache invalidation failed", error instanceof Error ? error.message : String(error));
    });
    await audit(ctx, actionId, action.actionName, "executed", "executed", output);
    let suggestedBudgetAction: ActionDraftResult | null = null;
    if (action.actionName === "goal.create") {
      const suggestion = createBudgetSuggestionFromGoal(action.payload as GoalCreatePayload, Number(output.goalId));
      if (suggestion) {
        suggestedBudgetAction = await createPendingRuntimeAction(ctx, "budget.create", suggestion).catch(() => null);
      }
    }

    void recordAICostMetric({
      userId: ctx.userId,
      userType: ctx.userType,
      channel: "action",
      plan: ctx.userPlan,
      intentKind: "action_request",
      totalTokens: 0,
      toolCalls: 1,
      llmCalls: 0,
      metadata: {
        actionId,
        actionName: action.actionName,
        actionEvent: "executed",
        result: output,
        suggestedActionId: suggestedBudgetAction?.action.id,
      },
    });

    const artifact: Artifact = {
      id: `action_result:${actionId}`,
      type: "metric_card",
      title:
        action.actionName === "goal.create"
          ? "تم إنشاء الهدف"
          : action.actionName === "expense.create"
            ? "تم تسجيل المصروف"
            : "تم تنفيذ العملية",
      payload: output,
    };
    const artifacts = suggestedBudgetAction?.artifact
      ? [artifact, suggestedBudgetAction.artifact]
      : [artifact];

    return {
      actionId,
      actionName: action.actionName,
      status: "executed",
      message:
        action.actionName === "goal.create"
          ? "تم إنشاء الهدف بنجاح."
          : action.actionName === "expense.create"
            ? "تم تسجيل المصروف بنجاح."
            : "تم تنفيذ العملية بنجاح.",
      result: output,
      artifact,
      artifacts,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(aiPendingActions)
      .set({
        status: "failed",
        result: { error: message },
      })
      .where(eq(aiPendingActions.id, actionId));
    await audit(ctx, actionId, action.actionName, "failed", "failed", { error: message });
    void recordAICostMetric({
      userId: ctx.userId,
      userType: ctx.userType,
      channel: "action",
      plan: ctx.userPlan,
      intentKind: "action_request",
      totalTokens: 0,
      toolCalls: 1,
      llmCalls: 0,
      metadata: {
        actionId,
        actionName: action.actionName,
        actionEvent: "failed",
        error: message,
      },
    });
    throw error;
  }
}

export async function cancelAction(
  ctx: ActionRuntimeContext,
  actionId: number,
): Promise<ActionExecutionResult> {
  const action = await loadPendingAction(ctx, actionId);
  await db
    .update(aiPendingActions)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(aiPendingActions.id, actionId));
  await audit(ctx, actionId, action.actionName, "cancelled", "cancelled");
  void recordAICostMetric({
    userId: ctx.userId,
    userType: ctx.userType,
    channel: "action",
    plan: ctx.userPlan,
    intentKind: "action_request",
    totalTokens: 0,
    toolCalls: 0,
    llmCalls: 0,
    metadata: {
      actionId,
      actionName: action.actionName,
      actionEvent: "cancelled",
    },
  });

  return {
    actionId,
    actionName: action.actionName,
    status: "cancelled",
    message: "تم إلغاء العملية.",
  };
}

export function mergeActionArtifacts(
  baseArtifacts: Artifact[],
  draft: ActionDraftResult | null,
): { artifacts: Artifact[]; actions: ActionDraft[] } {
  if (!draft) return { artifacts: baseArtifacts, actions: [] };
  return {
    artifacts: [...baseArtifacts, draft.artifact],
    actions: [draft.action],
  };
}
