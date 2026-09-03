/**
 * Builds the ordered list of providers a request may try.
 *
 * Kept apart from `llm-router.ts` so the router has no database import and stays
 * testable without one. This file answers "who could serve this?"; the router answers
 * "who actually did?".
 *
 * Two sources, in priority order:
 *
 *   1. `ai_providers` — what the admin configured. Adding OpenRouter or DeepSeek is a
 *      row here plus a key, no deploy, because every one of them speaks the same
 *      OpenAI-compatible protocol and differs only by `baseUrl`.
 *   2. Built-in routes assembled from the keys already on the request. The product ships
 *      with zero rows in that table, so without this the chain would be empty for every
 *      existing install and the failover would be theoretical.
 *
 * The provider the caller asked for is always first, whatever its priority. The healthy
 * path is therefore unchanged by construction — failover is only reachable after the
 * request that used to be the whole story has already failed.
 */
import type { LlmProtocol, LlmRoute } from "./llm-router";
import {
  defaultFireworksModelForPlan,
  defaultGeminiModelForPlan,
  defaultGroqModelForPlan,
  defaultNvidiaModelForPlan,
} from "./model-mapper";
import type { AiPlanName } from "./ai-provider-registry";

/** Base URLs for the providers the product ships knowing about. */
export const BUILTIN_BASE_URLS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

export interface ChainKeys {
  gemini?: string;
  /** Second Gemini key. Threaded into the pipeline for years and never once read. */
  geminiSecondary?: string;
  groq?: string;
  fireworks?: string;
  nvidia?: string;
  deepseek?: string;
  openrouter?: string;
}

export interface ChainRequest {
  /** The provider the caller picked; it leads the chain. */
  preferred: string;
  /** The model resolved for the preferred provider. */
  preferredModel: string;
  plan: AiPlanName;
  keys: ChainKeys;
  /** Rows from `ai_providers`, already decrypted, or omitted when there are none. */
  dbRoutes?: LlmRoute[];
}

interface BuiltinSpec {
  slug: string;
  protocol: LlmProtocol;
  key?: string;
  model: string;
  baseUrl: string;
}

/**
 * A provider is only worth trying if a wrong answer is better than no answer, which for
 * classification it is: the alternative is telling the user their minute of speech
 * produced nothing. Everything with a key gets a place in the queue.
 */
export function buildProviderChain(req: ChainRequest): LlmRoute[] {
  const { keys, plan } = req;

  const builtins: BuiltinSpec[] = [
    {
      slug: "gemini",
      protocol: "gemini",
      key: keys.gemini,
      model: defaultGeminiModelForPlan(plan),
      baseUrl: "",
    },
    {
      slug: "groq",
      protocol: "openai",
      key: keys.groq,
      model: defaultGroqModelForPlan(plan),
      baseUrl: BUILTIN_BASE_URLS.groq,
    },
    {
      slug: "fireworks",
      protocol: "openai",
      key: keys.fireworks,
      model: defaultFireworksModelForPlan(plan),
      baseUrl: BUILTIN_BASE_URLS.fireworks,
    },
    {
      slug: "nvidia",
      protocol: "openai",
      key: keys.nvidia,
      model: defaultNvidiaModelForPlan(plan),
      baseUrl: BUILTIN_BASE_URLS.nvidia,
    },
  ];

  const routes: LlmRoute[] = [];
  const claimed = new Set<string>();

  // 1. The requested provider, at priority 0, with the model the caller resolved.
  const preferredSpec = builtins.find((b) => b.slug === req.preferred);
  const preferredKey =
    preferredSpec?.key ||
    (req.preferred === "gemini" ? keys.gemini : undefined) ||
    keys.gemini;

  if (preferredKey) {
    routes.push({
      slug: req.preferred,
      protocol: preferredSpec?.protocol ?? "gemini",
      baseUrl: preferredSpec?.baseUrl ?? BUILTIN_BASE_URLS[req.preferred] ?? "",
      apiKey: preferredKey,
      model: req.preferredModel,
      priority: 0,
    });
    claimed.add(req.preferred);
  }

  // 2. Admin-configured providers, honouring the `priority` column the schema has always
  //    had a comment for ("Lower = higher priority in failover") and no code behind.
  for (const dbRoute of req.dbRoutes || []) {
    if (claimed.has(dbRoute.slug)) continue;
    routes.push({ ...dbRoute, priority: 10 + dbRoute.priority });
    claimed.add(dbRoute.slug);
  }

  // 3. Whatever else has a key. A second Gemini key is a genuinely independent quota,
  //    so it ranks above a different vendor's model: same behaviour, different bucket.
  if (keys.geminiSecondary && keys.geminiSecondary !== keys.gemini) {
    routes.push({
      slug: "gemini-secondary",
      protocol: "gemini",
      baseUrl: "",
      apiKey: keys.geminiSecondary,
      model: req.preferred === "gemini" ? req.preferredModel : defaultGeminiModelForPlan(plan),
      priority: 100,
    });
  }

  let rank = 200;
  for (const spec of builtins) {
    if (claimed.has(spec.slug) || !spec.key) continue;
    routes.push({
      slug: spec.slug,
      protocol: spec.protocol,
      baseUrl: spec.baseUrl,
      apiKey: spec.key,
      model: spec.model,
      priority: rank++,
    });
    claimed.add(spec.slug);
  }

  for (const slug of ["deepseek", "openrouter"] as const) {
    const key = keys[slug];
    if (!key || claimed.has(slug)) continue;
    routes.push({
      slug,
      protocol: "openai",
      baseUrl: BUILTIN_BASE_URLS[slug],
      apiKey: key,
      // These are admin-supplied gateways; without a configured model there is nothing
      // sensible to guess, so the row in `ai_models` is what makes them reachable.
      model: "",
      priority: rank++,
    });
  }

  // Sorted before returning, not just relied on downstream: a function that promises
  // "the ordered list of providers" has to hand back an ordered list, or every caller
  // has to remember to sort it and one of them eventually will not.
  return routes
    .filter((r) => r.apiKey && r.model)
    .sort((a, b) => a.priority - b.priority);
}
