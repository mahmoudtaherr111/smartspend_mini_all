/**
 * The one path a typed or spoken sentence takes under the understanding engine
 * (setting `recording_engine` = `understanding`; docs/decisions/0052-understanding-engine.md).
 *
 * 1. Admission, the same for text and voice: the plan's parse switch, the daily limit and the
 *    token budget. The settings and the user's reading context load meanwhile.
 * 2. The engine reads the sentence (`api/lib/understanding/engine.ts`). When no provider can,
 *    the person is told to try again shortly; nothing is guessed and the failed tries are
 *    still recorded.
 * 3. The cost is recorded as every parse records it, the reading is logged once
 *    (`classification_logs`, the server's copy a save is later enriched from), and a question
 *    opens one `pending_clarifications` row.
 *
 * The answer has exactly the shape `ai.parseExpense` returns (`ParseResponse`), so the apps
 * need no change. Logs carry events and ids only, never the sentence, names or amounts.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { classificationLogs, pendingClarifications, userBusinesses } from "../../../db/schema";
import { recordModelCalls } from "../../lib/ai-ledger";
import {
  assertAiBudget,
  clampOutputTokens,
  countDailyAiRequests,
  estimateTokensFromText,
  trackAiTokens,
  type AiUsageUser,
} from "../../lib/ai-usage-policy";
import { createLogger } from "../../lib/log";
import { getSystemSettings } from "../../lib/settings-cache";
import { loadReadingContext } from "../../lib/understanding/context";
import { READING_CONTRACT_VERSION } from "../../lib/understanding/contract";
import { understand, UnderstandingUnavailableError, type Understanding, type UnderstandingUsage } from "../../lib/understanding/engine";
import type { LlmAttempt } from "../../lib/llm-router";
import { promptFingerprint } from "../../lib/understanding/prompt";
import { resolveUnderstandingRoutes } from "../../lib/understanding/routes";
import { getDb } from "../../queries/connection";
import { recordAICostMetric } from "../ai-cost-policy";
import { decisionOf, overallConfidenceOf, toParsedItems } from "./items";
import type { ParseDecision, ParseResponse, RecordedItem, UnderstandingTrace } from "./types";

const log = createLogger("recording.read-sentence");

export const UNAVAILABLE_MESSAGE = "مش قادرين نقرا الجملة دلوقتي. جرّب كمان شوية.";
const PARSE_OFF_MESSAGE = "تحليل الرسائل بالذكاء الاصطناعي غير متاح في خطتك الحالية.";
/** What the pipeline's budget estimate adds to the sentence for the prompts around it. */
const PROMPT_OVERHEAD_TOKENS = 420;
const MODEL_USED_MAX = 100;

export interface SentenceUser {
  id: number;
  type: "oauth" | "local";
  plan?: string;
}

export interface ReadSentenceInput {
  user: SentenceUser;
  text: string;
  channel: "text" | "voice";
  businessMode?: boolean;
  /** The admin's sandbox: never open a question (`decisionOf`). */
  skipClarification?: boolean;
  /** The transcription a spoken sentence came from: its model and tokens go on the log row. */
  stt?: { model: string; tokensUsed: number; seconds: number };
  /** When the request began (a recording: before it was transcribed). */
  startedAt?: number;
  /** The plan switch and the daily limit were checked already (voice checks them before paying for speech). */
  gateChecked?: boolean;
  /** False: a question is returned without opening a clarification (the caller updates its own). */
  openClarification?: boolean;
}

export interface ReadSentenceDeps {
  understand?: typeof understand;
  loadContext?: typeof loadReadingContext;
  resolveRoutes?: typeof resolveUnderstandingRoutes;
}

/** `u<contract>-p<prompt>-t<taxonomy>`: exactly what read the sentence, in the log's version column. */
export const READING_LOG_VERSION = `u${READING_CONTRACT_VERSION}-${promptFingerprint()}`;

const planOf = (user: SentenceUser) => user.plan || "free";

function dailyLimitOf(settings: Record<string, string>, plan: string): number {
  const defaults: Record<string, number> = { free: 10, pro: 100, ultra: 500 };
  // Read as the pipeline's gate reads it (`getAiClient` in `api/ai-router.ts`): digits only, else the plan's default.
  const raw = String(settings[`${plan}_daily_limit`] || defaults[plan] || "10").replace(/[^\d]/g, "");
  const parsed = parseInt(raw, 10);
  return (Number.isNaN(parsed) ? defaults[plan] : parsed) || 10;
}

