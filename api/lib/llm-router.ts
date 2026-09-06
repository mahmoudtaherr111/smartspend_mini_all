/**
 * One way to call a model, over any provider, with a chain to fall back to.
 *
 * What this replaces: four near-identical client files and an `if (provider === …)`
 * ladder that picked ONE provider and, when it failed, gave up on the model entirely.
 * The keys for the other three were sitting right there in the same request. A 429 on
 * Gemini dropped a paying user's long narrative to the rule engine while Groq was idle.
 *
 * Three things this owns, none of which existed:
 *
 *   1. A CHAIN, ordered by priority, not a single provider. The head of the chain is
 *      whatever the caller asked for, so the healthy path is bit-for-bit what it was.
 *   2. A CIRCUIT BREAKER, so a provider that is down costs one request its timeout
 *      rather than costing every request its timeout — and so `ai_providers.healthStatus`
 *      finally has a writer instead of the admin dashboard's permanent green dot.
 *   3. FAILURE CLASSIFICATION. "Rate limited" and "your key is wrong" need opposite
 *      responses; both used to be `catch (err)`. A bad key opens the breaker, a 429
 *      moves to the next provider without holding it against this one, and a schema
 *      the provider cannot parse retries once WITHOUT the schema rather than failing.
 *
 * Deliberately not here: prompt building, taxonomy, parsing, or anything that knows what
 * a transaction is. This file moves strings to a provider and back.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizeProviderUsage, priceProviderUsage, type ProviderUsage, type TokenPrices, type UsageCost } from "./provider-usage";

export type LlmProtocol = "openai" | "gemini";

/** One provider+model the router may try. */
export interface LlmRoute {
  prices?: TokenPrices;
  /** Provider identity, e.g. "gemini", "groq", "openrouter", or any admin-defined slug. */
  slug: string;
  protocol: LlmProtocol;
  /** Ignored for gemini, which the SDK addresses itself. */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Lower runs first. Mirrors `ai_providers.priority`. */
  priority: number;
  /** `ai_providers.id`, when the route came from the database. */
  providerId?: number;
  /**
   * Ask the provider to skip visible reasoning. Set for models the admin marked as
   * reasoning-capable: they answer into `reasoning_content` and leave `content` null,
   * which reads downstream as a provider that returned nothing.
   */
  suppressReasoning?: boolean;
  /** Per-route deadline. Some hosted endpoints are an order of magnitude slower. */
  timeoutMs?: number;
}

/**
 * A response schema in the shape both protocols understand.
 *
 * `SchemaType.STRING` is the literal string `"string"`, so a Gemini schema is already
 * JSON Schema in all the ways that matter here. The adapters massage the differences.
 */
export interface StructuredSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  items?: unknown;
  [key: string]: unknown;
}

export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  temperature?: number;
  /** Asked for, never assumed: `degradedSchema` reports whether it survived. */
  schema?: StructuredSchema;
  /** Per-attempt ceiling. */
  timeoutMs?: number;
  /**
   * Ceiling for the WHOLE chain, measured from the first attempt.
   *
   * `timeoutMs` bounds one provider; five providers at 25 seconds each bounded nothing
   * that the user experiences, and the client had usually given up long before the last
   * one was tried — while every request after the abandonment kept running and kept
   * costing. With a deadline, a route is only started if there is time left in which its
   * answer could still be useful.
   */
  deadlineMs?: number;
  /**
   * Lets the caller shape the prompt for whoever actually serves the request.
   *
   * Models want different things — Fireworks' instruct models take a terser system
   * prompt than Gemini. Without this the fallback would send the primary's prompt to a
   * model it was not written for, which is a quality regression hiding inside a
   * reliability feature. Called once per route, so it should be cheap or memoized.
   */
  promptFor?: (route: LlmRoute) => { systemPrompt: string; userPrompt: string };
}

