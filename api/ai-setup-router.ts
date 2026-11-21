/**
 * The console's AI setup: which model answers each purpose for each plan, in what order the rest take over, the
 * models of each connector, and a real call to check one.
 *
 * A model row (`ai_models`) belongs to one connector (`ai_providers`), serves some purposes for some plans, and has one
 * place in a single order (`sort_order`). The server reads the same rows through `resolveAdminRoutes`, so what this
 * page shows is what answers.
 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AI_PLAN_TIERS, AI_ROUTED_PURPOSES, PUBLISHED_RATES } from "../contracts/ai-models";
import { aiModels, aiProviders } from "../db/schema";
import { logAdminAction } from "./lib/admin-audit";
import { applyListOrder, discoverRemoteModels, invalidateAiConfig, orderRouteModels, sortRouteModels } from "./lib/ai-gateway";
import { aiCallCost } from "./lib/ai-pricing";
import { CAPTURE_DEFAULT_MODELS } from "./lib/capture/model-reader";
import { DEFAULT_EMBEDDING_MODEL } from "./lib/embedding-provider";
import { env } from "./lib/env";
import { asLlmProtocol, executeLlmChain, LlmChainError } from "./lib/llm-router";
import { defaultGeminiModelForPlan } from "./lib/model-mapper";
import { openProviderKey } from "./lib/provider-key-crypto";
import { getSystemSettings } from "./lib/settings-cache";
import { adminProcedure, router } from "./middleware";
import { db } from "./queries/connection";

const purposeIds = AI_ROUTED_PURPOSES.map((purpose) => purpose.id) as [string, ...string[]];
const purpose = z.enum(purposeIds);
const tier = z.enum(AI_PLAN_TIERS);

const modelInput = z.object({
  id: z.number().int().positive().optional(),
  providerId: z.number().int().positive(),
  modelId: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200),
  purposes: z.array(purpose),
  allowedTiers: z.array(tier).min(1),
  inputPricePer1M: z.number().min(0),
  outputPricePer1M: z.number().min(0),
  cachedPricePer1M: z.number().min(0),
  supportsReasoning: z.boolean(),
  isActive: z.boolean(),
});

const price = (value: string | number | null) => Number(value ?? 0);

/** What answers when the admin assigned nothing to a purpose: the server's own Gemini key, if there is one. */
function fallbackModels(purposeId: string, planTier: (typeof AI_PLAN_TIERS)[number]): string[] {
  if (purposeId === "sms") return [...CAPTURE_DEFAULT_MODELS];
  if (purposeId === "embedding") return [DEFAULT_EMBEDDING_MODEL];
  return [defaultGeminiModelForPlan(planTier)];
}

