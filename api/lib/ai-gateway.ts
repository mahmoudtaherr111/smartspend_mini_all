/**
 * SmartSpend Universal AI Gateway
 *
 * The Single Source of Truth & Execution Gateway for ALL AI operations across:
 * - Providers: OpenRouter, DeepSeek, Google Gemini, Groq, Fireworks, NVIDIA, Anthropic, Custom endpoints
 * - Channels: chat, classification, ocr, voice_stt, voice_call, report, goal, sms, business, embedding
 * - Metering: Prompt, Completion, Cached, Reasoning tokens & Real Money USD/EGP calculation
 * - Observability: Payload Token Anatomy decomposition (System, RAG, History, User, Tools)
 * - Auditing: Immutable ledger recording (ai_token_ledgers) + Monthly billing cycle quota checks
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../queries/connection";
import { aiProviders, aiModels, aiTokenLedgers, users, localUsers } from "../../db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { getSystemSettings } from "./settings-cache";
import { TRPCError } from "@trpc/server";
import { businessDateKey } from "./app-time";
import { env } from "./env";
import { createLogger } from "./log";
import { keyRing, needsReseal, openProviderKey, sealProviderKey, type OpenedKey } from "./provider-key-crypto";
import { defaultGeminiModelForPlan, geminiFallbackChain, mapModelName } from "./model-mapper";

const log = createLogger("ai-gateway");

// ─── Types & Interfaces ─────────────────────────────────────────────

export type AiPurpose =
  | "chat"
  | "classification"
  | "ocr"
  | "voice_stt"
  | "voice_call"
  | "report"
  | "goal"
  | "sms"
  | "business"
  | "embedding";

export type AiTier = "free" | "pro" | "ultra";
export type UserType = "oauth" | "local";

export interface GatewayUser {
  id: number;
  type: UserType;
  plan?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface TokenAnatomy {
  systemPromptTokens: number;
  memoryRagTokens: number;
  historyTokens: number;
  userInputTokens: number;
  toolSchemaTokens: number;
}

export interface NormalizedUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUsd: number;
  costEgp: number;
}

export interface GatewayExecutionParams {
  user: GatewayUser;
  purpose: AiPurpose;
  channel: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  financialContext?: string; // Injected RAG facts/memory
  userQuery?: string;        // The specific raw prompt
  tools?: any[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: "json_object" | "text" };
  traceId?: string;
  conversationId?: number;
  classificationLogId?: number;
  forceModelId?: string;     // Explicit model override if specified
}

export interface GatewayExecutionResult {
  text: string;
  toolCalls?: any[] | null;
  usage: NormalizedUsage;
  anatomy: TokenAnatomy;
  provider: string;
  model: string;
  latencyMs: number;
  finishReason: string;
  traceId: string;
}

export interface DiscoveredModel {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
}

// ─── Stored provider keys ───────────────────────────────────────────
// Sealing and opening live in `./provider-key-crypto`. Loading the providers is where a key reaches the
// newest secret and where an unreadable one is reported: every provider row passes through here within a
// minute of a process starting to route model calls.

/** An unreadable key is logged once per stored value per process, not once a minute. */
const reportedUnreadable = new Set<string>();
let warnedAboutJwtSealing = false;

type StoredProvider = typeof aiProviders.$inferSelect;

/**
 * Writes a key opened with an older secret (or stored as plain text) back sealed with the current one.
 *
 * The write is conditional on the stored value being unchanged, so a key the admin replaced meanwhile, or
 * another replica resealing the same row, is left alone; and it never fails the refresh that asked for it.
 */
async function resealProviderKeys(providers: StoredProvider[], opened: Map<number, OpenedKey>): Promise<void> {
  for (const provider of providers) {
    const key = opened.get(provider.id);
    if (!key || !needsReseal(key)) continue;
    try {
      await db
        .update(aiProviders)
        .set({ apiKeyEncrypted: sealProviderKey(key.key) })
        .where(and(eq(aiProviders.id, provider.id), eq(aiProviders.apiKeyEncrypted, provider.apiKeyEncrypted)));
      log.info(
        { event: "ai_gateway.key_resealed", provider: provider.slug, from: key.secret ?? key.state, to: keyRing().sealing.secret },
        "Moved a provider key to the current secret",
      );
    } catch (err) {
      log.warn({ err, event: "ai_gateway.key_reseal_failed", provider: provider.slug }, "Could not reseal a provider key");
    }
  }
}