export type FailureKind =
  | "rate_limited"
  | "auth"
  | "unsupported_schema"
  | "server"
  | "timeout"
  | "network"
  | "empty_response"
  /**
   * The provider answered 200 with a reply it had to cut short.
   *
   * Transport success and semantic success are different facts, and conflating them is
   * how a JSON object severed mid-key reached the parser as a successful classification.
   * A truncated answer is worth trying somewhere else; a parse error after the fact is
   * not, because by then the chain has already returned.
   */
  | "truncated";

export interface LlmAttempt {
  providerId?: number;
  usage?: ProviderUsage;
  cost?: UsageCost;
  slug: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  failure?: FailureKind;
  status?: number;
  message?: string;
  /**
   * What THIS attempt cost, whether or not it produced the answer.
   *
   * Accounting used to read the winning call only, so a first provider that consumed
   * 90 input tokens and returned an empty body was billed as free. Every failed attempt
   * past the request boundary spent real input tokens; a ledger that cannot see them
   * under-reports by exactly the amount the failover cost.
   */
  promptTokens?: number;
  completionTokens?: number;
  /** Prompt tokens read from provider cache; included in input and potentially discounted. */
  cachedTokens?: number;
  totalTokens?: number;
  /** Verbatim from the provider: "stop", "length", "content_filter", … */
  finishReason?: string;
  /** Milliseconds the provider asked us to wait, from `Retry-After`. */
  retryAfterMs?: number;
}

export interface LlmResponse {
  text: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  route: LlmRoute;
  latencyMs: number;
  /** Every route tried, in order — the audit trail for the admin funnel. */
  attempts: LlmAttempt[];
  /**
   * Summed over every attempt, including the ones that failed.
   *
   * The top-level `promptTokens`/`completionTokens` describe the call that answered,
   * which is what the caller wants to reason about. This is what the request actually
   * cost, which is what billing wants. They are different numbers whenever a failover
   * happened, and reporting only the first is why cost telemetry disagreed with the
   * provider invoices.
   */
  attemptTotals: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    totalTokens: number;
  };
  /** True when the provider would not honour the schema and we sent the request anyway. */
  degradedSchema: boolean;
}

export class LlmChainError extends Error {
  constructor(
    message: string,
    readonly attempts: LlmAttempt[],
  ) {
    super(message);
    this.name = "LlmChainError";
  }
}

// ─── Circuit breaker ────────────────────────────────────────────────────────

/**
 * In-process on purpose.
 *
 * A shared breaker in Redis would be more accurate across instances, but it would make
 * every classification depend on Redis being up — importing an availability problem into
 * the layer whose whole job is surviving one. Each instance learns for itself within a
 * cooldown; the cost of that is one wasted request per instance per cooldown.
 */
interface BreakerState {
  consecutiveFailures: number;
  openedAt: number;
  /** Wall-clock instant the route may be tried again. Honours `Retry-After`. */
  openUntil: number;
  lastFailure?: FailureKind;
  lastMessage?: string;
}

const OPEN_AFTER_FAILURES = 3;
const COOLDOWN_MS = 60_000;
/** A bad key does not fix itself in a minute, and each retry is a wasted round trip. */
const AUTH_COOLDOWN_MS = 10 * 60_000;
/** However long a provider asks us to wait, stop believing it after this. */
const MAX_COOLDOWN_MS = 30 * 60_000;

const breakers = new Map<string, BreakerState>();

/**
 * Health is per ROUTE, not per provider name.
 *
 * A gateway is one slug in front of many models. Keying on the slug meant a 401 on a
 * model whose key had been revoked condemned every sibling model behind the same
 * gateway — including the ones the admin had configured precisely as its backup.
 */
export function routeKey(slug: string, model: string): string {
  return `${slug}::${model}`;
}

/** Called when the health of a route changes. Wired to the DB by the caller. */
export type HealthReporter = (
  slug: string,
  status: "healthy" | "degraded" | "down",
  detail?: string,
) => void;

let reportHealth: HealthReporter = () => {};

export function setHealthReporter(fn: HealthReporter): void {
  reportHealth = fn;
}

function stateIsOpen(state: BreakerState | undefined, now: number): boolean {
  if (!state || state.consecutiveFailures < OPEN_AFTER_FAILURES) return false;
  return now < state.openUntil;
}

