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
  assertAiBudgetRemaining,
  countDailyAiRequests,
  estimateTokensFromText,
  trackAiTokens,
  type AiBudget,
  type AiUsageUser,
} from "../../lib/ai-usage-policy";
import { maxTokensFor } from "../../lib/anthropic-client";
import { createLogger } from "../../lib/log";
import { getSystemSettings } from "../../lib/settings-cache";
import { loadReadingContext } from "../../lib/understanding/context";
import { READING_CONTRACT_VERSION, READING_SCHEMA } from "../../lib/understanding/contract";
import { recordingChunks, outputTokensFor, understand, UnderstandingUnavailableError, type Understanding, type UnderstandingUsage } from "../../lib/understanding/engine";
import type { LlmAttempt, LlmRoute } from "../../lib/llm-router";
import { buildSystemPrompt, buildUserPrompt, MAX_SENTENCE_CHARS, promptFingerprint } from "../../lib/understanding/prompt";
import { toPromptContext, type ReadingContext } from "../../lib/understanding/reading-context";
import { resolveUnderstandingRoutes } from "../../lib/understanding/routes";
import { getDb } from "../../queries/connection";
import { recordAICostMetric } from "../ai-cost-policy";
import { randomUUID } from "node:crypto";
import { decisionOf, overallConfidenceOf, splitMissingAmounts, toParsedItems } from "./items";
import { advanceRecording, getRecordingReply, recordingKey, recordingLimits, reserveRecording, settleRecording, type RecordingLease } from "./admission";
import type { ParseDecision, ParseResponse, RecordedItem, UnderstandingTrace } from "./types";

const log = createLogger("recording.read-sentence");

export const UNAVAILABLE_MESSAGE = "مش قادرين نقرا الجملة دلوقتي. جرّب كمان شوية.";
const PARSE_OFF_MESSAGE = "تحليل الرسائل بالذكاء الاصطناعي غير متاح في خطتك الحالية.";
const SCHEMA_AND_FRAMING_TOKENS = estimateTokensFromText(JSON.stringify(READING_SCHEMA)) + 128;
const MIN_REPLY_TOKENS = 64;
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
  requestKey?: string;
  reservation?: RecordingLease;
  /** Bank-capture follow-up questions keep their existing admission rules. */
  captureContinuation?: boolean;
  /** False: a question is returned without opening a clarification (the caller updates its own). */
  openClarification?: boolean;
  partialBooking?: boolean;
  /** Chat owns the transaction that publishes questions and saves their ready siblings. */
  chatRecording?: boolean;
  /** Server-issued identity of a single item waiting for the user's reply. */
  continuationItemId?: string;
  /** Owned original business on a server-side continuation. */
  businessIdForContinuation?: number;
}

export interface ReadSentenceDeps {
  understand?: typeof understand;
  loadContext?: typeof loadReadingContext;
  resolveRoutes?: typeof resolveUnderstandingRoutes;
}

/** `u<contract>-p<prompt>-t<taxonomy>`: exactly what read the sentence, in the log's version column. */
export const READING_LOG_VERSION = `u${READING_CONTRACT_VERSION}-${promptFingerprint()}`;

const planOf = (user: SentenceUser) => user.plan || "free";

function providerReplyHeadroom(route: LlmRoute): number {
  if (route.protocol === "anthropic") return maxTokensFor(route.model, 1) - 1;
  // The Groq adapter can raise the provider cap to make room for gpt-oss reasoning.
  return route.suppressReasoning && /gpt-oss/i.test(route.model) ? 1_024 : 0;
}

