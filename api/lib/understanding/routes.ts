/**
 * Which models may read a sentence, in order.
 *
 * The admin's models for purpose `classification` at the user's plan lead (the providers tab
 * of the console); the built-in providers that have a key follow, so an install with an empty
 * providers table still reads sentences and a provider outage moves to the next one. The
 * engine never names a vendor: it takes whatever this returns.
 *
 * The built-in key and model for each plan are resolved the way the classification pipeline
 * resolves them today (`resolveRoutingConfig` in `api/ai-router.ts`); the few lines are kept
 * here so the engine does not depend on a router file.
 */
import { resolveAdminRoutes, type AiTier } from "../ai-gateway";
import { env } from "../env";
import { buildProviderChain } from "../llm-provider-chain";
import { asLlmProtocol, type LlmRoute } from "../llm-router";
import { createLogger } from "../log";
import { coerceModelForProvider, defaultGeminiModelForPlan } from "../model-mapper";

const log = createLogger("understanding.routes");

export function tierOf(plan: string | null | undefined): AiTier {
  return plan === "ultra" ? "ultra" : plan === "pro" ? "pro" : "free";
}

/** The built-in fallback: Gemini with the plan's model, and the keys of the other built-in providers. */
export function builtinRouting(tier: AiTier, settings: Record<string, string>) {
  const planModel = tier === "ultra" ? settings.ai_model_ultra : tier === "pro" ? settings.ai_model_pro : settings.ai_model_free;
  return {
    // Through `mapModelName`, so console shorthand and retired ids land on a real model (golden rule 9).
    model: coerceModelForProvider(planModel || defaultGeminiModelForPlan(tier), "gemini", tier),
    keys: {
      gemini: settings.ai_api_key || env.GEMINI_API_KEY || settings.ai_api_key_2 || "",
      geminiSecondary: settings.ai_api_key_2 || "",
      groq: settings.groq_api_key || env.GROQ_API_KEY || "",
      fireworks: settings.fireworks_api_key || env.FIREWORKS_API_KEY || "",
      nvidia: settings.nvidia_api_key || env.NVIDIA_API_KEY || "",
    },
  };
}

export async function resolveUnderstandingRoutes(plan: string, settings: Record<string, string>): Promise<LlmRoute[]> {
  const tier = tierOf(plan);
  const admin = await resolveAdminRoutes("classification", tier).catch((err: unknown) => {
    // The console's routes are unreadable (the database or the key ring): the built-ins still answer.
    log.warn({ err, event: "understanding.admin_routes_failed", tier }, "Admin routes unavailable for understanding");
    return { preferred: null, routes: [] };
  });
  const builtin = builtinRouting(tier, settings);
  return buildProviderChain({
    preferred: admin.preferred?.slug || "gemini",
    preferredModel: admin.preferred?.model || builtin.model,
    plan: tier,
    keys: builtin.keys,
    dbRoutes: admin.routes.map((route) => ({
      slug: route.slug,
      protocol: asLlmProtocol(route.protocol),
      baseUrl: route.baseUrl,
      apiKey: route.apiKey,
      model: route.model,
      priority: route.priority,
      providerId: route.providerId,
      suppressReasoning: route.suppressReasoning,
    })),
  });
}
