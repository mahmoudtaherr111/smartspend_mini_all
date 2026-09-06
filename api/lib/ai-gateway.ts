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
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { businessDateKey } from "./app-time";
import { normalizeProviderUsage, priceProviderUsage, type ProviderUsage, type TokenPrices } from "./provider-usage";

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
  providerUsage?: ProviderUsage;
  costSource?: string;
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

// ─── Key Encryption Helper ──────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || process.env.DATABASE_URL || "smartspend-ai-gateway-secure-vault-key-32";
  return createHash("sha256").update(secret).digest();
}

export function encryptApiKey(plainKey: string): string {
  if (!plainKey) return "";
  const keyHash = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyHash, iv);
  let encrypted = cipher.update(plainKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptApiKey(encryptedData: string): string {
  if (!encryptedData) return "";
  try {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) return encryptedData; // Unencrypted fallback
    const [ivHex, authTagHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const keyHash = getEncryptionKey();
    const decipher = createDecipheriv("aes-256-gcm", keyHash, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.warn("[AI Gateway] Decryption error, key may need re-entry:", err);
    return "";
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
    const activeProviders = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.isActive, true))
      .orderBy(aiProviders.priority);

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
          apiKey: decryptApiKey(provider.apiKeyEncrypted),
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
    console.error("[Universal AI Gateway] Failed to refresh route cache:", err);
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
  prices?: TokenPrices;
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
  if (Date.now() - _lastCacheUpdate > CACHE_TTL_MS || !_lastCacheUpdate) {
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
    prices: { inputPricePer1M: entry.model.inputPricePer1M,
      outputPricePer1M: entry.model.outputPricePer1M,
      cachedPricePer1M: entry.model.cachedPricePer1M },
  });

  const seen = new Set<string>();
  const routes: AdminRoute[] = [];
  const preferredEntry = _gatewayRouteCache.get(`route:${purpose}:${tier}`);
  // A route with no usable key is not a route. `decryptApiKey` returns "" when the
  // ciphertext no longer matches the secret, and offering that provider anyway spends a
  // request to learn what we already know — while pushing the working provider down the
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
  if (Date.now() - _lastCacheUpdate > CACHE_TTL_MS || !_lastCacheUpdate) {
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

  let providerSlug = route?.provider.slug || "gemini";
  let modelId = route?.model.modelId || (tier === "ultra" ? "gemini-3.1-pro" : "gemini-3.1-flash-lite");
  let protocol = route?.provider.protocol || "gemini";
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
  let providerUsage = normalizeProviderUsage(null);

  if (protocol === "gemini" || (!route && providerSlug === "gemini")) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({
      model: modelId,
      systemInstruction: params.systemPrompt,
      generationConfig: {
        maxOutputTokens: params.maxTokens || 2048,
        temperature: params.temperature ?? 0.2,
        responseMimeType: params.responseFormat?.type === "json_object" ? "application/json" : undefined,
      },
    });

    const userPromptContent = params.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const result = await geminiModel.generateContent(userPromptContent || params.userQuery || "تحليل البيانات");
    text = result.response.text();
    providerUsage = normalizeProviderUsage(result.response.usageMetadata, "gemini");
    promptTokens = providerUsage.promptTokens ?? 0;
    completionTokens = providerUsage.completionTokens ?? 0;
    cachedTokens = providerUsage.cachedTokens ?? 0;
    reasoningTokens = providerUsage.reasoningTokens ?? 0;
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

    providerUsage = normalizeProviderUsage(data, "openai", res.headers);
    promptTokens = providerUsage.promptTokens ?? 0;
    completionTokens = providerUsage.completionTokens ?? 0;
    cachedTokens = providerUsage.cachedTokens ?? 0;
    reasoningTokens = providerUsage.reasoningTokens ?? 0;
  }

  const totalTokens = promptTokens + completionTokens;
  const latencyMs = Date.now() - startedAt;

  // Reported cost wins; otherwise snapshot the actual route's configured prices.
  const cost = priceProviderUsage(providerUsage, route?.model);
  const costUsd = cost.usd ?? 0;
  const configuredFx = Number(sysSettings.usd_to_egp_rate);
  const fx = Number.isFinite(configuredFx) && configuredFx > 0 ? configuredFx : null;
  const costEgp = cost.usd !== null && fx !== null ? cost.usd * fx : 0;

  const usage: NormalizedUsage = {
    providerUsage, costSource: cost.source,
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
          accounting: { version: 1, operationId: traceId, usage: providerUsage, cost, exchangeRate: fx, cacheKind: "provider", status: "success" },
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