/**
 * Is this route currently shut out? A PURE question.
 *
 * It used to answer by mutating: past the cooldown it decremented the failure count and
 * returned false, so asking about the breaker was how the breaker half-opened. Three
 * things read this — the chain (twice per request, once for each partition) and the
 * admin dashboard's polling — and every one of them silently consumed the single probe
 * the design intended to grant. A dashboard left open on a broken provider handed it a
 * free attempt every refresh.
 *
 * Half-open now falls out of the arithmetic instead: past `openUntil` this returns false,
 * the route is tried once like any other, and a failure sets a fresh `openUntil`.
 */
export function isCircuitOpen(slug: string, now = Date.now(), model?: string): boolean {
  if (model !== undefined) return stateIsOpen(breakers.get(routeKey(slug, model)), now);

  // No model named: the question is about the provider. It is shut out only if every
  // route we know of for it is.
  const prefix = `${slug}::`;
  let seen = false;
  for (const [key, state] of breakers) {
    if (!key.startsWith(prefix)) continue;
    seen = true;
    if (!stateIsOpen(state, now)) return false;
  }
  return seen;
}

function recordSuccess(route: LlmRoute): void {
  const key = routeKey(route.slug, route.model);
  const had = breakers.get(key);
  breakers.delete(key);
  if (had && had.consecutiveFailures >= OPEN_AFTER_FAILURES) {
    reportHealth(route.slug, "healthy");
  }
}

function recordFailure(
  route: LlmRoute,
  kind: FailureKind,
  message: string,
  retryAfterMs?: number,
): void {
  const key = routeKey(route.slug, route.model);
  const state = breakers.get(key) || { consecutiveFailures: 0, openedAt: 0, openUntil: 0 };
  state.consecutiveFailures++;
  state.lastFailure = kind;
  state.lastMessage = message;

  // An unusable key is not a flaky provider — open on the first one rather than paying
  // for two more round trips to learn what the 401 already said.
  const trip = kind === "auth" || state.consecutiveFailures >= OPEN_AFTER_FAILURES;
  if (trip) {
    if (kind === "auth") state.consecutiveFailures = OPEN_AFTER_FAILURES;
    const now = Date.now();
    // The provider knows better than our constant when it will serve us again. A 429
    // that names 600 seconds means 600 seconds; retrying at 60 is how a rate limit
    // becomes a rate limit plus ten wasted round trips.
    const cooldown = Math.min(
      MAX_COOLDOWN_MS,
      retryAfterMs ?? (kind === "auth" ? AUTH_COOLDOWN_MS : COOLDOWN_MS),
    );
    state.openedAt = now;
    state.openUntil = now + cooldown;
    reportHealth(route.slug, "down", `${kind}: ${message.slice(0, 180)}`);
  } else {
    reportHealth(route.slug, "degraded", `${kind}: ${message.slice(0, 180)}`);
  }
  breakers.set(key, state);
}

/** Test seam. */
export function resetCircuitBreakers(): void {
  breakers.clear();
}

export function circuitSnapshot(now = Date.now()): Array<{
  slug: string;
  model: string;
  failures: number;
  open: boolean;
  openUntil: number;
  lastFailure?: FailureKind;
}> {
  return [...breakers.entries()].map(([key, s]) => {
    const [slug, model = ""] = key.split("::");
    return {
      slug,
      model,
      failures: s.consecutiveFailures,
      open: stateIsOpen(s, now),
      openUntil: s.openUntil,
      lastFailure: s.lastFailure,
    };
  });
}

/**
 * Seconds or an HTTP-date, per RFC 9110. Returns undefined for anything else rather
 * than guessing, because a wrong cooldown is worse than the default one.
 */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - now);
}

// ─── Failure classification ─────────────────────────────────────────────────

export function classifyHttpStatus(status: number): FailureKind {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "auth";
  if (status === 400 || status === 422) return "unsupported_schema";
  return "server";
}

/**
 * Providers report the same conditions as prose in a dozen shapes. This reads the
 * message only when there is no status code to read instead.
 */
