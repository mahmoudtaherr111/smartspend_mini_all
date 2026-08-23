/**
 * Chat Router — tRPC endpoints for the AI Chatbot
 *
 * Endpoints:
 * - sendMessage: Send a message and get AI response
 * - getConversations: List user's conversations
 * - getConversation: Get a specific conversation with messages
 * - clearConversation: Delete a conversation
 * - getQuickActions: Get available quick action prompts
 */

import { z } from "zod";
import { router, authedProcedure, aiProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import {
  chatConversations,
  chatMessages,
  aiPendingActions,
  aiMemoryItems,
  aiMemoryEmbeddings,
  users,
  localUsers,
} from "../db/schema";
import { getSystemSettings, invalidateSettingsCache } from "./lib/settings-cache";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  AI_RESPONSE_SCHEMA_VERSION,
  embeddingApiCallsFromCacheHits,
  runAIKernelActive,
  type AIRequest,
  type AIResponse,
} from "./services/ai-kernel";
import { routeIntent } from "./services/ai-kernel/intent-router";
import {
  createClarificationState,
  isClarificationExpired,
  isClarificationCancelled,
  processClarificationReply,
  mergeSlotsIntoIntent,
  buildClarificationResponse,
} from "./services/ai-kernel/clarification-machine";
import { findCapability, getCapabilityById } from "./services/ai-kernel/capability-registry";
import { type IntentResult } from "./services/ai-kernel/types";
import { hasSemanticMemoryCandidate, writeConversationMemory, invalidateMemoryUserCache, type MemoryMessage } from "./services/ai-memory";
import { invalidateUserMemory } from "./lib/muscle-memory";
import {
  recordAICostMetric,
  resolveAICostPolicy,
  resolveAIRollout,
  validateNumbersAgainstFacts,
} from "./services/ai-cost-policy";
import {
  cancelAction as runtimeCancelAction,
  confirmAction as runtimeConfirmAction,
  createPendingGoalAction,
  createPendingRuntimeAction,
  maybeCreateActionDraftFromMessage,
  mergeActionArtifacts,
} from "./services/action-runtime";
import type { ActionDraftResult, GoalCreatePayload, RuntimeActionName, RuntimeActionPayload } from "./services/action-runtime/types";
import { displayFinanceCategory } from "./services/finance-semantic-layer/category-matcher";

// ─── Helpers ───

async function loadChatConfig(): Promise<{
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: Record<string, number>;
  dailyLimits: Record<string, number>;
  maxHistory: number;
  enabled: Record<string, boolean>;
  aiKernelEnabled: boolean;
  settings: Record<string, string>;
}> {
  const s = await getSystemSettings();

  return {
    apiKey: s.chatbot_api_key || s.fireworks_api_key || "",
    baseUrl: s.chatbot_base_url || "https://api.fireworks.ai/inference/v1",
    model: s.chatbot_model || "accounts/fireworks/models/deepseek-v4-flash",
    maxTokens: {
      free: parseInt(s.chatbot_max_tokens_free || "1000"),
      pro: parseInt(s.chatbot_max_tokens_pro || "3000"),
      ultra: parseInt(s.chatbot_max_tokens_ultra || "5000"),
    },
    dailyLimits: {
      free: parseInt(s.chatbot_daily_limit_free || "20"),
      pro: parseInt(s.chatbot_daily_limit_pro || "200"),
      ultra: parseInt(s.chatbot_daily_limit_ultra || "999999"),
    },
    maxHistory: parseInt(s.chatbot_max_history || "10"),
    enabled: {
      free: s.chatbot_enabled_free !== "false",
      pro: s.chatbot_enabled_pro !== "false",
      ultra: s.chatbot_enabled_ultra !== "false",
    },
    // The kernel serves local financial answers, memories, and structured actions
    // without an LLM call. Keep it on unless an operator explicitly disables it.
    aiKernelEnabled: s.ai_kernel_enabled !== "false",
    settings: s,
  };
}

async function getTodayMessageCount(
  userId: number,
  userType: string,
): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(chatMessages)
    .innerJoin(
      chatConversations,
      eq(chatMessages.conversationId, chatConversations.id),
    )
    .where(
      and(
        eq(chatConversations.userId, userId),
        eq(chatConversations.userType, userType),
        eq(chatMessages.role, "user"),
        sql`${chatMessages.createdAt} >= ${today}`,
      ),
    );

  return Number(result[0]?.count || 0);
}

function minimalStructuredResponse(
  content: string,
  artifacts: AIResponse["artifacts"],
  actions: AIResponse["actions"],
): AIResponse {
  return {
    traceId: `legacy_structured_${Date.now()}`,
    channel: "chat",
    content,
    intent: {
      kind: "action_request",
      confidence: 0.6,
      reason: "action_draft_only",
      slots: {},
    },
    dataNeeds: [],
    facts: [],
    artifacts,
    actions,
    tokenBudget: {
      maxInputTokens: 900,
      maxOutputTokens: 450,
      maxFactTokens: 420,
      maxMemoryTokens: 140,
      maxHistoryTokens: 180,
      maxToolRounds: 1,
    },
    debug: {
      responseSchemaVersion: AI_RESPONSE_SCHEMA_VERSION,
    },
  };
}