/**
 * The plan's parse switch and the daily limit, with the messages the pipeline's gate gives.
 * Voice calls this before it pays for the transcription.
 */
export async function assertSentenceAllowed(user: SentenceUser, settings: Record<string, string>): Promise<void> {
  const plan = planOf(user);
  if (settings[`${plan}_ai_parse`] === "false") {
    throw new TRPCError({ code: "FORBIDDEN", message: PARSE_OFF_MESSAGE });
  }
  const dailyLimit = dailyLimitOf(settings, plan);
  const todayUsage = await countDailyAiRequests(user as AiUsageUser, "parse");
  if (todayUsage >= dailyLimit) {
    const upgrade = plan === "free" ? " تقدر ترقّي لـ Pro عشان تسجّل أكتر." : plan === "pro" ? " تقدر ترقّي لـ Ultra عشان تسجّل أكتر." : "";
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `وصلت لحد التسجيلات الذكية بتاعة النهارده (${dailyLimit}). الحد بيتجدد بكرة.${upgrade}`,
    });
  }
}

/** The active business a business-mode sentence is filed under, the one the reading context reads. */
async function activeBusinessId(user: SentenceUser): Promise<number | null> {
  // business_user_idx (user_id, user_type)
  const [business] = await getDb()
    .select({ id: userBusinesses.id })
    .from(userBusinesses)
    .where(and(eq(userBusinesses.userId, user.id), eq(userBusinesses.userType, user.type), eq(userBusinesses.isActive, true)))
    .orderBy(desc(userBusinesses.id))
    .limit(1);
  return business?.id ?? null;
}

/** The attempts as the trace keeps them: no provider message, which may quote what was sent. */
function slimAttempts(attempts: readonly LlmAttempt[]) {
  return attempts.map((attempt) => ({
    slug: attempt.slug,
    model: attempt.model,
    ok: attempt.ok,
    latencyMs: attempt.latencyMs,
    ...(attempt.failure ? { failure: attempt.failure } : {}),
    ...(attempt.status ? { status: attempt.status } : {}),
    promptTokens: attempt.promptTokens ?? 0,
    completionTokens: attempt.completionTokens ?? 0,
    cachedTokens: attempt.cachedTokens ?? 0,
  }));
}

interface Spend {
  attempts: LlmAttempt[];
  model: string | null;
  servedBy: string | null;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  latencyMs: number;
}

/** The tokens on the user's count, one ledger row per paid attempt, and the cost metric, as the pipeline records them. */
async function recordSpend(user: SentenceUser, input: ReadSentenceInput, spend: Spend, metadata: Record<string, unknown>): Promise<void> {
  if (spend.totalTokens > 0) await trackAiTokens(user, spend.totalTokens, "parse", spend.model ?? undefined);
  recordModelCalls(user, "parse", spend.attempts, { model: spend.model, tokens: spend.totalTokens, providerSlug: spend.servedBy ?? undefined });
  void recordAICostMetric({
    userId: user.id,
    userType: user.type,
    channel: "parse",
    plan: planOf(user),
    intentKind: input.channel === "voice" ? "voice_expense_parse" : "expense_parse",
    model: spend.model,
    inputTokens: spend.promptTokens,
    outputTokens: spend.completionTokens,
    totalTokens: spend.totalTokens,
    embeddingCalls: 0,
    llmCalls: spend.attempts.length,
    toolCalls: 0,
    latencyMs: spend.latencyMs,
    metadata: { inputChannel: input.channel, engine: "understanding", cachedTokens: spend.cachedTokens, sttTokensUsed: input.stt?.tokensUsed ?? 0, ...metadata },
  }).catch(() => undefined);
}

const spendOf = (usage: UnderstandingUsage): Spend => ({
  attempts: usage.attempts,
  model: usage.model,
  servedBy: usage.servedBy,
  promptTokens: usage.promptTokens,
  completionTokens: usage.completionTokens,
  cachedTokens: usage.cachedTokens,
  totalTokens: usage.totalTokens,
  latencyMs: usage.latencyMs,
});