export function classifyThrownError(err: unknown): { kind: FailureKind; message: string } {
  const message = (err as { message?: string })?.message || String(err);
  const name = (err as { name?: string })?.name || "";
  const status = Number((err as { status?: number })?.status || 0);

  if (status) return { kind: classifyHttpStatus(status), message };
  if (name === "AbortError" || /timed? ?out/i.test(message)) return { kind: "timeout", message };
  if (/\b429\b|rate limit|quota|resource[_ ]exhausted/i.test(message)) {
    return { kind: "rate_limited", message };
  }
  if (/\b40[13]\b|api key|unauthorized|permission denied/i.test(message)) {
    return { kind: "auth", message };
  }
  if (/\b5\d\d\b|internal error|unavailable|overloaded/i.test(message)) {
    return { kind: "server", message };
  }
  return { kind: "network", message };
}

// ─── Adapters ───────────────────────────────────────────────────────────────

interface Usage {
  usage?: ProviderUsage;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

interface AdapterResult extends Usage {
  text: string;
  finishReason?: string;
}

class ProviderError extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly status?: number,
    /**
     * What the failed call still cost. A 200 with an empty body, or one cut off at the
     * token limit, consumed its whole input; only a request that never reached the
     * provider is free.
     */
    readonly usage?: Usage,
    readonly retryAfterMs?: number,
    readonly finishReason?: string,
  ) {
    super(message);
  }
}

/**
 * How to ask a provider not to think out loud.
 *
 * There is no standard for this, and sending one vendor's extension to another is not
 * harmless: DeepSeek's own API documents `thinking: { type: "disabled" }` and has
 * thinking ON by default, so the vLLM-style `chat_template_kwargs.thinking=false` was
 * ignored and the model spent its entire output budget reasoning into a field the
 * OpenAI shape does not have — returning, as far as the caller could tell, nothing.
 *
 * Keyed on the base URL rather than the slug, because the slug is admin-chosen text and
 * the endpoint is what determines the dialect.
 */
function applyThinkingSuppression(body: Record<string, unknown>, route: LlmRoute): void {
  if (!route.suppressReasoning) return;
  if (/(^|\.)deepseek\.com/i.test(hostOf(route.baseUrl))) {
    body.thinking = { type: "disabled" };
    return;
  }
  body.chat_template_kwargs = { thinking: false };
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "";
  }
}

/**
 * OpenAI-compatible: OpenRouter, DeepSeek, Groq, Fireworks, NVIDIA, Together, Ollama,
 * and whatever the admin adds next — the protocol is the same and only `baseUrl` differs.
 * That is the entire reason a new provider needs no code.
 */
