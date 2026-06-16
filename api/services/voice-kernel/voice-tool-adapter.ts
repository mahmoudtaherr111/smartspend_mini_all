import { randomUUID } from "crypto";
import type { ToolDefinition } from "../../lib/deepseek-client";
import type {
  DataNeed,
  DataNeedKind,
  PeriodHint,
  ResolvedFact,
} from "../ai-kernel/types";
import { embeddingApiStatusFor, retrievalPolicyFor } from "../ai-kernel/retrieval-policy";
import {
  createGoalPayloadFromMessage,
  createPendingGoalAction,
  createPendingRuntimeAction,
  createPhase8PayloadFromMessage,
  goalSummary,
  actionSummary,
  validateRuntimeAction,
  validateGoalCreate,
  confirmAction,
} from "../action-runtime";
import type { GoalCreatePayload, RuntimeActionName, RuntimeActionPayload } from "../action-runtime/types";
import { retrieveMemoryContext } from "../ai-memory";
import { resolveKernelDataNeeds } from "../finance-semantic-layer";
import {
  addVoicePendingAction,
  getVoicePendingAction,
  updateVoicePendingAction,
} from "./voice-session-state";
import type {
  VoiceFinanceQueryKind,
  VoicePendingAction,
  VoicePeriodHint,
  VoiceToolExecutionContext,
  VoiceToolName,
  VoiceToolRequest,
  VoiceToolResponse,
} from "./types";

type FunctionDeclaration = ToolDefinition["function"];
type DataNeedScope = NonNullable<DataNeed["scope"]>;

const PERIODS: VoicePeriodHint[] = [
  "today",
  "yesterday",
  "current_week",
  "current_month",
  "previous_month",
  "salary_cycle",
  "custom",
];

const FINANCE_QUERY_KINDS: VoiceFinanceQueryKind[] = [
  "summary",
  "wallet_summary",
  "period_comparison",
  "category_total",
  "breakdown",
  "transactions",
  "chart",
  "goal_progress",
];

const VOICE_ACTION_TTL_MS = 30 * 60 * 1000;

export const VOICE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "finance_query",
    description: "Fetch the smallest exact financial dataset needed for a voice answer.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: FINANCE_QUERY_KINDS,
          description:
            "summary, wallet_summary, period_comparison, category_total, breakdown, transactions, chart, or goal_progress",
        },
        period: {
          type: "string",
          enum: PERIODS,
          description: "Time window. Prefer today for simple daily questions and current_month for analysis.",
        },
        category: {
          type: "string",
          description: "Optional spending category such as food, transport, subscriptions.",
        },
        granularity: {
          type: "string",
          enum: ["day", "week", "month", "category", "merchant"],
          description: "Grouping for breakdowns or charts.",
        },
        limit: {
          type: "number",
          description: "Maximum rows or points. Keep it small in voice.",
        },
        startDate: {
          type: "string",
          description: "YYYY-MM-DD for custom ranges, for example the first day of a 6-month chart.",
        },
        endDate: {
          type: "string",
          description: "YYYY-MM-DD for custom ranges, usually today's date.",
        },
      },
      required: ["kind"],
    },
  },
  {
    name: "memory_search",
    description: "Search previous AI chat/call memory capsules only when the user asks about prior discussions or preferences.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The exact memory topic to search for." },
        limit: { type: "number", description: "Small result limit, usually 3 to 5." },
      },
      required: ["query"],
    },
  },
  {
    name: "action_draft",
    description: "Prepare a website action draft after discussing it. Does not execute anything.",
    parameters: {
      type: "object",
      properties: {
        actionName: {
          type: "string",
          enum: [
            "goal.create",
            "goal.update",
            "goal.stop",
            "expense.create",
            "expense.recategorize",
            "budget.create",
            "profile.update",
            "wallet.create",
            "wallet.update",
          ],
        },
        message: {
          type: "string",
          description: "The user's spoken request or agreed plan.",
        },
        title: { type: "string" },
        targetAmount: { type: "number" },
        targetDate: { type: "string", description: "YYYY-MM-DD if known." },
        description: { type: "string" },
        payload: {
          type: "object",
          description: "Structured action payload when the model has already collected the exact fields.",
        },
      },
      required: ["actionName"],
    },
  },
  {
    name: "action_confirm",
    description: "Execute the latest pending low/medium risk voice action only after explicit user confirmation.",
    parameters: {
      type: "object",
      properties: {
        actionId: {
          type: "string",
          description: "Optional voice action id. If absent, confirm the latest pending action.",
        },
      },
    },
  },
  {
    name: "action_cancel",
    description: "Cancel a pending voice action.",
    parameters: {
      type: "object",
      properties: {
        actionId: {
          type: "string",
          description: "Optional voice action id. If absent, cancel the latest pending action.",
        },
      },
    },
  },
];

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

