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
  systemSettings,
  users,
  localUsers,
} from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { processAIChatMessage } from "./services/ai-chat-service";
import {
  AI_RESPONSE_SCHEMA_VERSION,
  embeddingApiCallsFromCacheHits,
  runAIKernelActive,
  runAIKernelShadow,
  type AIRequest,
  type AIResponse,
} from "./services/ai-kernel";
import { routeIntent } from "./services/ai-kernel/intent-router";
import { hasSemanticMemoryCandidate, writeConversationMemory, type MemoryMessage } from "./services/ai-memory";
import {
  recordAICostMetric,
  resolveAICostPolicy,
  resolveAIRollout,
  validateNumbersAgainstFacts,
} from "./services/ai-cost-policy";
import {
  cancelAction as runtimeCancelAction,
  confirmAction as runtimeConfirmAction,
  maybeCreateActionDraftFromMessage,
  mergeActionArtifacts,
} from "./services/action-runtime";

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
  aiKernelPrimaryEnabled: boolean;
  settings: Record<string, string>;
}> {
  const rows = await db.select().from(systemSettings);
  const s: Record<string, string> = {};
  rows.forEach((r) => {
    if (r.key && r.value) s[r.key] = r.value;
  });

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
    aiKernelEnabled: s.ai_kernel_enabled === "true",
    aiKernelPrimaryEnabled: s.ai_kernel_primary_enabled !== "false",
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
  const names: Record<string, string> = {
    food: "الأكل والمشروبات",
    transport: "المواصلات",
    shopping: "التسوق",
    health: "الصحة",
    bills: "الفواتير",
    saving: "الادخار",
    uncategorized: "غير مصنف",
  };
  return names[value ?? ""] ?? value ?? "غير مصنف";
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
    tokensUsed: Math.ceil((message.length + response.length) / 3.5),
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
      const aiKernelActive = config.aiKernelEnabled && rollout.enabled;
      const legacyFallbackAllowed =
        !aiKernelActive || config.settings.ai_kernel_legacy_fallback_enabled === "true";

      // Check if chatbot is enabled for this plan
      if (!config.enabled[plan]) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "الشات بوت مش متاح في خطتك الحالية. ترقي للبرو عشان تستخدمه! 🚀",
        });
      }

      if (!config.apiKey) {
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
      }
      const activeConversationId: number = conversationId;

      // 4. Load conversation history from DB
      const existingMessages = await db
        .select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, activeConversationId))
        .orderBy(chatMessages.createdAt);

      const conversationHistory = existingMessages
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

      const kernelRequest: AIRequest = {
        channel: "chat",
        userId: user.id,
        userType: user.type,
        userPlan: plan,
        message: input.message,
        conversationId: activeConversationId,
        conversationHistory: conversationHistory.slice(-config.maxHistory),
        metadata: {
          legacyPath: legacyFallbackAllowed ? "processAIChatMessage" : "disabled",
          legacyModel: config.model,
          legacyFallbackAllowed,
          deprecatedPrimaryFlag: config.aiKernelPrimaryEnabled,
          rollout,
          devQaBypassDailyLimit,
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

      const kernelPrimaryCandidate = aiKernelActive
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
      const kernelPrimary = kernelPrimaryCandidate;

      const kernelShadowPromise =
        legacyFallbackAllowed && config.aiKernelEnabled && !kernelPrimary
          ? runAIKernelShadow(kernelRequest).catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              console.warn("[AI Kernel Shadow] failed", message);
              return undefined;
            })
          : undefined;

      // 6. Process through AI
      const maxTokens = Math.min(config.maxTokens[plan] || 1000, chatPolicy.maxOutputTokens);
      let result = kernelPrimary
        ? {
            response: kernelPrimary.content,
            tokensUsed: kernelPrimary.tokensUsed ?? Math.ceil(kernelPrimary.content.length / 3.5),
            model: kernelPrimary.model ?? config.model,
            toolsUsed: dataNeedKinds(kernelPrimary),
          }
        : legacyFallbackAllowed
          ? await processAIChatMessage({
            userId: user.id,
            userType: user.type,
            userPlan: plan,
            message: input.message,
            conversationHistory,
            config: {
              apiKey: config.apiKey,
              baseUrl: config.baseUrl,
              model: config.model,
              maxTokens,
              maxHistory: config.maxHistory,
              maxToolRounds: chatPolicy.maxToolRounds,
            },
          })
          : {
              response: "مش قادر أوصل لعقل الشات المركزي دلوقتي. جرّب تاني بعد لحظة.",
              tokensUsed: Math.ceil(input.message.length / 3.5) + 18,
              model: "ai-kernel-unavailable",
              toolsUsed: [] as string[],
            };

      const shadow = kernelPrimary ?? (kernelShadowPromise ? await kernelShadowPromise : undefined);
      if (shadow) {
        console.info(
          "[AI Kernel Comparison]",
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
      const actionDraft = aiKernelActive
        ? await maybeCreateActionDraftFromMessage(
            {
              userId: user.id,
              userType: user.type,
              userPlan: plan,
              conversationId: activeConversationId,
            },
            input.message,
          ).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            actionDraftError = message;
            console.warn("[AI Action Runtime] draft failed", message);
            return null;
          })
        : null;
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
          tokensUsed: result.tokensUsed + Math.ceil(Math.max(0, actionAwareResponse.length - result.response.length) / 3.5),
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
          ...conversationHistory.map((message) => ({
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
      const measuredLlmCalls = kernelPrimary
        ? Number(kernelPrimary.debug?.llmCalls ?? 0)
        : 1 + result.toolsUsed.length;
      const measuredToolCalls = result.toolsUsed.length;
      const measuredEmbeddingCalls = embeddingCallsFromStructured(structured);
      const numericAccuracy = structured?.facts?.length
        ? validateNumbersAgainstFacts(result.response, structured.facts)
        : undefined;
      void recordAICostMetric({
        userId: user.id,
        userType: user.type,
        channel: "chat",
        plan,
        intentKind: routedIntent.kind,
        model: result.model,
        inputTokens: estimatedInputTokens,
        outputTokens: Math.max(0, result.tokensUsed - estimatedInputTokens),
        totalTokens: result.tokensUsed,
        embeddingCalls: measuredEmbeddingCalls,
        llmCalls: measuredLlmCalls,
        toolCalls: measuredToolCalls,
        latencyMs: Date.now() - startedAt,
        metadata: {
          conversationId: activeConversationId,
          traceId: structured?.traceId,
          dataNeeds: dataNeedKinds(structured),
          cacheHits: ((structured?.debug as { cacheHits?: unknown[] } | undefined)?.cacheHits ?? []),
          resolvedFacts: structured?.facts?.length ?? 0,
          maxOutputTokens: chatPolicy.maxOutputTokens,
          maxToolRounds: chatPolicy.maxToolRounds,
          kernelMode: kernelPrimary
            ? "active"
            : shadow
              ? "legacy_with_shadow"
              : legacyFallbackAllowed
                ? "legacy_explicit"
                : "kernel_unavailable",
          legacyFallbackAllowed,
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
    ];
  }),
});