async function callOpenAICompatible(
  route: LlmRoute,
  req: LlmRequest,
  withSchema: boolean,
): Promise<AdapterResult> {
  const url = `${route.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: route.model,
    messages: [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: req.userPrompt },
    ],
    max_tokens: req.maxOutputTokens,
    temperature: req.temperature ?? 0.1,
  };

  if (withSchema && req.schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "result", strict: false, schema: toJsonSchema(req.schema) },
    };
  } else if (withSchema) {
    body.response_format = { type: "json_object" };
  }

  // Reasoning models answer into `reasoning_content` and leave `content` null, so a
  // classification request comes back empty however well the model understood it —
  // DeepSeek V4 Flash on NVIDIA spent its entire output budget thinking out loud and
  // returned nothing. Each provider is asked in the dialect it actually implements.
  applyThinkingSuppression(body, route);

  const timeoutMs = Math.min(route.timeoutMs ?? Infinity, req.timeoutMs ?? 30_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const callDeadline = Date.now() + timeoutMs;

  // The deadline has to cover the BODY, and it has to be ours.
  //
  // Two separate holes. First, the timer used to be cleared in the `finally` of the
  // fetch — which is when the response HEADERS arrive — so a provider that answered 200
  // and then stalled mid-body left `await res.json()` waiting with nothing watching it.
  // Second, even with the timer alive, cancellation would depend on the fetch
  // implementation wiring the body stream to the signal. It does, and that is still
  // worth not depending on: the timeout is the one thing in this file whose whole
  // purpose is to hold when something else does not behave. So the abort fires AND the
  // read is raced against the same instant.
  const bounded = <T>(work: Promise<T>): Promise<T> =>
    withTimeout(work, Math.max(1, callDeadline - Date.now()), route.slug);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${route.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await bounded(res.text()).catch(() => "");
      throw new ProviderError(
        classifyHttpStatus(res.status),
        `${route.slug} ${res.status}: ${detail.slice(0, 300)}`,
        res.status,
        undefined,
        parseRetryAfter(res.headers.get("retry-after")),
      );
    }

    const data = (await bounded(res.json())) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };

    const normalized = normalizeProviderUsage(data, "openai", res.headers);
    const promptTokens = normalized.promptTokens ?? 0;
    const completionTokens = normalized.completionTokens ?? 0;
    const usage: Usage = {
      usage: normalized,
      promptTokens,
      completionTokens,
      cachedTokens: normalized.cachedTokens ?? 0,
      totalTokens: normalized.totalTokens ?? promptTokens + completionTokens,
    };

    const choice = data.choices?.[0];
    const finishReason = choice?.finish_reason;
    const text = choice?.message?.content || "";

    // A reply the provider had to cut short is not an answer, and the caller cannot tell
    // the difference from a syntactically invalid one until it has already returned. It
    // costs the same either way, so the usage travels with the error.
    if (finishReason === "length") {
      throw new ProviderError(
        "truncated",
        `${route.slug} stopped at the output limit after ${completionTokens} tokens`,
        undefined,
        usage,
        undefined,
        finishReason,
      );
    }

    if (!text.trim()) {
      throw new ProviderError(
        "empty_response",
        `${route.slug} returned no content`,
        undefined,
        usage,
        undefined,
        finishReason,
      );
    }

    return { text, finishReason, ...usage };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    const { kind, message } = classifyThrownError(err);
    throw new ProviderError(kind, message);
  } finally {
    clearTimeout(timer);
  }
}

/** Gemini speaks its own protocol and enforces `responseSchema` properly, unlike most. */
async function callGemini(
  route: LlmRoute,
  req: LlmRequest,
  withSchema: boolean,
): Promise<AdapterResult> {
  const genAI = new GoogleGenerativeAI(route.apiKey);
  const model = genAI.getGenerativeModel({
    model: route.model,
    systemInstruction: req.systemPrompt,
    generationConfig: {
      temperature: req.temperature ?? 0.1,
      // The budget used to be advisory here and enforced everywhere else: this path set
      // no output cap at all, so the "384 tokens for free plan" ceiling was fiction on
      // the default provider.
      maxOutputTokens: req.maxOutputTokens,
      responseMimeType: "application/json",
      ...(withSchema && req.schema ? { responseSchema: req.schema as never } : {}),
    },
  });

  let result: Awaited<ReturnType<typeof model.generateContent>>;
  try {
    result = await withTimeout(
      model.generateContent(req.userPrompt),
      // `req.timeoutMs` first: the chain narrows it to whatever is left of the trip
      // budget, and a per-route ceiling that outlives the trip is not a ceiling.
      Math.min(route.timeoutMs ?? Infinity, req.timeoutMs ?? 30_000),
      route.slug,
    );
  } catch (err) {
    const { kind, message } = classifyThrownError(err);
    throw new ProviderError(kind, message);
  }

  const meta = result.response.usageMetadata;
  const normalized = normalizeProviderUsage(meta, "gemini");
  const usage: Usage = {
    usage: normalized,
    promptTokens: normalized.promptTokens ?? 0,
    completionTokens: normalized.completionTokens ?? 0,
    cachedTokens: normalized.cachedTokens ?? 0,
    totalTokens: normalized.totalTokens ?? 0,
  };

  // Gemini spells it MAX_TOKENS; the meaning is the OpenAI shape's `finish_reason:
  // "length"`, and so is the consequence — a JSON object cut mid-key that the caller
  // would otherwise receive as a successful classification.
  const finishReason = result.response.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new ProviderError(
      "truncated",
      `gemini stopped at the output limit after ${usage.completionTokens} tokens`,
      undefined,
      usage,
      undefined,
      finishReason,
    );
  }

  // `.text()` throws on a blocked or empty candidate rather than returning "", and that
  // throw used to escape the adapter as an unclassified error.
  let text = "";
  try {
    text = result.response.text();
  } catch (err) {
    throw new ProviderError(
      "empty_response",
      `gemini returned no usable content: ${(err as Error)?.message || String(err)}`,
      undefined,
      usage,
      undefined,
      finishReason,
    );
  }
  if (!text.trim()) {
    throw new ProviderError(
      "empty_response",
      "gemini returned no content",
      undefined,
      usage,
      undefined,
      finishReason,
    );
  }

  return { text, finishReason, ...usage };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error(`${label} timed out after ${ms}ms`), { name: "AbortError" })),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Gemini schemas carry `format: "enum"` and omit `additionalProperties`; strict JSON
 * Schema validators reject the first and object to the second.
 */