function dateArg(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}

function periodScope(args: Record<string, unknown>, period: PeriodHint): DataNeedScope {
  return {
    period,
    startDate: period === "custom" ? dateArg(args.startDate) : undefined,
    endDate: period === "custom" ? dateArg(args.endDate) : undefined,
  };
}

function periodFrom(value: unknown, fallback: PeriodHint): PeriodHint {
  const period = asString(value);
  return period && PERIODS.includes(period as VoicePeriodHint)
    ? (period as PeriodHint)
    : fallback;
}

function makeNeed(
  index: number,
  kind: DataNeedKind,
  reason: string,
  scope: DataNeed["scope"] = {},
  maxRows?: number,
): DataNeed {
  return {
    id: `voice_need_${index}_${kind.replace(".", "_")}`,
    kind,
    priority: maxRows && maxRows > 8 ? "deep" : "hot",
    reason,
    scope,
    maxRows,
    cache:
      kind === "none"
        ? undefined
        : {
            keyHint: ["voice", kind, scope.period, scope.category, scope.granularity, scope.limit]
              .filter(Boolean)
              .join(":"),
            ttlSeconds: 60,
            hot: true,
          },
  };
}

function buildFinanceNeeds(args: Record<string, unknown>): DataNeed[] {
  const kind = FINANCE_QUERY_KINDS.includes(args.kind as VoiceFinanceQueryKind)
    ? (args.kind as VoiceFinanceQueryKind)
    : "summary";
  const period = periodFrom(args.period, kind === "summary" ? "today" : "current_month");
  const category = asString(args.category);
  const limit = clampLimit(args.limit, kind === "transactions" ? 8 : 6, 20);
  const granularity = asString(args.granularity);
  const baseScope = periodScope(args, period);

  if (kind === "wallet_summary") {
    return [makeNeed(1, "wallet.summary", "voice_wallet_summary", {}, 8)];
  }

  if (kind === "period_comparison") {
    return [
      makeNeed(
        1,
        "finance.period_comparison",
        "voice_period_comparison",
        {
          period,
          comparePeriod: "previous_month",
          category,
          startDate: baseScope.startDate,
          endDate: baseScope.endDate,
        },
        2,
      ),
    ];
  }

  if (kind === "category_total") {
    return category
      ? [
          makeNeed(
            1,
            "finance.category_total",
            "voice_exact_category_total",
            { ...baseScope, category },
            1,
          ),
        ]
      : [makeNeed(1, "finance.summary", "voice_category_missing_fallback_summary", baseScope, 1)];
  }

  if (kind === "breakdown") {
    return [
      makeNeed(
        1,
        "finance.breakdown",
        "voice_grouped_breakdown",
        {
          ...baseScope,
          category,
          granularity: (granularity as DataNeedScope["granularity"]) ?? "category",
          limit,
        },
        limit,
      ),
    ];
  }

  if (kind === "transactions") {
    return [
      makeNeed(
        1,
        "finance.transactions",
        "voice_supporting_transactions",
        { ...baseScope, category, limit },
        limit,
      ),
    ];
  }

  if (kind === "chart") {
    return [
      makeNeed(
        1,
        "chart.data",
        "voice_chart_dataset",
        {
          ...baseScope,
          category,
          granularity: (granularity as DataNeedScope["granularity"]) ?? "category",
          limit,
        },
        limit,
      ),
    ];
  }

  if (kind === "goal_progress") {
    return [makeNeed(1, "finance.goal_progress", "voice_active_goal_progress", {}, 8)];
  }

  return [makeNeed(1, "finance.summary", "voice_top_level_summary", baseScope, 1)];
}

