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

export type LlmProtocol = "openai" | "gemini";

/** One provider+model the router may try. */
export interface LlmRoute {
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
  timeoutMs?: number;
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
  | "empty_response";

export interface LlmAttempt {
  slug: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  failure?: FailureKind;
  status?: number;
  message?: string;
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
  lastFailure?: FailureKind;
  lastMessage?: string;
}

const OPEN_AFTER_FAILURES = 3;
const COOLDOWN_MS = 60_000;
/** A bad key does not fix itself in a minute, and each retry is a wasted round trip. */
const AUTH_COOLDOWN_MS = 10 * 60_000;

const breakers = new Map<string, BreakerState>();

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

export function isCircuitOpen(slug: string, now = Date.now()): boolean {
  const state = breakers.get(slug);
  if (!state || state.consecutiveFailures < OPEN_AFTER_FAILURES) return false;
  const cooldown = state.lastFailure === "auth" ? AUTH_COOLDOWN_MS : COOLDOWN_MS;
  if (now - state.openedAt >= cooldown) {
    // Half-open: let exactly one request through to find out. Reset to one below the
    // threshold so a single failure re-opens it immediately rather than granting three
    // more free attempts against a provider we already believe is down.
    state.consecutiveFailures = OPEN_AFTER_FAILURES - 1;
    return false;
  }
  return true;
}

function recordSuccess(slug: string): void {
  const had = breakers.get(slug);
  breakers.delete(slug);
  if (had && had.consecutiveFailures >= OPEN_AFTER_FAILURES) {
    reportHealth(slug, "healthy");
  }
}

function recordFailure(slug: string, kind: FailureKind, message: string): void {
  const state = breakers.get(slug) || { consecutiveFailures: 0, openedAt: 0 };
  state.consecutiveFailures++;
  state.lastFailure = kind;
  state.lastMessage = message;

  // An unusable key is not a flaky provider — open on the first one rather than paying
  // for two more round trips to learn what the 401 already said.
  const trip = kind === "auth" || state.consecutiveFailures >= OPEN_AFTER_FAILURES;
  if (trip) {
    if (kind === "auth") state.consecutiveFailures = OPEN_AFTER_FAILURES;
    if (!state.openedAt || Date.now() - state.openedAt > COOLDOWN_MS) {
      state.openedAt = Date.now();
    }
    reportHealth(slug, "down", `${kind}: ${message.slice(0, 180)}`);
  } else {
    reportHealth(slug, "degraded", `${kind}: ${message.slice(0, 180)}`);
  }
  breakers.set(slug, state);
}

/** Test seam. */
export function resetCircuitBreakers(): void {
  breakers.clear();
}

export function circuitSnapshot(): Array<{
  slug: string;
  failures: number;
  open: boolean;
  lastFailure?: FailureKind;
}> {
  return [...breakers.entries()].map(([slug, s]) => ({
    slug,
    failures: s.consecutiveFailures,
    open: isCircuitOpen(slug),
    lastFailure: s.lastFailure,
  }));
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

interface AdapterResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

class ProviderError extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${route.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const { kind, message } = classifyThrownError(err);
    throw new ProviderError(kind, message);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ProviderError(
      classifyHttpStatus(res.status),
      `${route.slug} ${res.status}: ${detail.slice(0, 300)}`,
      res.status,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  const text = data.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new ProviderError("empty_response", `${route.slug} returned no content`);

  const promptTokens = data.usage?.prompt_tokens || 0;
  const completionTokens = data.usage?.completion_tokens || 0;
  return {
    text,
    promptTokens,
    completionTokens,
    cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens || 0,
    totalTokens: data.usage?.total_tokens || promptTokens + completionTokens,
  };
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
      req.timeoutMs ?? 30_000,
      route.slug,
    );
  } catch (err) {
    const { kind, message } = classifyThrownError(err);
    throw new ProviderError(kind, message);
  }

  const text = result.response.text();
  if (!text.trim()) throw new ProviderError("empty_response", "gemini returned no content");

  const usage = result.response.usageMetadata;
  return {
    text,
    promptTokens: usage?.promptTokenCount || 0,
    completionTokens: usage?.candidatesTokenCount || 0,
    cachedTokens: (usage as { cachedContentTokenCount?: number })?.cachedContentTokenCount || 0,
    totalTokens: usage?.totalTokenCount || 0,
  };
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
]);

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

  const attempts: LlmAttempt[] = [];
  const ordered = [...usable].sort((a, b) => a.priority - b.priority);

  // Skipping every open breaker would mean answering nothing at all during a broad
  // outage. They go last instead: a route we believe is down is still better than
  // failing the request outright.
  const closed = ordered.filter((r) => !isCircuitOpen(r.slug));
  const open = ordered.filter((r) => isCircuitOpen(r.slug));

  for (const route of [...closed, ...open]) {
    const startedAt = Date.now();
    let degradedSchema = false;

    for (let pass = 0; pass < 2; pass++) {
      const withSchema = pass === 0;
      if (!withSchema) degradedSchema = true;

      try {
        const call = route.protocol === "gemini" ? callGemini : callOpenAICompatible;
        const shaped = req.promptFor ? { ...req, ...req.promptFor(route) } : req;
        const result = await call(route, shaped, withSchema);

        recordSuccess(route.slug);
        attempts.push({
          slug: route.slug,
          model: route.model,
          ok: true,
          latencyMs: Date.now() - startedAt,
        });

        return {
          ...result,
          route,
          latencyMs: Date.now() - startedAt,
          attempts,
          degradedSchema,
        };
      } catch (err) {
        const pe =
          err instanceof ProviderError
            ? err
            : new ProviderError(classifyThrownError(err).kind, classifyThrownError(err).message);

        attempts.push({
          slug: route.slug,
          model: route.model,
          ok: false,
          latencyMs: Date.now() - startedAt,
          failure: pe.kind,
          status: pe.status,
          message: pe.message.slice(0, 300),
        });

        // NVIDIA answers 400 to a `response_format` it does not implement, and the
        // request is otherwise perfectly good. Drop the schema and ask once more —
        // the post-parse validator is the real guard anyway, so structure was never
        // something we were entitled to assume.
        if (pe.kind === "unsupported_schema" && withSchema) continue;

        if (MOVES_ON.has(pe.kind)) recordFailure(route.slug, pe.kind, pe.message);
        break;
      }
    }
  }

  const summary = attempts
    .map((a) => `${a.slug}(${a.failure || "?"}${a.status ? ` ${a.status}` : ""})`)
    .join(" → ");
  throw new LlmChainError(`All ${attempts.length} attempt(s) failed: ${summary}`, attempts);
}