export function toJsonSchema(schema: StructuredSchema): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;

    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src)) {
      if (key === "format" && value === "enum") continue;
      if (key === "nullable") continue;
      out[key] = walk(value);
    }
    if (out.type === "object" && out.properties && out.additionalProperties === undefined) {
      out.additionalProperties = false;
    }
    return out;
  };

  return walk(schema) as Record<string, unknown>;
}

// ─── The chain ──────────────────────────────────────────────────────────────

/** Kinds worth trying somewhere else. An unusable schema is fixed on the same provider. */
const MOVES_ON: ReadonlySet<FailureKind> = new Set<FailureKind>([
  "rate_limited",
  "auth",
  "server",
  "timeout",
  "network",
  "empty_response",
  // A model that ran out of output budget will do it again on the same prompt. Another
  // provider, with a different tokenizer and a different verbosity, might not.
  "truncated",
]);

/**
 * Below this, a further provider attempt is not worth starting.
 *
 * "There is time left" and "there is enough time left to be useful" are different
 * questions. Starting a 25-second route with 200ms of budget guarantees an abort, and
 * bills for the tokens the provider processed before hearing about it.
 */
const MIN_VIABLE_REMAINING_MS = 250;

/** At most one probe into the shut-out set per request. */
const MAX_OPEN_PROBES = 1;

/**
 * Try each route in order until one answers.
 *
 * The ordering rule that matters: on a 429 we move to the NEXT PROVIDER rather than
 * sleeping and retrying the same one. The old Gemini path slept 2.5s three times, which
 * is 7.5 seconds of an 8-second budget spent waiting for a quota that resets tomorrow,
 * while three other providers with valid keys sat unused in the same request.
 */