function traceOf(input: ReadSentenceInput, understanding: Understanding, decision: ParseDecision, confidence: number, itemCount: number, latencyMs: number): UnderstandingTrace {
  const { usage } = understanding;
  return {
    schemaVersion: 2,
    route: input.channel === "voice" ? "voice_expense_parse" : "expense_parse",
    engine: "understanding_engine.v1",
    engineRole: "expense_classification",
    agentBoundary: "independent_classification_engine",
    tools: ["understanding_engine.v1", "reading_guard", "reading_policy"],
    dataNeeds: [input.channel === "voice" ? "speech.transcription" : null, "reading.context"].filter((need): need is string => Boolean(need)),
    costPolicy: { llm: understanding.source === "model" ? "model_reads_sentence" : "skipped", embedding: "skipped", sendsRawHistoryToLLM: false, usesFinanceSummaryOnly: false },
    inputChannel: input.channel,
    provider: usage.servedBy,
    model: usage.model,
    parsedBy: "ai",
    decision,
    confidence,
    itemCount,
    llmCalls: usage.attempts.length,
    embeddingCalls: 0,
    inputTokens: usage.promptTokens,
    totalTokens: usage.totalTokens,
    cachedTokens: usage.cachedTokens,
    latencyMs,
    financeContextSource: "none",
    hallucinationRisk: decision === "clarify" ? "high" : decision === "review" ? "medium" : "low",
    routing: null,
    versions: { ...understanding.versions },
    ...(input.stt ? { stt: { model: input.stt.model, tokensUsed: input.stt.tokensUsed, durationSeconds: input.stt.seconds } } : {}),
  };
}

const insertIdOf = (result: unknown): number | undefined => {
  const raw = (Array.isArray(result) ? result[0] : result) as { insertId?: unknown } | undefined;
  return Number(raw?.insertId) || undefined;
};