function compactFacts(facts: ResolvedFact[]): ResolvedFact[] {
  return facts.slice(0, 18).map((fact) => ({
    ...fact,
    evidence: fact.evidence?.slice(0, 3),
  }));
}

async function executeFinanceQuery(
  ctx: VoiceToolExecutionContext,
  args: Record<string, unknown>,
): Promise<VoiceToolResponse> {
  const dataNeeds = buildFinanceNeeds(args);
  const result = await resolveKernelDataNeeds(
    {
      userId: ctx.userId,
      userType: ctx.userType,
    },
    dataNeeds,
  );

  return {
    ok: true,
    tool: "finance_query",
    dataNeeds,
    facts: compactFacts(result.facts),
    artifacts: result.artifacts,
    cacheHits: result.cacheHits,
    retrievalPolicy: retrievalPolicyFor("voice_finance_query", dataNeeds, result.cacheHits),
    embeddingApiStatus: embeddingApiStatusFor(dataNeeds, result.cacheHits),
    result: {
      errors: result.errors,
      factCount: result.facts.length,
      artifactCount: result.artifacts.length,
    },
  };
}

async function executeMemorySearch(
  ctx: VoiceToolExecutionContext,
  args: Record<string, unknown>,
): Promise<VoiceToolResponse> {
  const query = asString(args.query);
  if (!query) {
    return { ok: false, tool: "memory_search", error: "query is required" };
  }

  const limit = clampLimit(args.limit, 5, 8);
  const dataNeeds = [
    makeNeed(1, "memory.search", "voice_explicit_memory_search", { query, limit }, limit),
  ];
  const result = await retrieveMemoryContext({
    userId: ctx.userId,
    userType: ctx.userType,
    query,
    limit,
  });
  const facts = compactFacts(result.facts);

  return {
    ok: true,
    tool: "memory_search",
    dataNeeds,
    facts,
    artifacts: result.artifacts,
    cacheHits: result.cacheHits,
    retrievalPolicy: retrievalPolicyFor("voice_memory_search", dataNeeds, result.cacheHits),
    embeddingApiStatus: embeddingApiStatusFor(dataNeeds, result.cacheHits),
    result: {
      query,
      selected: facts.map((fact) => fact.value),
      errors: result.errors,
    },
  };
}

function payloadFromArgs(args: Record<string, unknown>): GoalCreatePayload | null {
  const title = asString(args.title);
  const targetAmount = asNumber(args.targetAmount);
  const targetDate = asString(args.targetDate);
  const description = asString(args.description) ?? asString(args.message);

  if (!title && !targetAmount) return null;

  return {
    title: title ?? "New saving goal",
    description,
    targetAmount,
    targetDate,
  };
}

function voiceActionRisk(actionName: RuntimeActionName): VoicePendingAction["risk"] {
  if (actionName === "goal.stop") return "high";
  return "medium";
}

function objectPayload(value: unknown): RuntimeActionPayload | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RuntimeActionPayload)
    : null;
}

async function resolveVoiceActionPayload(
  ctx: VoiceToolExecutionContext,
  actionName: RuntimeActionName,
  args: Record<string, unknown>,
): Promise<RuntimeActionPayload | null> {
  const explicitPayload = objectPayload(args.payload);
  if (explicitPayload) return validateRuntimeAction(ctx, actionName, explicitPayload);

  const message = asString(args.message) ?? "";
  if (actionName === "goal.create") {
    const payload = payloadFromArgs(args) ?? createGoalPayloadFromMessage(message);
    return payload ? validateGoalCreate(ctx, payload) : null;
  }

  const parsed = createPhase8PayloadFromMessage(message);
  if (parsed && parsed.actionName === actionName) {
    return validateRuntimeAction(ctx, actionName, parsed.payload);
  }

  return null;
}