export async function executeLlmChain(
  routes: LlmRoute[],
  req: LlmRequest,
): Promise<LlmResponse> {
  const usable = routes.filter((r) => r.apiKey && r.model);
  if (usable.length === 0) {
    throw new LlmChainError("No provider has both a key and a model configured", []);
  }

  const chainStartedAt = Date.now();
  const deadlineAt = req.deadlineMs ? chainStartedAt + req.deadlineMs : Infinity;

  const attempts: LlmAttempt[] = [];
  const totals = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0 };
  const bill = (usage?: Usage): void => {
    if (!usage) return;
    totals.promptTokens += usage.promptTokens;
    totals.completionTokens += usage.completionTokens;
    totals.cachedTokens += usage.cachedTokens;
    totals.totalTokens += usage.totalTokens;
  };

  const ordered = [...usable].sort((a, b) => a.priority - b.priority);
  const now = Date.now();
  const closed = ordered.filter((r) => !isCircuitOpen(r.slug, now, r.model));
  const open = ordered.filter((r) => isCircuitOpen(r.slug, now, r.model));

  // A shut-out route is tried at most ONCE per request, and only behind everything we
  // still believe in.
  //
  // They used to be appended in full: during a broad outage — the moment the extra
  // round trips hurt most — every request paid for every dead provider before failing.
  // Refusing them outright would be worse, because then nothing would ever discover a
  // recovery and a blip would become a permanent outage. One probe buys the recovery
  // signal at a bounded price.
  const queue = [...closed, ...open.slice(0, MAX_OPEN_PROBES)];

  for (const route of queue) {
    const remaining = deadlineAt - Date.now();
    if (remaining < MIN_VIABLE_REMAINING_MS) {
      attempts.push({
        slug: route.slug,
        model: route.model,
        ok: false,
        latencyMs: 0,
        failure: "timeout",
        message: `skipped: ${Math.max(0, remaining)}ms left of the ${req.deadlineMs}ms budget`,
      });
      break;
    }

    const startedAt = Date.now();
    let degradedSchema = false;
    // Never let one route outlive the trip budget, whatever its own timeout says.
    const shaped: LlmRequest = {
      ...req,
      timeoutMs: Math.min(route.timeoutMs ?? req.timeoutMs ?? 30_000, remaining),
    };

    for (let pass = 0; pass < 2; pass++) {
      const attemptStartedAt = Date.now();
      const passRemaining = deadlineAt - attemptStartedAt;
      if (passRemaining < MIN_VIABLE_REMAINING_MS) break;
      const withSchema = pass === 0;
      if (!withSchema) degradedSchema = true;

      try {
        const call = route.protocol === "gemini" ? callGemini : callOpenAICompatible;
        const prompted = { ...(req.promptFor ? { ...shaped, ...req.promptFor(route) } : shaped),
          timeoutMs: Math.min(shaped.timeoutMs ?? Infinity, passRemaining) };
        const result = await call(route, prompted, withSchema);

        recordSuccess(route);
        const usage: Usage = {
          usage: result.usage,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          cachedTokens: result.cachedTokens,
          totalTokens: result.totalTokens,
        };
        bill(usage);
        attempts.push({
          slug: route.slug,
          model: route.model,
          providerId: route.providerId,
          cost: priceProviderUsage(result.usage ?? normalizeProviderUsage(null), route.prices),
          ok: true,
          latencyMs: Date.now() - attemptStartedAt,
          finishReason: result.finishReason,
          ...usage,
        });

        return {
          text: result.text,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          cachedTokens: result.cachedTokens,
          totalTokens: result.totalTokens,
          route,
          latencyMs: Date.now() - startedAt,
          attempts,
          attemptTotals: { ...totals },
          degradedSchema,
        };
      } catch (err) {
        const pe =
          err instanceof ProviderError
            ? err
            : new ProviderError(classifyThrownError(err).kind, classifyThrownError(err).message);

        bill(pe.usage);
        attempts.push({
          slug: route.slug,
          model: route.model,
          ok: false,
          latencyMs: Date.now() - attemptStartedAt,
          failure: pe.kind,
          status: pe.status,
          message: pe.message.slice(0, 300),
          finishReason: pe.finishReason,
          retryAfterMs: pe.retryAfterMs,
          ...(pe.usage ?? {}),
          providerId: route.providerId,
          usage: pe.usage?.usage ?? normalizeProviderUsage(null),
          cost: priceProviderUsage(pe.usage?.usage ?? normalizeProviderUsage(null), route.prices),
        });

        // NVIDIA answers 400 to a `response_format` it does not implement, and the
        // request is otherwise perfectly good. Drop the schema and ask once more —
        // the post-parse validator is the real guard anyway, so structure was never
        // something we were entitled to assume.
        if (pe.kind === "unsupported_schema" && withSchema) continue;

        if (MOVES_ON.has(pe.kind)) recordFailure(route, pe.kind, pe.message, pe.retryAfterMs);
        break;
      }
    }
  }

  const summary = attempts
    .map((a) => `${a.slug}(${a.failure || "?"}${a.status ? ` ${a.status}` : ""})`)
    .join(" \u2192 ");
  throw new LlmChainError(`All ${attempts.length} attempt(s) failed: ${summary}`, attempts);
}
