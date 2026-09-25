/**
 * The one writer of `ai_token_ledgers`: a row per paid AI call, priced by api/lib/ai-pricing.ts at the admin's or the
 * provider's rates, in the Cairo billing month. Every path that calls a model for a user records through here, so the
 * admin's cost views add up the same way whichever provider served the call. A row never carries what was said.
 */
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { aiTokenLedgers } from "../../db/schema";
import { db } from "../queries/connection";
import { aiCallCost, type CallUsage } from "./ai-pricing";
import type { LlmAttempt } from "./llm-router";
import { businessDateKey } from "./app-time";
import { createLogger } from "./log";
import { getSystemSettings } from "./settings-cache";

const log = createLogger("ai-ledger");

export interface AiLedgerEntry extends CallUsage {
  userId: number;
  userType: string;
  /** What the call was for: parse, chat, voice_call, voice_think, embedding, report… */
  channel: string;
  providerSlug: string;
  providerId?: number | null;
  modelId: string;
  latencyMs?: number;
  httpStatus?: number;
  finishReason?: string;
  traceId?: string;
  conversationId?: number | null;
  classificationLogId?: number | null;
  /** Prompt anatomy, when the caller measured it. */
  anatomy?: Partial<Record<"systemPromptTokens" | "memoryRagTokens" | "historyTokens" | "userInputTokens" | "toolSchemaTokens", number>>;
  /** A cost the caller priced itself (the live call prices each audio and text modality); else priced here. */
  costUsd?: number;
  metadata?: Record<string, unknown>;
  at?: Date;
}

export async function recordAiLedger(entry: AiLedgerEntry): Promise<void> {
  try {
    const cost = entry.costUsd !== undefined
      ? { usd: entry.costUsd, egp: await egpFor(entry.costUsd), priced: true, rateSource: "caller" as const }
      : await aiCallCost(entry.providerSlug, entry.modelId, entry);
    if (!cost.priced) {
      log.warn({ event: "ai_ledger.unpriced_model", provider: entry.providerSlug, model: entry.modelId, channel: entry.channel }, "No price for this model; set one in the admin console");
    }
    await db.insert(aiTokenLedgers).values({
      traceId: entry.traceId ?? randomUUID(),
      userId: entry.userId,
      userType: entry.userType,
      billingPeriod: businessDateKey(entry.at ?? new Date()).slice(0, 7),
      channel: entry.channel,
      providerId: entry.providerId ?? null,
      providerSlug: entry.providerSlug,
      modelId: entry.modelId,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      cachedTokens: entry.cachedTokens ?? 0,
      reasoningTokens: entry.reasoningTokens ?? 0,
      totalTokens: entry.promptTokens + entry.completionTokens + (entry.reasoningTokens ?? 0),
      systemPromptTokens: entry.anatomy?.systemPromptTokens ?? 0,
      memoryRagTokens: entry.anatomy?.memoryRagTokens ?? 0,
      historyTokens: entry.anatomy?.historyTokens ?? 0,
      userInputTokens: entry.anatomy?.userInputTokens ?? 0,
      toolSchemaTokens: entry.anatomy?.toolSchemaTokens ?? 0,
      costUsd: sql`${cost.usd.toFixed(8)}`,
      costEgp: sql`${cost.egp.toFixed(6)}`,
      latencyMs: entry.latencyMs ?? 0,
      httpStatus: entry.httpStatus ?? 200,
      finishReason: entry.finishReason ?? "stop",
      conversationId: entry.conversationId ?? null,
      classificationLogId: entry.classificationLogId ?? null,
      metadata: { ...entry.metadata, priced: cost.priced, rateSource: cost.rateSource },
    });
  } catch (error) {
    // Accounting must never fail the user's request.
    log.warn({ event: "ai_ledger.write_failed", channel: entry.channel, err: error }, "Ledger row not written");
  }
}

async function egpFor(usd: number): Promise<number> {
  const settings = await getSystemSettings();
  return Number((usd * (Number(settings.usd_to_egp_rate) || 48.5)).toFixed(6));
}

/** The provider behind an OpenAI-compatible base URL, as the ledger and the price table name it. */
export function providerSlugForBaseUrl(baseUrl: string): string {
  const host = (() => {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return "";
    }
  })();
  if (host.includes("fireworks")) return "fireworks";
  if (host.includes("deepseek")) return "deepseek";
  if (host.includes("openrouter")) return "openrouter";
  if (host.includes("generativelanguage.googleapis")) return "gemini";
  if (host.includes("openai")) return "openai";
  if (host.includes("groq")) return "groq";
  if (host.includes("nvidia")) return "nvidia";
  return host || "unknown";
}

/** Gemini's usage block, as `generateContent` returns it. */
export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
}

/** One ledger row for a Gemini call made for a user, from the usage block Google returns with every answer. */
export function recordGeminiCall(
  user: { id: number; type: string } | null | undefined,
  channel: string,
  model: string,
  usage: GeminiUsageMetadata | undefined,
): void {
  if (!user || !usage) return;
  void recordAiLedger({
    userId: user.id,
    userType: user.type,
    channel,
    providerSlug: "gemini",
    modelId: model,
    promptTokens: usage.promptTokenCount ?? 0,
    completionTokens: usage.candidatesTokenCount ?? 0,
    reasoningTokens: usage.thoughtsTokenCount ?? 0,
    cachedTokens: usage.cachedContentTokenCount ?? 0,
  });
}

/**
 * One ledger row per model call a request paid for, failovers included, each at its own provider's price. Without
 * the chain's attempts (a path that called one model), one row for the whole count, marked as not split.
 */
export function recordModelCalls(
  user: { id: number; type: string },
  channel: string,
  attempts: LlmAttempt[] | undefined,
  fallback: { model?: string | null; tokens: number; providerSlug?: string },
): void {
  const paid = (attempts ?? []).filter((attempt) => (attempt.promptTokens ?? 0) + (attempt.completionTokens ?? 0) > 0);
  if (paid.length) {
    for (const attempt of paid) {
      void recordAiLedger({
        userId: user.id,
        userType: user.type,
        channel,
        providerSlug: attempt.slug,
        modelId: attempt.model,
        promptTokens: attempt.promptTokens ?? 0,
        completionTokens: attempt.completionTokens ?? 0,
        cachedTokens: attempt.cachedTokens ?? 0,
        latencyMs: attempt.latencyMs,
        httpStatus: attempt.ok ? 200 : attempt.status ?? 0,
        finishReason: attempt.ok ? attempt.finishReason ?? "stop" : attempt.failure ?? "failed",
      });
    }
    return;
  }
  if (fallback.tokens > 0 && fallback.model) {
    void recordAiLedger({
      userId: user.id,
      userType: user.type,
      channel,
      providerSlug: fallback.providerSlug ?? "gemini",
      modelId: fallback.model,
      promptTokens: fallback.tokens,
      completionTokens: 0,
      metadata: { split: false },
    });
  }
}