async function executeActionDraft(
  ctx: VoiceToolExecutionContext,
  args: Record<string, unknown>,
): Promise<VoiceToolResponse> {
  const actionName = (asString(args.actionName) ?? "goal.create") as RuntimeActionName;
  const payload = await resolveVoiceActionPayload(ctx, actionName, args);
  if (!payload) {
    return {
      ok: false,
      tool: "action_draft",
      error: `Could not infer ${actionName} payload. Ask for the missing exact fields before drafting.`,
    };
  }

  const risk = voiceActionRisk(actionName);
  const now = new Date();
  const action: VoicePendingAction = {
    id: `voice_action_${randomUUID()}`,
    actionName,
    risk,
    status: "pending_confirmation",
    summary: actionName === "goal.create" ? goalSummary(payload as GoalCreatePayload) : actionSummary(actionName, payload),
    payload,
    requiresUiConfirmation: risk === "high",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + VOICE_ACTION_TTL_MS).toISOString(),
  };

  await addVoicePendingAction(ctx.sessionId, action);

  return {
    ok: true,
    tool: "action_draft",
    action,
    result: {
      requiresConfirmation: true,
      requiresUiConfirmation: action.requiresUiConfirmation,
      instruction: "Ask the user for explicit confirmation before calling action_confirm.",
    },
  };
}

async function executeActionConfirm(
  ctx: VoiceToolExecutionContext,
  args: Record<string, unknown>,
): Promise<VoiceToolResponse> {
  const action = await getVoicePendingAction(ctx.sessionId, asString(args.actionId));
  if (!action) {
    return { ok: false, tool: "action_confirm", error: "No pending voice action found" };
  }

  if (action.risk === "high" || action.requiresUiConfirmation) {
    return {
      ok: false,
      tool: "action_confirm",
      error: "High risk actions require UI confirmation",
      requiresUiConfirmation: true,
      result: {
        actionId: action.id,
        summary: action.summary,
      },
    };
  }

  try {
    const draft =
      action.actionName === "goal.create"
        ? await createPendingGoalAction(ctx, action.payload as GoalCreatePayload)
        : await createPendingRuntimeAction(ctx, action.actionName, action.payload);
    const dbActionId = Number(draft.action.id);
    const execution = await confirmAction(ctx, dbActionId);
    const result = {
      actionId: execution.actionId,
      actionName: execution.actionName,
      status: execution.status,
      message: execution.message,
      result: execution.result,
    };

    await updateVoicePendingAction(ctx.sessionId, action.id, {
      status: "executed",
      dbActionId,
      result,
    });

    return {
      ok: true,
      tool: "action_confirm",
      message: execution.message,
      result: {
        voiceActionId: action.id,
        ...result,
      },
      artifacts: execution.artifact ? [execution.artifact] : [],
    };
  } catch (error) {
    await updateVoicePendingAction(ctx.sessionId, action.id, {
      status: "failed",
      result: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

async function executeActionCancel(
  ctx: VoiceToolExecutionContext,
  args: Record<string, unknown>,
): Promise<VoiceToolResponse> {
  const action = await getVoicePendingAction(ctx.sessionId, asString(args.actionId));
  if (!action) {
    return { ok: false, tool: "action_cancel", error: "No pending voice action found" };
  }

  await updateVoicePendingAction(ctx.sessionId, action.id, { status: "cancelled" });

  return {
    ok: true,
    tool: "action_cancel",
    message: "Pending voice action cancelled.",
    result: {
      voiceActionId: action.id,
      status: "cancelled",
    },
  };
}

export async function executeVoiceTool(request: VoiceToolRequest): Promise<VoiceToolResponse> {
  const toolName = request.toolName as VoiceToolName;
  try {
    if (toolName === "finance_query") {
      return executeFinanceQuery(request.ctx, request.args);
    }
    if (toolName === "memory_search") {
      return executeMemorySearch(request.ctx, request.args);
    }
    if (toolName === "action_draft") {
      return executeActionDraft(request.ctx, request.args);
    }
    if (toolName === "action_confirm") {
      return executeActionConfirm(request.ctx, request.args);
    }
    if (toolName === "action_cancel") {
      return executeActionCancel(request.ctx, request.args);
    }
    return { ok: false, tool: request.toolName, error: `Unknown voice tool ${request.toolName}` };
  } catch (error) {
    return {
      ok: false,
      tool: request.toolName,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