export function budgetReading(text: string, context: ReadingContext, settings: Record<string, string>, routes: LlmRoute[], budget: AiBudget): { routes: LlmRoute[]; maxOutputTokens: number; reservedTokens: number } {
  const sentence = text.trim();
  const ordered = routes.filter((route) => route.apiKey && route.model).sort((a, b) => a.priority - b.priority);
  if (sentence.length > MAX_SENTENCE_CHARS) {
    const chunks = recordingChunks(sentence);
    if (chunks.length) {
      const allowance = { ...budget, remaining: Math.floor(budget.remaining / chunks.length) };
      const plans = chunks.map(chunk => budgetReading(chunk, context, settings, ordered, allowance));
      return { routes: ordered.slice(0, Math.min(...plans.map(plan => plan.routes.length))),
        maxOutputTokens: Math.min(...plans.map(plan => plan.maxOutputTokens)),
        reservedTokens: plans.reduce((total, plan) => total + plan.reservedTokens, 0) };
    }
  }
  if (!sentence || sentence.length > MAX_SENTENCE_CHARS || !ordered.length) {
    return { routes: ordered, maxOutputTokens: budget.perRequestMax, reservedTokens: 0 };
  }

  const detail = settings.understanding_prompt_detail === "compact" ? "compact" : "full";
  const system = buildSystemPrompt(detail);
  const prompt = buildUserPrompt(toPromptContext(context), sentence, detail);
  // The user cap applies to the sentence. The monthly balance pays for the full call, including cached input.
  const promptTokens = Math.ceil((estimateTokensFromText(system) + estimateTokensFromText(prompt)) * 1.1) + SCHEMA_AND_FRAMING_TOKENS;
  const firstRouteInput = promptTokens + providerReplyHeadroom(ordered[0]);
  assertAiBudgetRemaining(budget, firstRouteInput + Math.min(MIN_REPLY_TOKENS, budget.perRequestMax));
  const maxOutputTokens = Math.min(budget.perRequestMax, budget.remaining - firstRouteInput);
  const perRoute = promptTokens + outputTokensFor(sentence, maxOutputTokens);

  // An unusable reply can be billable. Only offer fallback routes that fit in the same monthly balance.
  let left = budget.remaining;
  const affordable: LlmRoute[] = [];
  for (const route of ordered) {
    const tokens = perRoute + providerReplyHeadroom(route);
    if (left < tokens) break;
    left -= tokens;
    affordable.push(route);
  }
  return { routes: affordable, maxOutputTokens, reservedTokens: budget.remaining - left };
}