export async function readSentence(input: ReadSentenceInput, deps: ReadSentenceDeps = {}): Promise<ParseResponse> {
  const startedAt = input.startedAt ?? Date.now();
  const understandFn = deps.understand ?? understand;
  const loadContext = deps.loadContext ?? loadReadingContext;
  const resolveRoutes = deps.resolveRoutes ?? resolveUnderstandingRoutes;
  const { user } = input;
  const text = String(input.text ?? "");

  // What the reading needs whatever admission decides starts now; a refusal leaves no unhandled rejection behind.
  const settingsLoad = getSystemSettings();
  const businessLoad = input.businessMode
    ? activeBusinessId(user).catch((err: unknown) => {
      log.warn({ err, event: "recording.business_load_failed", userId: user.id, userType: user.type }, "The active business could not be read");
      return null;
    })
    : Promise.resolve(null);
  const contextLoad = businessLoad.then((businessId) => loadContext({ id: user.id, type: user.type }, { businessMode: businessId !== null }));
  settingsLoad.catch(() => undefined);
  contextLoad.catch(() => undefined);

  const settings = await settingsLoad;
  if (!input.gateChecked) await assertSentenceAllowed(user, settings);
  const estimatedInputTokens = estimateTokensFromText(text) + PROMPT_OVERHEAD_TOKENS;
  const budget = await assertAiBudget(user as AiUsageUser, "parse", estimatedInputTokens);
  const maxOutputTokens = clampOutputTokens(budget.perRequestMax, budget.remaining, estimatedInputTokens);

  const [context, businessId] = await Promise.all([contextLoad, businessLoad]);
  const routes = await resolveRoutes(planOf(user), settings);

  let understanding: Understanding;
  try {
    understanding = await understandFn({ text, context, settings, routes, maxOutputTokens });
  } catch (err) {
    const failed = err instanceof UnderstandingUnavailableError ? err : null;
    const attempts = failed?.attempts ?? [];
    const tokens = failed?.tokens ?? { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0 };
    await recordSpend(user, input, {
      attempts, model: attempts.at(-1)?.model ?? null, servedBy: attempts.at(-1)?.slug ?? null, ...tokens, latencyMs: Date.now() - startedAt,
    }, { outcome: "unavailable" });
    // The error itself is not logged: its attempts may carry a provider's message about what it was sent.
    log.warn(
      {
        event: "recording.reading_unavailable", userId: user.id, userType: user.type, channel: input.channel,
        attempts: attempts.length, failures: attempts.map((attempt) => attempt.failure ?? (attempt.ok ? "unreadable" : "failed")),
        ...(failed ? {} : { errorName: err instanceof Error ? err.name : typeof err }),
      },
      "No provider could read the sentence",
    );
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: UNAVAILABLE_MESSAGE, cause: err });
  }

  const items: RecordedItem[] = toParsedItems(understanding, { people: context.people, businessId });
  const decision = decisionOf(understanding.outcome, input.skipClarification);
  const overallConfidence = overallConfidenceOf(decision, items);
  const question = decision === "clarify" ? understanding.question || "ممكن توضح أكتر؟" : undefined;
  const processingTimeMs = Date.now() - startedAt;

  await recordSpend(user, input, spendOf(understanding.usage), { decision, itemCount: items.length, source: understanding.source });

  const flags = [...new Set(understanding.events.flatMap((event) => event.flags))];
  const parseModel = understanding.usage.model ?? "";
  let classificationLogId: number | undefined;
  try {
    const [result] = await getDb()
      .insert(classificationLogs)
      .values({
        userId: user.id,
        userType: user.type,
        originalText: text,
        parsedBy: "ai",
        finalResult: items,
        confidence: overallConfidence,
        decision,
        classificationVersion: READING_LOG_VERSION,
        reasoningTraceLight: {
          outcome: understanding.outcome,
          reasons: understanding.reasons,
          flags,
          route: { servedBy: understanding.usage.servedBy, model: understanding.usage.model, degradedSchema: understanding.usage.degradedSchema, attempts: slimAttempts(understanding.usage.attempts) },
          usage: {
            promptTokens: understanding.usage.promptTokens,
            completionTokens: understanding.usage.completionTokens,
            cachedTokens: understanding.usage.cachedTokens,
            totalTokens: understanding.usage.totalTokens,
            latencyMs: understanding.usage.latencyMs,
          },
          versions: understanding.versions,
          ...(understanding.problems.length ? { problems: understanding.problems } : {}),
          ...(context.degraded.length ? { degraded: context.degraded } : {}),
        },
        ambiguityFlags: flags,
        inputChannel: input.channel,
        needsFollowup: decision !== "auto_save",
        modelUsed: (input.stt ? `STT: ${input.stt.model} | Parse: ${parseModel}` : parseModel).slice(0, MODEL_USED_MAX),
        tokensUsed: understanding.usage.totalTokens + (input.stt?.tokensUsed ?? 0),
        processingTimeMs,
      });
    classificationLogId = insertIdOf(result);
  } catch (err) {
    // A trace-storage outage must not keep the person from reviewing what was read.
    log.warn({ err, event: "recording.log_write_failed", userId: user.id, userType: user.type }, "The reading log row could not be written");
  }

  let clarificationId: number | undefined;
  if (decision === "clarify" && input.openClarification !== false) {
    try {
      const [result] = await getDb()
        .insert(pendingClarifications)
        .values({
          userId: user.id,
          userType: user.type,
          question: question!,
          originalText: text,
          status: "pending",
          contextData: {
            items,
            classificationLogId,
            source: input.channel === "voice" ? "voice" : "ai_parsed",
            followUps: 0,
            ...(input.businessMode ? { businessMode: true } : {}),
          },
        });
      // The row this INSERT made, never "the user's latest pending one": two parses at once would swap ids.
      clarificationId = insertIdOf(result);
    } catch (err) {
      log.warn({ err, event: "recording.clarification_write_failed", userId: user.id, userType: user.type }, "The clarification could not be stored");
    }
  }

  log.info(
    { event: "recording.read", userId: user.id, userType: user.type, channel: input.channel, decision, itemCount: items.length, classificationLogId, clarificationId },
    "Sentence read",
  );

  return {
    text,
    items,
    model: parseModel,
    parsedBy: "ai",
    decision,
    overallConfidence,
    ...(question !== undefined ? { clarificationQuestion: question } : {}),
    ...(clarificationId !== undefined ? { clarificationId } : {}),
    processingTimeMs,
    trace: traceOf(input, understanding, decision, overallConfidence, items.length, processingTimeMs),
    ...(classificationLogId !== undefined ? { classificationLogId } : {}),
  };
}