export const aiSetupRouter = router({
  overview: adminProcedure.query(async () => {
    const [providers, models, settings] = await Promise.all([
      db.select().from(aiProviders).orderBy(aiProviders.priority),
      db.select().from(aiModels),
      getSystemSettings(),
    ]);
    const keyState = new Map(providers.map((provider) => [provider.id, openProviderKey(provider.apiKeyEncrypted).state]));
    const priorities = new Map(providers.map((provider) => [provider.id, provider.priority]));
    const live = new Set(providers.filter((provider) => provider.isActive && keyState.get(provider.id) !== "unreadable" && keyState.get(provider.id) !== "empty").map((provider) => provider.id));
    const ordered = sortRouteModels(models, priorities);
    const lists = orderRouteModels(ordered.filter((model) => model.isActive && live.has(model.providerId)), priorities);
    const serverKey = Boolean(settings.ai_api_key || settings.ai_api_key_2 || env.GEMINI_API_KEY);

    return {
      connectors: providers.map((provider) => ({
        id: provider.id,
        slug: provider.slug,
        displayName: provider.displayName,
        protocol: asLlmProtocol(provider.protocol),
        isActive: provider.isActive,
        healthStatus: provider.healthStatus,
        keyState: keyState.get(provider.id) ?? "empty",
      })),
      models: ordered.map((model, index) => ({
        id: model.id,
        providerId: model.providerId,
        modelId: model.modelId,
        displayName: model.displayName,
        purposes: Array.isArray(model.purposes) ? (model.purposes as string[]) : [],
        allowedTiers: Array.isArray(model.allowedTiers) ? (model.allowedTiers as string[]) : [],
        inputPricePer1M: price(model.inputPricePer1M),
        outputPricePer1M: price(model.outputPricePer1M),
        cachedPricePer1M: price(model.cachedPricePer1M),
        supportsReasoning: model.supportsReasoning,
        isActive: model.isActive,
        rank: index + 1,
        reachable: model.isActive && live.has(model.providerId),
      })),
      routes: AI_ROUTED_PURPOSES.map((item) => ({
        purpose: item.id,
        label: item.label,
        tiers: AI_PLAN_TIERS.map((planTier) => ({
          tier: planTier,
          modelIds: (lists.get(`${item.id}:${planTier}`) ?? []).map((model) => model.id),
          fallback: serverKey ? fallbackModels(item.id, planTier) : [],
        })),
      })),
      serverKey,
      publishedRates: PUBLISHED_RATES,
    };
  }),

  /** The models a connector's saved key can reach. */
  discover: adminProcedure.input(z.object({ providerId: z.number().int().positive() })).mutation(async ({ input }) => {
    const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, input.providerId)).limit(1);
    if (!provider) throw new TRPCError({ code: "NOT_FOUND", message: "الموصل ده مش موجود." });
    const key = openProviderKey(provider.apiKeyEncrypted).key;
    if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "مفتاح الموصل مش مقروء. دخّله تاني من صفحة الموصلات." });
    try {
      const models = await discoverRemoteModels(provider.baseUrl, key, provider.protocol);
      return { models: models.map((model) => ({ id: model.id, name: model.name || model.id })) };
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `الخدمة مارجّعتش الموديلات: ${String((error as Error)?.message || error).slice(0, 200)}` });
    }
  }),

  saveModel: adminProcedure.input(modelInput).mutation(async ({ ctx, input }) => {
    const [provider] = await db.select({ id: aiProviders.id }).from(aiProviders).where(eq(aiProviders.id, input.providerId)).limit(1);
    if (!provider) throw new TRPCError({ code: "NOT_FOUND", message: "الموصل ده مش موجود." });
    const values = {
      providerId: input.providerId,
      modelId: input.modelId,
      displayName: input.displayName,
      purposes: input.purposes,
      allowedTiers: input.allowedTiers,
      inputPricePer1M: input.inputPricePer1M.toFixed(6),
      outputPricePer1M: input.outputPricePer1M.toFixed(6),
      cachedPricePer1M: input.cachedPricePer1M.toFixed(6),
      supportsReasoning: input.supportsReasoning,
      isActive: input.isActive,
    };
    const [same] = await db.select({ id: aiModels.id }).from(aiModels)
      .where(and(eq(aiModels.providerId, input.providerId), eq(aiModels.modelId, input.modelId))).limit(1);
    if (same && same.id !== input.id) throw new TRPCError({ code: "CONFLICT", message: "الموديل ده متضاف للموصل ده قبل كده." });

    let id = input.id;
    if (id) {
      await db.update(aiModels).set(values).where(eq(aiModels.id, id));
    } else {
      // A new model goes to the end of the order: it takes over last until the admin moves it up.
      const all = await db.select({ sortOrder: aiModels.sortOrder }).from(aiModels);
      const last = all.reduce((max, row) => Math.max(max, row.sortOrder), 0);
      const [row] = await db.insert(aiModels).values({ ...values, isDefaultForPurpose: false, sortOrder: last + 10 });
      id = row.insertId;
    }
    await invalidateAiConfig();
    await logAdminAction(ctx, { action: input.id ? "UPDATE_AI_MODEL" : "ADD_AI_MODEL", targetType: "ai_model", targetId: id, details: { providerId: input.providerId, modelId: input.modelId, purposes: input.purposes, tiers: input.allowedTiers, isActive: input.isActive } });
    return { id };
  }),

  removeModel: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await db.delete(aiModels).where(eq(aiModels.id, input.id));
    await invalidateAiConfig();
    await logAdminAction(ctx, { action: "DELETE_AI_MODEL", targetType: "ai_model", targetId: input.id });
    return { ok: true };
  }),

  /**
   * A new order for one purpose and plan. The models of that list take the places they held in the one order, in the
   * order given, so every other list keeps its own order; the old "default" mark is dropped, as the order replaces it.
   */
  reorder: adminProcedure.input(z.object({ purpose, tier, ids: z.array(z.number().int().positive()).min(1) })).mutation(async ({ ctx, input }) => {
    const [providers, models] = await Promise.all([db.select({ id: aiProviders.id, priority: aiProviders.priority }).from(aiProviders), db.select().from(aiModels)]);
    const global = sortRouteModels(models, new Map(providers.map((provider) => [provider.id, provider.priority])));
    const wanted = new Set(input.ids);
    if (wanted.size !== input.ids.length || input.ids.some((id) => !global.some((model) => model.id === id))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "الترتيب فيه موديل مش موجود. حدّث الصفحة وجرب تاني." });
    }
    const next = applyListOrder(global, input.ids);
    await db.transaction(async (tx) => {
      for (const [index, model] of next.entries()) {
        const sortOrder = (index + 1) * 10;
        if (model.sortOrder !== sortOrder || model.isDefaultForPurpose) {
          await tx.update(aiModels).set({ sortOrder, isDefaultForPurpose: false }).where(eq(aiModels.id, model.id));
        }
      }
    });
    await invalidateAiConfig();
    await logAdminAction(ctx, { action: "REORDER_AI_MODELS", targetType: "ai_route", targetId: `${input.purpose}:${input.tier}`, details: { ids: input.ids } });
    return { ok: true };
  }),

  /**
   * One real call to one model through the same router the app uses, with a fixed request that holds no user data.
   * An embedding model is checked by asking its connector whether the key reaches it.
   */
  test: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const [model] = await db.select().from(aiModels).where(eq(aiModels.id, input.id)).limit(1);
    if (!model) throw new TRPCError({ code: "NOT_FOUND", message: "الموديل ده مش موجود." });
    const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, model.providerId)).limit(1);
    const apiKey = provider ? openProviderKey(provider.apiKeyEncrypted).key : "";
    if (!provider || !apiKey) return { ok: false as const, message: "مفتاح الموصل مش مقروء. دخّله تاني من صفحة الموصلات." };
    const startedAt = Date.now();
    const purposes = Array.isArray(model.purposes) ? (model.purposes as string[]) : [];

    if (purposes.length === 1 && purposes[0] === "embedding") {
      try {
        const found = (await discoverRemoteModels(provider.baseUrl, apiKey, provider.protocol)).some((item) => item.id.replace(/^models\//, "") === model.modelId.replace(/^models\//, ""));
        return found
          ? { ok: true as const, latencyMs: Date.now() - startedAt, reply: "المفتاح بيوصل للموديل ده.", promptTokens: 0, completionTokens: 0, costUsd: 0 }
          : { ok: false as const, message: "المفتاح شغال، بس الموديل ده مش في قايمة موديلاته." };
      } catch (error) {
        return { ok: false as const, message: String((error as Error)?.message || error).slice(0, 200) };
      }
    }

    try {
      const result = await executeLlmChain(
        [{ slug: provider.slug, protocol: asLlmProtocol(provider.protocol), baseUrl: provider.baseUrl, apiKey, model: model.modelId, priority: 0, providerId: provider.id, suppressReasoning: model.supportsReasoning }],
        {
          systemPrompt: "You check that a model answers. Reply with JSON only.",
          userPrompt: 'Return {"ok": true, "reply": "<the Egyptian Arabic word for \\"ready\\">"}.',
          maxOutputTokens: 64,
          lowThinking: true,
          timeoutMs: 20_000,
          schema: { type: "object", properties: { ok: { type: "boolean" }, reply: { type: "string" } }, required: ["ok", "reply"] },
        },
      );
      const cost = await aiCallCost(provider.slug, model.modelId, { promptTokens: result.promptTokens, completionTokens: result.completionTokens, cachedTokens: result.cachedTokens });
      let reply = result.text.trim();
      try {
        reply = String((JSON.parse(reply) as { reply?: unknown }).reply ?? reply);
      } catch {
        // A model that ignored the format still answered; its text is shown as it came.
      }
      return { ok: true as const, latencyMs: result.latencyMs, reply: reply.slice(0, 120), promptTokens: result.promptTokens, completionTokens: result.completionTokens, costUsd: cost.usd };
    } catch (error) {
      const attempt = error instanceof LlmChainError ? error.attempts[0] : undefined;
      const words: Record<string, string> = {
        auth: "المفتاح مرفوض أو مالوش صلاحية على الموديل ده.",
        rate_limited: "الخدمة قالت استنى شوية (حد الطلبات أو الرصيد).",
        timeout: "الخدمة ماردتش في 20 ثانية.",
        unsupported_schema: "الخدمة رفضت الطلب. غالباً اسم الموديل غلط.",
        server: "الخدمة عندها مشكلة دلوقتي.",
        network: "ماقدرناش نوصل للخدمة.",
        empty_response: "الخدمة ردت من غير إجابة.",
        truncated: "الإجابة اتقطعت.",
      };
      const kind = attempt?.failure;
      return { ok: false as const, message: (kind && words[kind]) || "الموديل ماردش.", detail: attempt?.message?.slice(0, 200) };
    }
  }),
});