async function requireOwnedConversation(
  conversationId: number,
  userId: number,
  userType: string,
) {
  const [conversation] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, userId),
        eq(chatConversations.userType, userType),
      ),
    )
    .limit(1);

  if (!conversation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "المحادثة مش موجودة.",
    });
  }

  return conversation;
}

function factNumber(
  facts: AIResponse["facts"] | undefined,
  label: string,
  source?: string,
): number | undefined {
  const value = facts?.find((fact) => fact.label === label && (!source || fact.source === source))?.value;
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function localMoney(value: number | undefined): string {
  const safe = Number.isFinite(value) ? value! : 0;
  return `${safe.toLocaleString("ar-EG", {
    maximumFractionDigits: Number.isInteger(safe) ? 0 : 2,
  })} جنيه`;
}

function localCategoryName(value: string | undefined): string {
  if (!value) return "غير مصنف";
  return displayFinanceCategory(value);
}

function responseForActionDraft(
  fallback: string,
  action: AIResponse["actions"][number] | null | undefined,
  facts: AIResponse["facts"] | undefined,
): string {
  if (!action) return fallback;

  if (action.name === "goal.create") {
    const payload = action.payload as {
      title?: string;
      targetAmount?: number;
      targetDate?: string;
      description?: string;
    };
    const income = factNumber(facts, "total_income", "finance.summary");
    const expense = factNumber(facts, "total_expense", "finance.summary");
    const net = factNumber(facts, "net_flow", "finance.summary");
    const factsLine =
      income !== undefined || expense !== undefined || net !== undefined
        ? `من بيانات الشهر الحالي: الدخل ${localMoney(income)}، المصروف ${localMoney(expense)}، والصافي ${localMoney(net)}.`
        : "";

    return [
      `جهزت لك مسودة هدف: ${payload.title ?? action.summary}.`,
      payload.targetAmount ? `المبلغ المستهدف ${localMoney(payload.targetAmount)}.` : "",
      payload.targetDate ? `التاريخ المستهدف ${payload.targetDate}.` : "",
      factsLine,
      "لسه ما نفذتش حاجة. راجع التفاصيل واضغط تأكيد لو موافق، أو إلغاء لو عايز نعدّل الخطة.",
    ]
      .filter(Boolean)
        .join("\n");
  }

  if (action.name === "expense.create") {
    const payload = action.payload as {
      amount?: number;
      category?: string;
      description?: string;
      placeHint?: string;
      date?: string;
    };
    return [
      `جهزت مسودة تسجيل مصروف بقيمة ${localMoney(payload.amount)}.`,
      payload.category ? `الفئة المقترحة: ${localCategoryName(payload.category)}.` : "",
      payload.placeHint ? `المكان: ${payload.placeHint}.` : "",
      payload.date ? `التاريخ: ${payload.date}.` : "",
      "لسه ما سجلتش المصروف. اضغط تأكيد أو اكتب موافق لو التفاصيل صح، أو إلغاء لو عايز توقفها.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `جهزت مسودة عملية: ${action.summary}.`,
    "لسه ما نفذتش حاجة. اضغط تأكيد لو موافق، أو إلغاء لو عايز توقفها.",
  ].join("\n");
}

function responseForActionDraftFailure(errorMessage: string): string {
  const freeLimit = errorMessage.match(/Free plan supports (\d+) active goals/i);
  if (freeLimit) {
    return [
      `ماقدرتش أجهز مسودة هدف جديدة لأن خطة Free تسمح بـ ${freeLimit[1]} أهداف نشطة فقط.`,
      "لسه ما نفذتش حاجة. ممكن تقفل أو تلغي هدف قديم، أو ترقي الخطة، وبعدها أقدر أجهز لك المسودة للتأكيد.",
    ].join("\n");
  }

  return [
    `ماقدرتش أجهز مسودة التنفيذ: ${errorMessage}`,
    "لسه ما نفذتش حاجة. جرّب تبسط الطلب أو تعدل البيانات المطلوبة.",
  ].join("\n");
}

function embeddingCallsFromStructured(structured: AIResponse | undefined): number {
  const debug = structured?.debug as { cacheHits?: unknown[]; embeddingCalls?: unknown } | undefined;
  const explicit = Number(debug?.embeddingCalls);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const cacheHits = Array.isArray(debug?.cacheHits) ? debug.cacheHits : [];
  return embeddingApiCallsFromCacheHits(cacheHits.map(String));
}

function dataNeedKinds(structured: AIResponse | undefined): string[] {
  return [...new Set((structured?.dataNeeds ?? []).map((need) => need.kind))];
}

export function structuredFromToolResults(value: unknown): AIResponse | undefined {
  let parsed = value;
  if (typeof parsed === "string" && parsed.trim()) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const record = parsed as Record<string, unknown>;
  const structured = record.structured;
  if (!structured || typeof structured !== "object") return undefined;

  const response = structured as AIResponse;
  const debug =
    response.debug && typeof response.debug === "object" && !Array.isArray(response.debug)
      ? response.debug
      : {};

  if (debug.responseSchemaVersion) return response;

  return {
    ...response,
    debug: {
      ...debug,
      responseSchemaVersion: 0,
      historicalStructuredResponse: true,
    },
  };
}

function normalizeActionReply(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[؟?،,.!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function actionReplyKind(message: string): "confirm" | "cancel" | null {
  const text = normalizeActionReply(message);
  if (!text || text.length > 80) return null;
  if (/\d|[٠-٩۰-۹]/.test(text)) return null;
  if (/(سجل|احفظ|اضف|ضيف|اشتريت|دفعت|صرفت|مصروف|هدف|ميزانيه|محفظه|كارت|فيزا)/i.test(text)) {
    return null;
  }

  const tokens = new Set(text.split(/\s+/).filter(Boolean));
  const exactConfirm = new Set(["موافق", "اكد", "أكد", "اوك", "تمام", "yes", "confirm"]);
  const exactCancel = new Set(["الغ", "الغي", "إلغاء", "الغاء", "cancel", "وقف", "بلاش", "لا"]);

  if (text === "مش موافق" || text === "لا مش موافق" || text === "لا نفذ" || text === "لا تنفذ") {
    return "cancel";
  }
  if ([...exactCancel].some((item) => text === normalizeActionReply(item))) return "cancel";
  if ([...exactConfirm].some((item) => text === normalizeActionReply(item))) return "confirm";
  if ((tokens.has("تمام") && (tokens.has("نفذ") || tokens.has("نفذها"))) || text === "نفذها" || text === "اعملها") {
    return "confirm";
  }
  return null;
}

async function findLatestPendingActionId(
  userId: number,
  userType: string,
  conversationId: number,
): Promise<number | undefined> {
  const rows = await db
    .select({
      id: aiPendingActions.id,
      conversationId: aiPendingActions.conversationId,
    })
    .from(aiPendingActions)
    .where(
      and(
        eq(aiPendingActions.userId, userId),
        eq(aiPendingActions.userType, userType),
        eq(aiPendingActions.status, "pending_confirmation"),
      ),
    )
    .orderBy(desc(aiPendingActions.createdAt))
    .limit(10);

  const sameConversation = rows.find((row) => Number(row.conversationId) === conversationId);
  return Number(sameConversation?.id) || undefined;
}

async function resolveTextActionReply(
  ctx: { userId: number; userType: string; userPlan: string },
  message: string,
  conversationId: number,
): Promise<{ response: string; structured: AIResponse; tokensUsed: number; model: string; toolsUsed: string[] } | null> {
  const kind = actionReplyKind(message);
  if (!kind) return null;
  const actionId = await findLatestPendingActionId(ctx.userId, ctx.userType, conversationId);
  if (!actionId) return null;

  const result =
    kind === "confirm"
      ? await runtimeConfirmAction({ ...ctx, conversationId }, actionId)
      : await runtimeCancelAction({ ...ctx, conversationId }, actionId);
  const artifacts = result.artifacts ?? (result.artifact ? [result.artifact] : []);
  const response = result.message;
  return {
    response,
    structured: minimalStructuredResponse(response, artifacts, []),
    // This confirmation is entirely server-side; never charge an LLM budget for it.
    tokensUsed: 0,
    model: "server-action-runtime",
    toolsUsed: [`action.${kind}`],
  };
}

// ─── Router ───

export const chatRouter = router({
  /**
   * Send a message to the AI chatbot and get a response.
   */
  sendMessage: aiProcedure
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        conversationId: z.number().optional(),
        devQaBypassDailyLimit: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const plan = user.plan || "free";
      const startedAt = Date.now();

      // 1. Load config
      const config = await loadChatConfig();
      const routedIntent = routeIntent(input.message);
      const chatPolicy = resolveAICostPolicy({
        channel: "chat",
        plan,
        intentKind: routedIntent.kind,
        role: user.role,
        settings: config.settings,
      });
      const rollout = resolveAIRollout({
        userId: user.id,
        role: user.role,
        plan,
        settings: config.settings,
        flagPrefix: "ai_kernel",
      });
      // The plan-first kernel is the sole runtime. Rollout is retained for
      // telemetry, never as a switch back to the retired provider/tool loop.
      const aiKernelActive = config.aiKernelEnabled;

      // Check if chatbot is enabled for this plan
      if (!config.enabled[plan]) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "الشات بوت مش متاح في خطتك الحالية. ترقي للبرو عشان تستخدمه! 🚀",
        });
      }

      // Deterministic kernel routes (finance, memory, actions) remain useful even
      // when a generative provider is unavailable. Only the explicit legacy path
      // needs an API key.
      if (!config.apiKey && !aiKernelActive) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "الشات بوت مش مفعّل حالياً. تواصل مع الدعم.",
        });
      }

      // 2. Check daily limit
      const todayCount = await getTodayMessageCount(user.id, user.type);
      const dailyLimit = config.dailyLimits[plan] || 20;
      const devQaBypassDailyLimit =
        input.devQaBypassDailyLimit === true && process.env.NODE_ENV !== "production";

      if (!devQaBypassDailyLimit && todayCount >= dailyLimit) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `وصلت الحد اليومي (${dailyLimit} رسالة). جرب بكره أو ترقي خطتك! 💎`,
        });
      }

      // 3. Get or create conversation
      let conversationId = input.conversationId;
      let activeConv: any = null;
      if (!conversationId) {
        // Create new conversation
        const [inserted] = await db.insert(chatConversations).values({
          userId: user.id,
          userType: user.type,
          title: input.message.slice(0, 100),
          messageCount: 0,
          totalTokens: 0,
          lastMessageAt: new Date(),
        });
        conversationId = Number((inserted as any)?.insertId);
        if (!Number.isInteger(conversationId) || conversationId <= 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "تعذر إنشاء المحادثة. جرّب تاني.",
          });
        }
        activeConv = { id: conversationId, metadata: null };
      } else {
        activeConv = await requireOwnedConversation(conversationId, user.id, user.type);
      }
      const activeConversationId: number = conversationId;

      // 4. Only load the recent context that can affect the next answer. The old
      // implementation loaded the entire thread on every turn, making both token
      // usage and memory writes grow with conversation length.
      const historyLimit = Math.min(Math.max(config.maxHistory, 2), 12);
      const existingMessages = await db
        .select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, activeConversationId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(historyLimit);

      const conversationHistory = existingMessages
        .reverse()
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m): { role: "user" | "assistant"; content: string } => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      // 5. Save user message to DB
      await db.insert(chatMessages).values({
        conversationId: activeConversationId,
        role: "user",
        content: input.message,
        tokensUsed: 0,
        createdAt: new Date(),
      });

      // Check for active clarification state
      let prePlannedIntent: IntentResult | undefined;
      const clarificationState = activeConv?.metadata ? (activeConv.metadata as any).clarificationState : null;

      if (clarificationState && !isClarificationExpired(clarificationState)) {
        if (isClarificationCancelled(input.message)) {
          // Cancel clarification
          await db
            .update(chatConversations)
            .set({
              metadata: {
                ...((activeConv.metadata as any) || {}),
                clarificationState: null,
              },
            })
            .where(eq(chatConversations.id, activeConversationId));

          const cancelMsg = "تمام، لغيت العملية دي. قولي تحب نعمل إيه تاني؟";
          await db.insert(chatMessages).values({
            conversationId: activeConversationId,
            role: "assistant",
            content: cancelMsg,
            tokensUsed: 0,
            createdAt: new Date(),
          });

          await db
            .update(chatConversations)
            .set({
              messageCount: sql`message_count + 2`,
              lastMessageAt: new Date(),
            })
            .where(eq(chatConversations.id, activeConversationId));

          return {
            response: cancelMsg,
            conversationId: activeConversationId,
            tokensUsed: 0,
            model: "local",
            toolsUsed: [],
            structured: undefined,
          };
        }

        // Process reply
        const replyResult = processClarificationReply(clarificationState, input.message);
        if (replyResult.complete) {
          // Clarification completed! Clear state and set prePlannedIntent
          await db
            .update(chatConversations)
            .set({
              metadata: {
                ...((activeConv.metadata as any) || {}),
                clarificationState: null,
              },
            })
            .where(eq(chatConversations.id, activeConversationId));

          const capDef = getCapabilityById(clarificationState.capabilityId);
          const reconstructedIntent: IntentResult = {
            kind: capDef?.intentKind ?? "finance_query",
            confidence: 1.0,
            reason: "clarification_resolved",
            slots: {
              ...clarificationState.collectedSlots,
              ...replyResult.extractedSlots,
              query: clarificationState.originalMessage,
            },
          };
          prePlannedIntent = reconstructedIntent;
        } else {
          // Update clarification state and return question
          await db
            .update(chatConversations)
            .set({
              metadata: {
                ...((activeConv.metadata as any) || {}),
                clarificationState: replyResult.updatedState,
              },
            })
            .where(eq(chatConversations.id, activeConversationId));

          const { question, quickReplies } = buildClarificationResponse(replyResult.updatedState);

          await db.insert(chatMessages).values({
            conversationId: activeConversationId,
            role: "assistant",
            content: question,
            tokensUsed: 0,
            createdAt: new Date(),
          });

          await db
            .update(chatConversations)
            .set({
              messageCount: sql`message_count + 2`,
              lastMessageAt: new Date(),
            })
            .where(eq(chatConversations.id, activeConversationId));

          return {
            response: question,
            conversationId: activeConversationId,
            tokensUsed: 0,
            model: "local",
            toolsUsed: [],
            structured: {
              clarification: {
                question,
                replies: quickReplies,
                missing: replyResult.updatedState.missingSlots,
              },
            },
          };
        }
      }

      const kernelRequest: AIRequest = {
        channel: "chat",
        userId: user.id,
        userType: user.type,
        userPlan: plan,
        message: input.message,
        conversationId: activeConversationId,
        conversationHistory: conversationHistory.slice(-config.maxHistory),
        metadata: {
          agentRuntime: "plan_first_v1",
          rollout,
          devQaBypassDailyLimit,
          prePlannedIntent,
        },
      };

      const textActionResult = aiKernelActive
        ? await resolveTextActionReply(
            {
              userId: user.id,
              userType: user.type,
              userPlan: plan,
            },
            input.message,
            activeConversationId,
          ).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            console.warn("[AI Action Runtime] text confirmation failed", message);
            return null;
          })
        : null;

      if (textActionResult) {
        await db.insert(chatMessages).values({
          conversationId: activeConversationId,
          role: "assistant",
          content: textActionResult.response,
          tokensUsed: textActionResult.tokensUsed,
          model: textActionResult.model,
          toolCalls: textActionResult.toolsUsed,
          toolResults: { structured: textActionResult.structured },
          createdAt: new Date(),
        });

        await db
          .update(chatConversations)
          .set({
            messageCount: sql`message_count + 2`,
            totalTokens: sql`total_tokens + ${textActionResult.tokensUsed}`,
            lastMessageAt: new Date(),
            title: conversationHistory.length === 0 ? input.message.slice(0, 100) : undefined,
          })
          .where(eq(chatConversations.id, activeConversationId));

        if (user.type === "oauth") {
          await db
            .update(users)
            .set({ aiTokensUsed: sql`ai_tokens_used + ${textActionResult.tokensUsed}` })
            .where(eq(users.id, user.id));
        } else {
          await db
            .update(localUsers)
            .set({ aiTokensUsed: sql`ai_tokens_used + ${textActionResult.tokensUsed}` })
            .where(eq(localUsers.id, user.id));
        }

        void recordAICostMetric({
          userId: user.id,
          userType: user.type,
          channel: "chat",
          plan,
          intentKind: "action_request",
          model: textActionResult.model,
          inputTokens: Math.ceil(input.message.length / 3.5),
          outputTokens: Math.ceil(textActionResult.response.length / 3.5),
          totalTokens: textActionResult.tokensUsed,
          llmCalls: 0,
          toolCalls: 1,
          latencyMs: Date.now() - startedAt,
          metadata: {
            conversationId: activeConversationId,
            kernelMode: "action_text_confirmation",
            rollout,
          },
        });

        return {
          response: textActionResult.response,
          conversationId: activeConversationId,
          tokensUsed: textActionResult.tokensUsed,
          model: textActionResult.model,
          toolsUsed: textActionResult.toolsUsed,
          structured: textActionResult.structured,
        };
      }

      const kernelPrimary = aiKernelActive
        ? await runAIKernelActive(kernelRequest, {
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            model: config.model,
            maxTokens: chatPolicy.maxOutputTokens,
          }).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            console.warn("[AI Kernel Active] failed", message);
            return undefined;
          })
        : undefined;

      if (kernelPrimary) {
        const clarificationArtifact = kernelPrimary.artifacts.find(
          (art) => art.type === "quick_replies" && art.id.startsWith("clarification:")
        );
        if (clarificationArtifact) {
          const payload = clarificationArtifact.payload as { question: string; replies: string[]; missing: string[] };
          const capability = findCapability(kernelPrimary.intent);
          const capabilityId = capability?.id ?? "unknown";
          
          const newClarificationState = createClarificationState(
            capabilityId,
            kernelPrimary.intent.slots,
            payload.missing,
            input.message
          );

          await db
            .update(chatConversations)
            .set({
              metadata: {
                ...((activeConv?.metadata as any) || {}),
                clarificationState: newClarificationState
              }
            })
            .where(eq(chatConversations.id, activeConversationId));
        }
      }

      // 6. Plan-first kernel is the only execution path. No provider/tool loop
      // can be reached from this router.
      let result = kernelPrimary
        ? {
            response: kernelPrimary.content,
            tokensUsed: kernelPrimary.tokensUsed ?? 0,
            model: kernelPrimary.model ?? config.model,
            toolsUsed: dataNeedKinds(kernelPrimary),
          }
        : {
            response: "المساعد الذكي متوقف مؤقتاً من الإعدادات. جرّب تاني بعد ما يتم تفعيله.",
            tokensUsed: 0,
            model: "ai-kernel-disabled",
            toolsUsed: [] as string[],
          };

      const shadow = kernelPrimary;
      if (shadow) {
        console.info(
            "[AI Kernel Execution]",
          JSON.stringify({
            traceId: shadow.traceId,
            conversationId: activeConversationId,
            responseModel: result.model,
            responseTokensUsed: result.tokensUsed,
            responseToolsUsed: result.toolsUsed,
            kernelMode: shadow.debug?.mode ?? "unknown",
            shadowIntent: shadow.intent?.kind ?? "unknown",
            shadowDataNeeds: shadow.dataNeeds?.map((need) => need.kind) ?? [],
            shadowResolvedFacts: shadow.facts?.length ?? 0,
            shadowArtifacts: shadow.artifacts?.length ?? 0,
            shadowEstimatedInputTokens: shadow.debug?.estimatedInputTokens,
            shadowResolverErrors: shadow.debug?.resolverErrors,
          }),
        );
      }

      let actionDraftError: string | null = null;
      let actionDraft: ActionDraftResult | null = null;
      if (aiKernelActive) {
        const actionCtx = {
          userId: user.id,
          userType: user.type,
          userPlan: plan,
          conversationId: activeConversationId,
        };
        const proposedAction = shadow?.proposedActions?.[0];
        actionDraft = await (proposedAction
          ? proposedAction.name === "goal.create"
            ? createPendingGoalAction(actionCtx, proposedAction.payload as unknown as GoalCreatePayload)
            : createPendingRuntimeAction(
                actionCtx,
                proposedAction.name as RuntimeActionName,
                proposedAction.payload as RuntimeActionPayload,
              )
          : maybeCreateActionDraftFromMessage(actionCtx, input.message)
        ).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          actionDraftError = message;
          console.warn("[AI Action Runtime] draft failed", message);
          return null;
        });
      }
      const actionAwareResponse = actionDraftError
        ? responseForActionDraftFailure(actionDraftError)
        : responseForActionDraft(
            result.response,
            actionDraft?.action,
            shadow?.facts,
          );
      if (actionAwareResponse !== result.response) {
        result = {
          ...result,
          response: actionAwareResponse,
          // Server-side action wording is not provider usage and must never
          // consume a user's token quota.
          tokensUsed: result.tokensUsed,
        };
      }
      const mergedActions = mergeActionArtifacts(shadow?.artifacts ?? [], actionDraft);
      const structured: AIResponse | undefined = shadow
        ? {
            ...shadow,
            content: result.response,
            artifacts: mergedActions.artifacts,
            actions: [...(shadow.actions ?? []), ...mergedActions.actions],
          }
        : actionDraft
          ? minimalStructuredResponse(result.response, mergedActions.artifacts, mergedActions.actions)
          : undefined;

      // 7. Save assistant response to DB
      await db.insert(chatMessages).values({
        conversationId: activeConversationId,
        role: "assistant",
        content: result.response,
        tokensUsed: result.tokensUsed,
        model: result.model,
        toolCalls: result.toolsUsed.length > 0 ? result.toolsUsed : null,
        toolResults: structured ? { structured } : null,
        createdAt: new Date(),
      });

      if (aiKernelActive) {
        const memoryMessages: MemoryMessage[] = [
          ...conversationHistory.slice(-6).map((message) => ({
            role: message.role as MemoryMessage["role"],
            content: message.content,
          })),
          { role: "user", content: input.message },
          { role: "assistant", content: result.response },
        ];
        const memoryInput = {
          userId: user.id,
          userType: user.type,
          conversationId: activeConversationId,
          source: "chat" as const,
          messages: memoryMessages,
        };
        const memoryWrite = writeConversationMemory(memoryInput).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn("[AI Memory] write failed", message);
        });
        if (hasSemanticMemoryCandidate(memoryInput.messages)) {
          await memoryWrite;
        } else {
          void memoryWrite;
        }
      }

      const estimatedInputTokens =
        typeof shadow?.debug?.estimatedInputTokens === "number"
          ? shadow.debug.estimatedInputTokens
          : Math.ceil(input.message.length / 3.5);
      // Never infer a provider call from a fallback or from a local tool name.
      // Metrics and quota decisions must reflect an actual kernel-reported call.
      const measuredLlmCalls = Number(kernelPrimary?.debug?.llmCalls ?? 0);
      const measuredToolCalls = result.toolsUsed.length;
      const measuredEmbeddingCalls = embeddingCallsFromStructured(structured);
      const numericAccuracy = structured?.facts?.length
        ? validateNumbersAgainstFacts(result.response, structured.facts)
        : undefined;
      const structuredDebug = structured?.debug as Record<string, unknown> | undefined;
      const cacheRuntime = structuredDebug?.cacheRuntime as Record<string, unknown> | undefined;
      void recordAICostMetric({
        userId: user.id,
        userType: user.type,
        channel: "chat",
        plan,
        intentKind: routedIntent.kind,
        model: result.model,
        // For deterministic replies, estimated context size is telemetry only,
        // not provider usage or a user charge.
        inputTokens: measuredLlmCalls > 0 ? estimatedInputTokens : 0,
        outputTokens: measuredLlmCalls > 0 ? Math.max(0, result.tokensUsed - estimatedInputTokens) : 0,
        totalTokens: result.tokensUsed,
        embeddingCalls: measuredEmbeddingCalls,
        llmCalls: measuredLlmCalls,
        toolCalls: measuredToolCalls,
        latencyMs: Date.now() - startedAt,
        metadata: {
          conversationId: activeConversationId,
          traceId: structured?.traceId,
          dataNeeds: dataNeedKinds(structured),
          cacheHits: structuredDebug?.cacheHits ?? [],
          cacheBackend: cacheRuntime?.backend,
          redisConfigured: cacheRuntime?.redisConfigured,
          recipe: structured?.recipe,
          proposedActions: structured?.proposedActions?.length ?? 0,
          embeddingApiStatus: structuredDebug?.embeddingApiStatus,
          retrievalPolicy: structuredDebug?.retrievalPolicy,
          estimatedInputTokens,
          llmCalls: measuredLlmCalls,
          embeddingCalls: measuredEmbeddingCalls,
          toolCalls: measuredToolCalls,
          resolvedFacts: structured?.facts?.length ?? 0,
          maxOutputTokens: chatPolicy.maxOutputTokens,
          maxToolRounds: chatPolicy.maxToolRounds,
          kernelMode: kernelPrimary ? "plan_first_active" : "kernel_disabled",
          agentRuntime: "plan_first_v1",
          actionDraftError,
          rollout,
          numericAccuracy: numericAccuracy
            ? {
                accuracy: numericAccuracy.accuracy,
                missing: numericAccuracy.missing,
              }
            : null,
        },
      });

      // 8. Update conversation stats
      await db
        .update(chatConversations)
        .set({
          messageCount: sql`message_count + 2`,
          totalTokens: sql`total_tokens + ${result.tokensUsed}`,
          lastMessageAt: new Date(),
          title: conversationHistory.length === 0
            ? input.message.slice(0, 100)
            : undefined,
        })
        .where(eq(chatConversations.id, activeConversationId));

      // 9. Update user's AI tokens used
      const tokensToAdd = result.tokensUsed;
      if (user.type === "oauth") {
        await db
          .update(users)
          .set({ aiTokensUsed: sql`ai_tokens_used + ${tokensToAdd}` })
          .where(eq(users.id, user.id));
      } else {
        await db
          .update(localUsers)
          .set({ aiTokensUsed: sql`ai_tokens_used + ${tokensToAdd}` })
          .where(eq(localUsers.id, user.id));
      }

      return {
        response: result.response,
        conversationId: activeConversationId,
        tokensUsed: result.tokensUsed,
        model: result.model,
        toolsUsed: result.toolsUsed,
        structured,
      };
    }),

  confirmAction: aiProcedure
    .input(z.object({ actionId: z.number().int().positive(), conversationId: z.number().int().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      return runtimeConfirmAction(
        {
          userId: ctx.user.id,
          userType: ctx.user.type,
          userPlan: ctx.user.plan || "free",
          conversationId: input.conversationId,
        },
        input.actionId,
      );
    }),

  cancelAction: aiProcedure
    .input(z.object({ actionId: z.number().int().positive(), conversationId: z.number().int().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      return runtimeCancelAction(
        {
          userId: ctx.user.id,
          userType: ctx.user.type,
          userPlan: ctx.user.plan || "free",
          conversationId: input.conversationId,
        },
        input.actionId,
      );
    }),

  /**
   * Get user's conversation list.
   */
  getConversations: authedProcedure.query(async ({ ctx }) => {
    const conversations = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.userId, ctx.user.id),
          eq(chatConversations.userType, ctx.user.type),
        ),
      )
      .orderBy(desc(chatConversations.lastMessageAt))
      .limit(30);

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      messageCount: c.messageCount,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
    }));
  }),

  /**
   * Get messages for a specific conversation.
   */
  getConversation: authedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const [conv] = await db
        .select()
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.id, input.conversationId),
            eq(chatConversations.userId, ctx.user.id),
            eq(chatConversations.userType, ctx.user.type),
          ),
        )
        .limit(1);

      if (!conv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "المحادثة مش موجودة.",
        });
      }

      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, input.conversationId))
        .orderBy(chatMessages.createdAt);

      return {
        conversation: {
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
        },
        messages: messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            structured: structuredFromToolResults(m.toolResults),
          })),
      };
    }),

  /**
   * Delete a conversation and its messages.
   */
  clearConversation: authedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const [conv] = await db
        .select()
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.id, input.conversationId),
            eq(chatConversations.userId, ctx.user.id),
            eq(chatConversations.userType, ctx.user.type),
          ),
        )
        .limit(1);

      if (!conv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "المحادثة مش موجودة.",
        });
      }

      await db
        .delete(chatMessages)
        .where(eq(chatMessages.conversationId, input.conversationId));
      await db
        .delete(chatConversations)
        .where(eq(chatConversations.id, input.conversationId));

      return { success: true };
    }),

  /**
   * List active user memories (for memory management UI).
   */
  listMemories: authedProcedure.query(async ({ ctx }) => {
    const items = await db
      .select({
        id: aiMemoryItems.id,
        memoryType: aiMemoryItems.memoryType,
        content: aiMemoryItems.content,
        importance: aiMemoryItems.importance,
        createdAt: aiMemoryItems.createdAt,
        updatedAt: aiMemoryItems.updatedAt,
      })
      .from(aiMemoryItems)
      .where(
        and(
          eq(aiMemoryItems.userId, ctx.user.id),
          eq(aiMemoryItems.userType, ctx.user.type),
          eq(aiMemoryItems.status, "active"),
        ),
      )
      .orderBy(desc(aiMemoryItems.updatedAt))
      .limit(100);

    return items;
  }),

  /**
   * Forget/delete a specific user memory item.
   */
  forgetMemory: authedProcedure
    .input(z.object({ memoryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [item] = await db
        .select({ id: aiMemoryItems.id })
        .from(aiMemoryItems)
        .where(
          and(
            eq(aiMemoryItems.id, input.memoryId),
            eq(aiMemoryItems.userId, ctx.user.id),
            eq(aiMemoryItems.userType, ctx.user.type),
          ),
        )
        .limit(1);

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "الذاكرة مش موجودة أو تم حذفها بالفعل.",
        });
      }

      await db
        .update(aiMemoryItems)
        .set({ status: "forgotten" })
        .where(
          and(
            eq(aiMemoryItems.id, input.memoryId),
            eq(aiMemoryItems.userId, ctx.user.id),
            eq(aiMemoryItems.userType, ctx.user.type),
          ),
        );

      await db
        .delete(aiMemoryEmbeddings)
        .where(
          and(
            eq(aiMemoryEmbeddings.memoryItemId, input.memoryId),
            eq(aiMemoryEmbeddings.userId, ctx.user.id),
            eq(aiMemoryEmbeddings.userType, ctx.user.type),
          ),
        );

      invalidateUserMemory(ctx.user.id, ctx.user.type);
      await invalidateMemoryUserCache(ctx.user.id, ctx.user.type).catch(() => {});

      return { success: true };
    }),

  /**
   * Clear/forget all active user memories.
   */
  clearAllMemories: authedProcedure.mutation(async ({ ctx }) => {
    const items = await db
      .select({ id: aiMemoryItems.id })
      .from(aiMemoryItems)
      .where(
        and(
          eq(aiMemoryItems.userId, ctx.user.id),
          eq(aiMemoryItems.userType, ctx.user.type),
          eq(aiMemoryItems.status, "active"),
        ),
      );

    if (items.length > 0) {
      await db
        .update(aiMemoryItems)
        .set({ status: "forgotten" })
        .where(
          and(
            eq(aiMemoryItems.userId, ctx.user.id),
            eq(aiMemoryItems.userType, ctx.user.type),
          ),
        );

      await db
        .delete(aiMemoryEmbeddings)
        .where(
          and(
            eq(aiMemoryEmbeddings.userId, ctx.user.id),
            eq(aiMemoryEmbeddings.userType, ctx.user.type),
          ),
        );

      invalidateUserMemory(ctx.user.id, ctx.user.type);
      await invalidateMemoryUserCache(ctx.user.id, ctx.user.type).catch(() => {});
    }

    return { success: true, count: items.length };
  }),

  /**
   * Get available quick action prompts.
   */
  getQuickActions: authedProcedure.query(async () => {
    // Could be loaded from system settings in the future
    return [
      { label: "📊 ملخص الشهر", prompt: "إيه ملخص مصاريفي الشهر ده؟" },
      { label: "💰 صرفت كام النهاردة", prompt: "كم صرفت النهاردة؟" },
      {
        label: "📈 مقارنة بالشهر اللي فات",
        prompt: "قارن مصاريفي الشهر ده بالشهر اللي فات",
      },
      {
        label: "🏷️ أعلى الفئات",
        prompt: "إيه أعلى 3 فئات صرف عليها الشهر ده؟",
      },
      {
        label: "💳 أرصدة المحافظ",
        prompt: "فاضل كام في محافظي؟",
      },
      {
        label: "🎯 أهداف الادخار",
        prompt: "وصلت كام في أهداف الادخار بتاعتي؟",
      },
      {
        label: "💼 تحليل الكاش فلو",
        prompt: "إيه الدخل والمصروف والصافي الشهر ده؟ وإيه أكتر بندين عايزين مراجعة؟",
      },
    ];
  }),
});
