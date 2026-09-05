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
  isFireworksModel,
  isGeminiModel,
  isGroqModel,
  isNvidiaModel,
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

/**
 * Models that think out loud before answering.
 *
 * They return the answer in `reasoning_content` and leave `content` null, so a request
 * that the model understood perfectly reads downstream as a provider that returned
 * nothing — which is exactly what DeepSeek V4 Flash did on every case of a benchmark
 * run. The router asks these to skip the visible reasoning; providers that do not
 * implement the flag ignore it.
 */
/**
 * Owners of a model name, most specific test first.
 *
 * `isNvidiaModel` is checked before `isGroqModel` because Groq claims the bare
 * `deepseek-` prefix while NVIDIA publishes `deepseek-ai/`, and the more specific one
 * has to win. This ordering is also the reason the audit is right that a prefix alone
 * must not be allowed to CHOOSE a provider — it is only good enough to rule one out.
 */
const MODEL_OWNERS: Array<[string, (model: string) => boolean]> = [
  ["gemini", isGeminiModel],
  ["fireworks", isFireworksModel],
  ["nvidia", isNvidiaModel],
  ["groq", isGroqModel],
];

/**
 * Does this model name demonstrably belong to a DIFFERENT provider?
 *
 * The caller supplies a provider and a model from two different settings, and nothing
 * required them to agree: an install with `provider=groq` and the default
 * `model=gemini-3.1-flash-lite` produced a Groq route asking Groq for a Gemini model.
 * That request cannot succeed, and it was the FIRST one tried on every classification.
 *
 * Deliberately asymmetric. A name we recognise as another vendor's is evidence, and the
 * provider wins because it is the thing holding a key and an endpoint. A name we do not
 * recognise is NOT evidence — new models appear faster than these predicates are
 * updated, and silently replacing an operator's configured model with a default is a
 * worse failure than passing through a name we have not heard of.
 */
export function modelConflictsWithProvider(model: string, slug: string): boolean {
  if (!model) return true;
  const provider = slug === "gemini-secondary" ? "gemini" : slug;
  const owner = MODEL_OWNERS.find(([, belongsTo]) => belongsTo(model));
  if (!owner) return false;
  return owner[0] !== provider;
}

export function looksLikeReasoningModel(modelId: string): boolean {
  return /deepseek-(?:v4|r1)|(?:^|\/)o[13](?:-|$)|reasoner|thinking|qwq/i.test(modelId);
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
  /**
   * Claimed by provider AND model, not by provider alone.
   *
   * A gateway like OpenRouter is one slug in front of many models, and the admin
   * configures them as separate rows precisely so one can back up another. Deduplicating
   * on the slug meant the second row was silently dropped: the fallback the operator
   * configured existed in the database, was read, and never ran.
   */
  const claimed = new Set<string>();
  const key = (slug: string, model: string) => `${slug}::${model}`;

  const dbRoutes = req.dbRoutes || [];

  // 1. The requested provider leads, at priority 0 — but only as itself.
  //
  // This used to synthesise a route for ANY preferred slug: with no builtin spec it fell
  // through to `keys.gemini` for the key and `?? "gemini"` for the protocol, so asking
  // for DeepSeek produced a route that spoke the Gemini protocol, carried the Gemini key,
  // and pointed at DeepSeek's base URL. It then claimed the slug, which dropped the
  // correctly configured DeepSeek row waiting in `dbRoutes` two lines below. The admin
  // had set it up correctly; the chain threw it away and sent a request that could only
  // fail — while recording the failure against DeepSeek's health.
  //
  // A route is provider, protocol, base URL, key and model together. Assembling one out
  // of parts from different providers does not produce a usable route, so the honest
  // answer when the parts are missing is that this provider is not available.
  const preferredDbRoutes = dbRoutes
    .filter((r) => r.slug === req.preferred)
    .sort((a, b) => a.priority - b.priority);

  if (preferredDbRoutes.length > 0) {
    // What the admin configured for this provider, in their own priority order.
    preferredDbRoutes.forEach((dbRoute, index) => {
      routes.push({ ...dbRoute, priority: index });
      claimed.add(key(dbRoute.slug, dbRoute.model));
    });
  } else {
    const preferredSpec = builtins.find((b) => b.slug === req.preferred);
    if (preferredSpec?.key) {
      // The caller's model only travels with the route if it is that provider's model.
      const model = modelConflictsWithProvider(req.preferredModel, preferredSpec.slug)
        ? preferredSpec.model
        : req.preferredModel;
      routes.push({
        slug: preferredSpec.slug,
        protocol: preferredSpec.protocol,
        baseUrl: preferredSpec.baseUrl,
        apiKey: preferredSpec.key,
        model,
        priority: 0,
      });
      claimed.add(key(preferredSpec.slug, model));
    }
    // No key for the requested provider: it simply does not lead. The rest of the chain
    // below still runs, so a configured fallback answers instead of a fabricated route
    // failing first.
  }

  // 2. Admin-configured providers, honouring the `priority` column the schema has always
  //    had a comment for ("Lower = higher priority in failover") and no code behind.
  for (const dbRoute of dbRoutes) {
    if (claimed.has(key(dbRoute.slug, dbRoute.model))) continue;
    routes.push({ ...dbRoute, priority: 10 + dbRoute.priority });
    claimed.add(key(dbRoute.slug, dbRoute.model));
  }

  // 3. Whatever else has a key. A second Gemini key is a genuinely independent quota,
  //    so it ranks above a different vendor's model: same behaviour, different bucket.
  if (keys.geminiSecondary && keys.geminiSecondary !== keys.gemini) {
    const secondaryModel = modelConflictsWithProvider(req.preferredModel, "gemini")
      ? defaultGeminiModelForPlan(plan)
      : req.preferredModel;
    routes.push({
      slug: "gemini-secondary",
      protocol: "gemini",
      baseUrl: "",
      apiKey: keys.geminiSecondary,
      model: secondaryModel,
      priority: 100,
    });
    claimed.add(key("gemini-secondary", secondaryModel));
  }

  let rank = 200;
  for (const spec of builtins) {
    if (!spec.key || claimed.has(key(spec.slug, spec.model))) continue;
    routes.push({
      slug: spec.slug,
      protocol: spec.protocol,
      baseUrl: spec.baseUrl,
      apiKey: spec.key,
      model: spec.model,
      priority: rank++,
    });
    claimed.add(key(spec.slug, spec.model));
  }

  for (const slug of ["deepseek", "openrouter"] as const) {
    const apiKey = keys[slug];
    // These are admin-supplied gateways; without a configured model there is nothing
    // sensible to guess, so the row in `ai_models` is what makes them reachable. A route
    // with no model is filtered out below rather than sent.
    if (!apiKey || claimed.has(key(slug, ""))) continue;
    routes.push({
      slug,
      protocol: "openai",
      baseUrl: BUILTIN_BASE_URLS[slug],
      apiKey,
      model: "",
      priority: rank++,
    });
    claimed.add(key(slug, ""));
  }

  // A reasoning model answers into a field the OpenAI shape does not have, so mark
  // every route that looks like one and let the router ask for the thinking to be off.
  for (const route of routes) {
    if (route.suppressReasoning === undefined && looksLikeReasoningModel(route.model)) {
      route.suppressReasoning = true;
    }
  }

  // Sorted before returning, not just relied on downstream: a function that promises
  // "the ordered list of providers" has to hand back an ordered list, or every caller
  // has to remember to sort it and one of them eventually will not.
  return routes
    .filter((r) => r.apiKey && r.model)
    .sort((a, b) => a.priority - b.priority);
}