/** Voice checks this switch before it pays for transcription. Count limits are checked while reserving. */
export function assertSentenceAllowed(user: SentenceUser, settings: Record<string, string>): void {
  if (settings[`${planOf(user)}_ai_parse`] === "false") {
    throw new TRPCError({ code: "FORBIDDEN", message: PARSE_OFF_MESSAGE });
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
  if (input.requestKey && !input.reservation) {
    const reply = await getRecordingReply(input.user, input.requestKey, input.text);
    if (reply) return reply;
  }
  let lease = input.reservation;
  let paidTokens: number | null = input.stt?.tokensUsed ?? null;
  try {
    const response = await readWithReservation(input, deps, (reservation, actual) => {
      lease = reservation;
      paidTokens = actual;
    });
    if (lease) await settleRecording(lease, paidTokens, response);
    return response;
  } catch (error) {
    if (lease) await settleRecording(lease, paidTokens);
    throw error;
  }
}

async function readWithReservation(input: ReadSentenceInput, deps: ReadSentenceDeps, checkpoint: (lease: RecordingLease, paidTokens: number | null) => void): Promise<ParseResponse> {
  const startedAt = input.startedAt ?? Date.now();
  const understandFn = deps.understand ?? understand;
  const loadContext = deps.loadContext ?? loadReadingContext;
  const resolveRoutes = deps.resolveRoutes ?? resolveUnderstandingRoutes;
  const { user } = input;
  const text = String(input.text ?? "");

  // What the reading needs whatever admission decides starts now; a refusal leaves no unhandled rejection behind.
  const settingsLoad = getSystemSettings();
  const businessLoad = input.businessIdForContinuation ? Promise.resolve(input.businessIdForContinuation) : input.businessMode
    ? activeBusinessId(user).catch((err: unknown) => {
      log.warn({ err, event: "recording.business_load_failed", userId: user.id, userType: user.type }, "The active business could not be read");
      return null;
    })
    : Promise.resolve(null);
  const contextLoad = businessLoad.then((businessId) => loadContext({ id: user.id, type: user.type }, { businessMode: businessId !== null }));
  settingsLoad.catch(() => undefined);
  contextLoad.catch(() => undefined);

  const settings = await settingsLoad;
  if (!input.gateChecked) assertSentenceAllowed(user, settings);
  const limits = recordingLimits(settings, user);
  if (input.captureContinuation && await countDailyAiRequests(user, "parse") >= limits.daily) {
    throw new TRPCError({ code: "FORBIDDEN", message: `وصلت لحد التسجيلات الذكية بتاعة النهارده (${limits.daily}). الحد بيتجدد بكرة.` });
  }
  const budget = await assertAiBudget(user as AiUsageUser, "parse", estimateTokensFromText(text), settings, {
    recordingQuality: true, ...(input.captureContinuation ? {} : { recordingBudget: { limit: limits.tokens, used: 0 } }),
  });

  const [context, businessId] = await Promise.all([contextLoad, businessLoad]);
  const resolvedRoutes = await resolveRoutes(planOf(user), settings);
  const planTokens = (remaining: number) => {
    const plan = budgetReading(text, context, settings, resolvedRoutes, { ...budget, remaining: Math.min(budget.remaining, remaining) });
    return { plan, reservedTokens: plan.reservedTokens };
  };
  const reservation = input.captureContinuation ? {
    lease: null, plan: planTokens(budget.remaining).plan,
  } : input.reservation ? {
    lease: input.reservation,
    plan: await advanceRecording(input.reservation, settings, input.stt?.tokensUsed ?? 0, planTokens),
  } : await reserveRecording(user, input.requestKey ?? recordingKey(input.channel), settings, planTokens, new Date(startedAt), text);
  if ("reply" in reservation && reservation.reply) return reservation.reply;
  const { lease, plan: { routes, maxOutputTokens } } = reservation;
  if (lease) checkpoint(lease, null);

  let understanding: Understanding;
  try {
    understanding = await understandFn({ text, context, settings, routes, maxOutputTokens });
  } catch (err) {
    const failed = err instanceof UnderstandingUnavailableError ? err : null;
    const attempts = failed?.attempts ?? [];
    const tokens = failed?.tokens ?? { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0 };
    if (lease && failed) checkpoint(lease, tokens.totalTokens);
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
  if (lease) checkpoint(lease, understanding.usage.totalTokens);

  const itemContext = { people: context.people, businessId };
  const split = input.partialBooking && !input.skipClarification && (input.openClarification !== false || input.chatRecording)
    && settings.understanding_auto_save === "true"
    ? splitMissingAmounts(understanding, { ...itemContext, sentence: text })
    : null;
  const items: RecordedItem[] = split?.ready ?? toParsedItems(understanding, itemContext);
  if (input.continuationItemId && items.length === 1) items[0].readingItemId = input.continuationItemId;
  const decision = decisionOf(understanding.outcome, input.skipClarification);
  const overallConfidence = overallConfidenceOf(decision, items);
  const question = decision === "clarify" ? understanding.question || "ممكن توضح أكتر؟" : undefined;
  const restateSentence = understanding.reasons.includes("foreign_currency");
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
          ...(input.chatRecording ? { chatRecording: true } : {}),
          ...(split ? { partialBooking: {
            missing: split.missing.map(clause => ({ clause, itemId: randomUUID() })),
            businessId,
          } } : {}),
          ...(input.skipClarification ? { clarificationSuppressed: true } : {}),
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
    log.warn({ err, event: "recording.log_write_failed", userId: user.id, userType: user.type }, "The reading log row could not be written");
  }
  // A save uses this server-side row to recover the event's kind and linked wallet.
  if (!classificationLogId && items.length > 0) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: UNAVAILABLE_MESSAGE });
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
            recordingEngine: "understanding",
            ...(restateSentence ? { restateSentence: true } : {}),
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
    ...(split ? { partialReady: true } : {}),
    model: parseModel,
    parsedBy: "ai",
    decision,
    overallConfidence,
    ...(question !== undefined ? { clarificationQuestion: question } : {}),
    ...(restateSentence ? { restateSentence: true } : {}),
    ...(clarificationId !== undefined ? { clarificationId } : {}),
    processingTimeMs,
    trace: traceOf(input, understanding, decision, overallConfidence, items.length, processingTimeMs),
    ...(classificationLogId !== undefined ? { classificationLogId } : {}),
  };
}