function reportKeyProblems(providers: StoredProvider[], opened: Map<number, OpenedKey>): void {
  for (const provider of providers) {
    if (opened.get(provider.id)?.state !== "unreadable") continue;
    const fingerprint = `${provider.id}:${provider.apiKeyEncrypted.slice(-16)}`;
    if (reportedUnreadable.has(fingerprint)) continue;
    reportedUnreadable.add(fingerprint);
    log.error(
      { event: "ai_gateway.key_unreadable", provider: provider.slug, active: provider.isActive },
      "No configured secret opens this provider's key; it is left out of routing until the key is entered again",
    );
  }
  if (!warnedAboutJwtSealing && env.NODE_ENV === "production" && keyRing().sealing.secret === "JWT_SECRET") {
    warnedAboutJwtSealing = true;
    log.warn(
      { event: "ai_gateway.sealed_with_jwt_secret" },
      "Provider keys are sealed with JWT_SECRET; set AI_GATEWAY_SECRET before rotating JWT_SECRET",
    );
  }
}

// ─── Token Estimator ────────────────────────────────────────────────

export function estimateTokens(text: string | undefined | null): number {
  const clean = String(text || "").trim();
  if (!clean) return 0;
  const arabicChars = (clean.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const otherChars = clean.length - arabicChars;
  return Math.ceil(arabicChars * 0.65) + Math.ceil(otherChars / 4) + Math.ceil(clean.split(/\s+/).length * 0.35);
}

export function computePromptAnatomy(params: {
  systemPrompt?: string;
  financialContext?: string;
  messages: ChatMessage[];
  userQuery?: string;
  tools?: any[];
}): TokenAnatomy {
  let systemPromptTokens = estimateTokens(params.systemPrompt);
  let memoryRagTokens = estimateTokens(params.financialContext);
  let userInputTokens = estimateTokens(params.userQuery);
  let toolSchemaTokens = params.tools?.length ? estimateTokens(JSON.stringify(params.tools)) : 0;
  let historyTokens = 0;

  for (const msg of params.messages) {
    if (msg.role === "system" && !systemPromptTokens) {
      systemPromptTokens += estimateTokens(msg.content);
    } else if (msg.role === "user" && !userInputTokens) {
      userInputTokens += estimateTokens(msg.content);
    } else {
      historyTokens += estimateTokens(msg.content);
    }
  }

  return {
    systemPromptTokens,
    memoryRagTokens,
    historyTokens,
    userInputTokens,
    toolSchemaTokens,
  };
}

// ─── Billing Period Resolution ──────────────────────────────────────

export function resolveBillingPeriod(date: Date = new Date()): string {
  try {
    const key = businessDateKey(date);
    return key.substring(0, 7); // "YYYY-MM"
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
}

// ─── In-Memory Model & Provider Cache ───────────────────────────────

interface CachedModelRoute {
  provider: {
    id: number;
    slug: string;
    displayName: string;
    protocol: string;
    baseUrl: string;
    apiKey: string;
  };
  model: {
    id: number;
    modelId: string;
    displayName: string;
    inputPricePer1M: number;
    outputPricePer1M: number;
    cachedPricePer1M: number;
    supportsVision: boolean;
    supportsReasoning: boolean;
  };
}

let _gatewayRouteCache: Map<string, CachedModelRoute> = new Map();
let _lastCacheUpdate = 0;
const CACHE_TTL_MS = 60_000; // 1 minute TTL

export async function refreshGatewayCache(): Promise<void> {
  try {
    // Every provider, not only the active ones: a key switched off today is still moved to the current
    // secret, so it opens when it is switched back on after a rotation.
    const allProviders = await db.select().from(aiProviders).orderBy(aiProviders.priority);
    const opened = new Map(allProviders.map((provider) => [provider.id, openProviderKey(provider.apiKeyEncrypted)]));
    await resealProviderKeys(allProviders, opened);
    reportKeyProblems(allProviders, opened);
    const activeProviders = allProviders.filter((provider) => provider.isActive);

    if (!activeProviders.length) {
      _gatewayRouteCache.clear();
      _lastCacheUpdate = Date.now();
      return;
    }

    const providerIds = activeProviders.map((p) => p.id);
    const activeModels = await db
      .select()
      .from(aiModels)
      .where(and(inArray(aiModels.providerId, providerIds), eq(aiModels.isActive, true)));

    const newMap = new Map<string, CachedModelRoute>();
    for (const model of activeModels) {
      const provider = activeProviders.find((p) => p.id === model.providerId);
      if (!provider) continue;

      const purposes = Array.isArray(model.purposes) ? (model.purposes as string[]) : [];
      const tiers = Array.isArray(model.allowedTiers) ? (model.allowedTiers as string[]) : [];

      const routeEntry: CachedModelRoute = {
        provider: {
          id: provider.id,
          slug: provider.slug,
          displayName: provider.displayName,
          protocol: provider.protocol,
          baseUrl: provider.baseUrl,
          apiKey: opened.get(provider.id)?.key ?? "",
        },
        model: {
          id: model.id,
          modelId: model.modelId,
          displayName: model.displayName,
          inputPricePer1M: Number(model.inputPricePer1M || 0),
          outputPricePer1M: Number(model.outputPricePer1M || 0),
          cachedPricePer1M: Number(model.cachedPricePer1M || 0),
          supportsVision: Boolean(model.supportsVision),
          supportsReasoning: Boolean(model.supportsReasoning),
        },
      };

      // Index by explicit modelId
      newMap.set(`model:${model.modelId}`, routeEntry);

      // Index by purpose × tier
      for (const purpose of purposes) {
        for (const tier of tiers) {
          const key = `route:${purpose}:${tier}`;
          if (model.isDefaultForPurpose || !newMap.has(key)) {
            newMap.set(key, routeEntry);
          }
        }
      }
    }

    _gatewayRouteCache = newMap;
    _lastCacheUpdate = Date.now();
  } catch (err) {
    log.error({ err, event: "ai_gateway.refresh_failed" }, "Could not refresh the provider routes");
  }
}

/**
 * What the admin configured, in the shape the classification router consumes.
 *
 * The dashboard has been writing `ai_providers` / `ai_models` — encrypting keys,
 * discovering models, refreshing this very cache — while nothing outside this file ever
 * read any of it: `executeAiGateway` had no callers, so real traffic still resolved
 * through `system_settings` and a provider list written into the code. Adding OpenRouter
 * or DeepSeek from the dashboard changed rows in a table and nothing else.
 *
 * The routes come back ordered by provider priority, and `preferred` is the model the
 * admin marked as the default for that purpose and tier — so choosing a model in the
 * dashboard chooses the model that actually answers, and the cache TTL (or an admin
 * write, which calls `refreshGatewayCache`) is the only delay.
 */
export interface AdminRouteSet {
  preferred: AdminRoute | null;
  routes: AdminRoute[];
}

export interface AdminRoute {
  slug: string;
  protocol: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  priority: number;
  providerId: number;
  /** From `ai_models.supports_reasoning`: ask the provider to skip visible thinking. */
  suppressReasoning: boolean;
}

export async function resolveAdminRoutes(
  purpose: AiPurpose,
  tier: AiTier,
): Promise<AdminRouteSet> {
  if (Date.now() - _lastCacheUpdate > CACHE_TTL_MS || !_gatewayRouteCache.size) {
    await refreshGatewayCache();
  }

  const toRoute = (entry: CachedModelRoute, priority: number): AdminRoute => ({
    slug: entry.provider.slug,
    protocol: entry.provider.protocol,
    baseUrl: entry.provider.baseUrl,
    apiKey: entry.provider.apiKey,
    model: entry.model.modelId,
    priority,
    providerId: entry.provider.id,
    suppressReasoning: entry.model.supportsReasoning,
  });

  const seen = new Set<string>();
  const routes: AdminRoute[] = [];
  const preferredEntry = _gatewayRouteCache.get(`route:${purpose}:${tier}`);
  // A route with no usable key is not a route. A key no configured secret opens comes back
  // empty (and is reported when the providers load), and offering that provider anyway spends
  // a request to learn what we already know — while pushing the working provider down the
  // queue behind it.
  const preferred =
    preferredEntry && preferredEntry.provider.apiKey ? toRoute(preferredEntry, 0) : null;
  if (preferred) {
    routes.push(preferred);
    seen.add(`${preferred.slug}:${preferred.model}`);
  }

  // Every other model the admin allowed for THIS purpose becomes a fallback, in cache
  // order — which refreshGatewayCache built from `ai_providers.priority`. Models scoped
  // to other purposes stay out: an OCR model is not a spare classifier.
  let priority = 1;
  for (const [key, entry] of _gatewayRouteCache) {
    if (!key.startsWith(`route:${purpose}:`)) continue;
    const dedupeKey = `${entry.provider.slug}:${entry.model.modelId}`;
    if (seen.has(dedupeKey)) continue;
    if (!entry.provider.apiKey) continue;
    seen.add(dedupeKey);
    routes.push(toRoute(entry, priority++));
  }

  return { preferred, routes };
}

// ─── Dynamic Remote Model Discovery ─────────────────────────────────

export async function discoverRemoteModels(
  baseUrl: string,
  apiKey: string,
  protocol: string = "openai",
): Promise<DiscoveredModel[]> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");

  if (protocol === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gemini API Error (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return (data.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: any) => ({
        id: m.name.replace(/^models\//, ""),
        name: m.displayName || m.name,
        description: m.description,
        contextWindow: m.inputTokenLimit,
      }));
  }

  // Standard OpenAI Compatible (OpenRouter, DeepSeek, Groq, Fireworks, NVIDIA, Together, Ollama)
  const url = `${cleanUrl}/models`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Provider API Error (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawList = Array.isArray(data) ? data : data.data || [];

  return rawList.map((m: any) => ({
    id: m.id,
    name: m.name || m.id,
    description: m.description || "",
    contextWindow: m.context_length || m.max_model_len || 128000,
    supportsVision: Boolean(m.architecture?.modality?.includes("image") || m.id?.includes("vision")),
    supportsReasoning: Boolean(m.id?.includes("r1") || m.id?.includes("reasoner") || m.id?.includes("thinking")),
  }));
}

// ─── Core AI Execution Gateway ──────────────────────────────────────

export async function executeAiGateway(params: GatewayExecutionParams): Promise<GatewayExecutionResult> {
  const startedAt = Date.now();
  const traceId = params.traceId || `tr_${params.channel}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tier: AiTier = (params.user.plan === "ultra" ? "ultra" : params.user.plan === "pro" ? "pro" : "free");

  // Ensure route cache is loaded
  if (Date.now() - _lastCacheUpdate > CACHE_TTL_MS || !_gatewayRouteCache.size) {
    await refreshGatewayCache();
  }

  // 1. Resolve Provider & Model Route
  let route: CachedModelRoute | undefined;
  if (params.forceModelId) {
    route = _gatewayRouteCache.get(`model:${params.forceModelId}`);
  }
  if (!route) {
    route = _gatewayRouteCache.get(`route:${params.purpose}:${tier}`);
  }

  // Fallback to legacy System Settings if dynamic DB tables have not been populated yet
  const sysSettings = await getSystemSettings();
  const exchangeRate = Number(sysSettings.usd_to_egp_rate || 48.5);

  let providerSlug = route?.provider.slug || "gemini";
  let protocol = route?.provider.protocol || "gemini";
  // Gemini ids go through the mapper (golden rule 9), so a route or setting still naming a model Google no longer
  // serves reaches one it does.
  let modelId = route?.model.modelId || defaultGeminiModelForPlan(tier);
  if (protocol === "gemini") modelId = mapModelName(modelId);
  let baseUrl = route?.provider.baseUrl || "https://generativelanguage.googleapis.com";
  let apiKey = route?.provider.apiKey || sysSettings.ai_api_key || process.env.GEMINI_API_KEY || "";

  // 2. Pre-compute Prompt Anatomy
  const anatomy = computePromptAnatomy({
    systemPrompt: params.systemPrompt,
    financialContext: params.financialContext,
    messages: params.messages,
    userQuery: params.userQuery,
    tools: params.tools,
  });

  // 3. Dispatch based on protocol
  let text = "";
  let toolCalls: any[] | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedTokens = 0;
  let reasoningTokens = 0;
  let finishReason = "stop";

  if (protocol === "gemini" || (!route && providerSlug === "gemini")) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const userPromptContent = params.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    // Google answers 503 (and sometimes 429 or 500) when a model is overloaded; a lighter model then answers instead.
    const candidates = geminiFallbackChain(modelId);
    let result: Awaited<ReturnType<ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["generateContent"]>> | null = null;
    for (const [index, candidate] of candidates.entries()) {
      try {
        result = await genAI
          .getGenerativeModel({
            model: candidate,
            systemInstruction: params.systemPrompt,
            generationConfig: {
              maxOutputTokens: params.maxTokens || 2048,
              temperature: params.temperature ?? 0.2,
              responseMimeType: params.responseFormat?.type === "json_object" ? "application/json" : undefined,
            },
          })
          .generateContent(userPromptContent || params.userQuery || "تحليل البيانات");
        modelId = candidate;
        break;
      } catch (error) {
        const status = (error as { status?: number }).status;
        const overloaded = status === 429 || status === 500 || status === 503;
        if (!overloaded || index === candidates.length - 1) throw error;
        log.warn({ event: "ai_gateway.model_overloaded", model: candidate, next: candidates[index + 1], status }, "Model overloaded");
      }
    }
    if (!result) throw new Error("no_model_answered");
    text = result.response.text();
    promptTokens = result.response.usageMetadata?.promptTokenCount || anatomy.systemPromptTokens + anatomy.userInputTokens;
    completionTokens = result.response.usageMetadata?.candidatesTokenCount || estimateTokens(text);
    cachedTokens = (result.response.usageMetadata as any)?.cachedContentTokenCount || 0;
  } else {
    // OpenAI Compatible standard (OpenRouter, DeepSeek, Groq, Fireworks, NVIDIA, Together, Ollama)
    const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const payloadMessages: ChatMessage[] = [];

    if (params.systemPrompt) {
      payloadMessages.push({ role: "system", content: params.systemPrompt });
    }
    payloadMessages.push(...params.messages);

    const body: Record<string, unknown> = {
      model: modelId,
      messages: payloadMessages,
      max_tokens: Math.min(params.maxTokens || 2048, 8192),
      temperature: params.temperature ?? 0.3,
    };

    if (params.responseFormat?.type === "json_object") {
      body.response_format = { type: "json_object" };
    }
    if (params.tools?.length) {
      body.tools = params.tools;
      body.tool_choice = "auto";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new TRPCError({
        code: res.status === 429 ? "TOO_MANY_REQUESTS" : "INTERNAL_SERVER_ERROR",
        message: `خطأ من مزود الذكاء الاصطناعي (${res.status}): ${errText.slice(0, 150)}`,
      });
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];
    text = choice?.message?.content || "";
    finishReason = choice?.finish_reason || "stop";

    if (choice?.message?.tool_calls?.length) {
      toolCalls = choice.message.tool_calls;
    }

    promptTokens = data.usage?.prompt_tokens || anatomy.systemPromptTokens + anatomy.userInputTokens;
    completionTokens = data.usage?.completion_tokens || estimateTokens(text);
    cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens || 0;
    reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens || 0;
  }

  const totalTokens = promptTokens + completionTokens;
  const latencyMs = Date.now() - startedAt;

  // 4. Real Money Cost Calculation
  const inputPrice = route?.model.inputPricePer1M ?? 0.14;
  const outputPrice = route?.model.outputPricePer1M ?? 0.56;
  const cachedPrice = route?.model.cachedPricePer1M ?? 0.014;

  const billableInput = Math.max(0, promptTokens - cachedTokens);
  const costUsd =
    (billableInput * inputPrice) / 1_000_000 +
    (cachedTokens * cachedPrice) / 1_000_000 +
    (completionTokens * outputPrice) / 1_000_000;
  const costEgp = costUsd * exchangeRate;

  const usage: NormalizedUsage = {
    promptTokens,
    completionTokens,
    cachedTokens,
    reasoningTokens,
    totalTokens,
    costUsd,
    costEgp,
  };

  // 5. Asynchronous, Non-Blocking Ledger Recording
  const billingPeriod = resolveBillingPeriod();
  void (async () => {
    try {
      await db.insert(aiTokenLedgers).values({
        traceId,
        userId: params.user.id,
        userType: params.user.type,
        billingPeriod,
        channel: params.channel,
        providerId: route?.provider.id || null,
        providerSlug,
        modelId,
        promptTokens,
        completionTokens,
        cachedTokens,
        reasoningTokens,
        totalTokens,
        systemPromptTokens: anatomy.systemPromptTokens,
        memoryRagTokens: anatomy.memoryRagTokens,
        historyTokens: anatomy.historyTokens,
        userInputTokens: anatomy.userInputTokens,
        toolSchemaTokens: anatomy.toolSchemaTokens,
        costUsd: sql`${costUsd.toFixed(8)}`,
        costEgp: sql`${costEgp.toFixed(6)}`,
        latencyMs,
        httpStatus: 200,
        finishReason,
        conversationId: params.conversationId || null,
        classificationLogId: params.classificationLogId || null,
        metadata: {
          purpose: params.purpose,
          tier,
          cachedTokensRatio: promptTokens > 0 ? (cachedTokens / promptTokens).toFixed(2) : "0",
        },
      });

      // Maintain backward-compatible running sum in users / localUsers
      if (params.user.type === "oauth") {
        await db
          .update(users)
          .set({ aiTokensUsed: sql`COALESCE(ai_tokens_used, 0) + ${totalTokens}` })
          .where(eq(users.id, params.user.id));
      } else {
        await db
          .update(localUsers)
          .set({ aiTokensUsed: sql`COALESCE(ai_tokens_used, 0) + ${totalTokens}` })
          .where(eq(localUsers.id, params.user.id));
      }
    } catch (err) {
      console.warn("[Universal AI Gateway] Failed to record ledger:", err);
    }
  })();

  return {
    text,
    toolCalls,
    usage,
    anatomy,
    provider: providerSlug,
    model: modelId,
    latencyMs,
    finishReason,
    traceId,
  };
}
