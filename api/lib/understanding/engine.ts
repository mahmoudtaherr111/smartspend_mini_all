/**
 * The engine: one sentence in, the money events in it out, each one saved, shown or asked
 * about.
 *
 * A model reads the sentence (`prompt.ts`, `contract.ts`); the code keeps the reading honest
 * (`guard.ts`) and decides what may be saved without the person looking (`policy.ts`). There
 * is no local guess behind the model: a reply that cannot be read is a provider failure, and
 * when no provider can answer the caller keeps the sentence for later instead of recording
 * something the engine did not understand.
 *
 * What is NOT here, on purpose: the database, the budget and the logs. The caller loads the
 * context (`context.ts`), admits the call before and records its cost after. This file
 * imports only pure modules and the provider router, so a script with no MySQL can run it.
 *
 * Why: docs/decisions/0052-understanding-engine.md.
 */
import { TAXONOMY_VERSION } from "../../../contracts/taxonomy";
import { executeLlmChain, LlmChainError, type LlmAttempt, type LlmRequest, type LlmResponse, type LlmRoute } from "../llm-router";
import { storedShape, type StoredShape } from "./bridge";
import { parseReply, READING_CONTRACT_VERSION, READING_SCHEMA, type AskAbout, type Reading } from "./contract";
import { guardReading, type GuardedEvent } from "./guard";
import { foldForMatch, numberMentions } from "./numbers";
import { decide, DEFAULT_POLICY, type PolicySettings } from "./policy";
import { buildSystemPrompt, buildUserPrompt, MAX_SENTENCE_CHARS, PROMPT_VERSION } from "./prompt";
import { numberSetting, toGuardContext, toPolicyFacts, toPromptContext, type ReadingContext } from "./reading-context";

export interface UnderstandInput {
  text: string;
  context: ReadingContext;
  /** System settings: the policy and the limits are read from them. */
  settings: Record<string, string>;
  /** From `resolveUnderstandingRoutes`. */
  routes: LlmRoute[];
  /** A ceiling from the caller's budget. */
  maxOutputTokens?: number;
}

export interface UnderstoodEvent extends GuardedEvent {
  /** Why it is shown (from the verdict); empty when it may be saved. */
  reasons: string[];
  /** The names, row type and direction the ledger stores today. */
  stored: StoredShape;
  /** Resolved from the commitment reference; null when the event names none. */
  commitmentId: number | null;
  /** The due date a payment of that commitment settles. */
  commitmentDueDay: string | null;
  walletId: number | null;
  /** In business mode: the business's own category this event names. */
  businessCategory?: string;
}

export interface UnderstandingUsage {
  attempts: LlmAttempt[];
  servedBy: string | null;
  model: string | null;
  degradedSchema: boolean;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface Understanding {
  outcome: "save" | "show" | "ask";
  question?: string;
  askAbout?: AskAbout;
  events: UnderstoodEvent[];
  ignored: Reading["ignored"];
  numbers: Reading["numbers"];
  /** Reading-level reasons. */
  reasons: string[];
  /** "none": answered without a model, because there was nothing to read. */
  source: "model" | "none";
  usage: UnderstandingUsage;
  versions: { contract: string; prompt: string; taxonomy: string };
  /** Parse repairs and provider-reply problems, for the trace. Never content. */
  problems: string[];
}

/**
 * No provider could read the sentence. The caller keeps it for later; `attempts` and `tokens`
 * are what the failed tries cost, to be recorded like any other call.
 */
export class UnderstandingUnavailableError extends Error {
  constructor(
    message: string,
    readonly attempts: LlmAttempt[],
    readonly tokens: LlmResponse["attemptTotals"] = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0 },
  ) {
    super(message);
    this.name = "UnderstandingUnavailableError";
  }
}

export const VERSIONS = { contract: READING_CONTRACT_VERSION, prompt: PROMPT_VERSION, taxonomy: TAXONOMY_VERSION } as const;

/** Messages for a sentence the engine does not send to a model. */
const EMPTY_TEXT = "مش لاقيين كلام نسجّله. اكتب دفعت إيه وبكام.";
const TEXT_TOO_LONG = "الكلام طويل أوي على مرة واحدة. ابعته على أجزاء أقصر.";

const OUTPUT_TOKENS = { base: 220, perNumber: 130, max: 4000 } as const;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_DEADLINE_MS = 15000;
/** Below this much of the trip left, a second try on the remaining routes is not started. */
const MIN_RETRY_MS = 250;

/** The policy as the admin set it; anything missing or unreadable keeps its default. */
export function policyFromSettings(settings: Record<string, string> = {}): PolicySettings {
  const flag = (name: string, fallback: boolean) =>
    settings[name] === "false" ? false : settings[name] === "true" ? true : fallback;
  return {
    autoSave: settings.understanding_auto_save !== "false" && DEFAULT_POLICY.autoSave,
    reviewAmount: numberSetting(settings, "understanding_review_amount", DEFAULT_POLICY.reviewAmount),
    autoMaxEvents: Math.floor(numberSetting(settings, "understanding_auto_max_events", DEFAULT_POLICY.autoMaxEvents)),
    reviewDated: flag("understanding_review_dated", DEFAULT_POLICY.reviewDated),
  };
}

/** Enough room for a reply about this sentence: a base plus a share per number it holds. */
export function outputTokensFor(text: string, ceiling?: number): number {
  const wanted = OUTPUT_TOKENS.base + OUTPUT_TOKENS.perNumber * numberMentions(text).length;
  const caller = ceiling !== undefined && Number.isFinite(ceiling) && ceiling > 0 ? Math.floor(ceiling) : OUTPUT_TOKENS.max;
  return Math.min(wanted, caller, OUTPUT_TOKENS.max);
}

const routeKey = (route: { slug: string; model: string }) => `${route.slug}::${route.model}`;

/**
 * The routes a reply that could not be read leaves to try: those after the one that served,
 * in the chain's own order, that this request has not tried yet.
 */
export function routesAfter(routes: readonly LlmRoute[], served: LlmRoute, attempts: readonly LlmAttempt[]): LlmRoute[] {
  const ordered = routes
    .map((route, index) => ({ route, index }))
    .sort((a, b) => a.route.priority - b.route.priority || a.index - b.index)
    .map(({ route }) => route);
  const at = ordered.findIndex((route) => routeKey(route) === routeKey(served));
  const tried = new Set(attempts.map(routeKey));
  return ordered.slice(at + 1).filter((route) => !tried.has(routeKey(route)) && route.apiKey && route.model);
}

/** The business's own category the event's words name, longest first; whole words of folded text. */
export function businessCategoryOf(event: { what: string; quote: string }, names: readonly string[]): string | undefined {
  const haystacks = [event.what, event.quote].map((value) => ` ${foldForMatch(value)} `);
  return [...names]
    .map((name) => ({ name, folded: foldForMatch(name) }))
    .filter((entry) => entry.folded)
    .sort((a, b) => b.folded.length - a.folded.length)
    .find((entry) => haystacks.some((text) => text.includes(` ${entry.folded} `)))?.name;
}

const emptyUsage = (): UnderstandingUsage => ({
  attempts: [], servedBy: null, model: null, degradedSchema: false,
  promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0, latencyMs: 0,
});

function addTotals(into: UnderstandingUsage, totals: LlmResponse["attemptTotals"]): void {
  into.promptTokens += totals.promptTokens;
  into.completionTokens += totals.completionTokens;
  into.cachedTokens += totals.cachedTokens;
  into.totalTokens += totals.totalTokens;
}

function answeredWithoutModel(question: string, reason: string): Understanding {
  return {
    outcome: "ask", question, askAbout: "none", events: [], ignored: [], numbers: [], reasons: [reason],
    source: "none", usage: emptyUsage(), versions: { ...VERSIONS }, problems: [],
  };
}

function unavailable(message: string, usage: UnderstandingUsage): UnderstandingUnavailableError {
  return new UnderstandingUnavailableError(message, usage.attempts, {
    promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, cachedTokens: usage.cachedTokens, totalTokens: usage.totalTokens,
  });
}

export async function understand(input: UnderstandInput, deps: { execute?: typeof executeLlmChain } = {}): Promise<Understanding> {
  const execute = deps.execute ?? executeLlmChain;
  const text = String(input.text ?? "").trim();
  if (!text) return answeredWithoutModel(EMPTY_TEXT, "empty_text");
  if (text.length > MAX_SENTENCE_CHARS) return answeredWithoutModel(TEXT_TOO_LONG, "text_too_long");

  const usage = emptyUsage();
  const problems: string[] = [];
  try {
    const { context: ctx, settings } = input;
    const deadlineMs = numberSetting(settings, "llm_trip_deadline_ms", DEFAULT_DEADLINE_MS);
    const request: LlmRequest = {
      // `understanding_prompt_detail=compact` is for provider tiers with a small tokens-per-minute allowance.
      systemPrompt: buildSystemPrompt(input.settings?.understanding_prompt_detail === "compact" ? "compact" : "full"),
      userPrompt: buildUserPrompt(toPromptContext(ctx), text),
      schema: READING_SCHEMA,
      lowThinking: true,
      temperature: 0,
      timeoutMs: numberSetting(settings, "llm_timeout_ms", DEFAULT_TIMEOUT_MS),
      deadlineMs,
      maxOutputTokens: outputTokensFor(text, input.maxOutputTokens),
    };

    const startedAt = Date.now();
    const call = async (routes: LlmRoute[], req: LlmRequest): Promise<LlmResponse> => {
      try {
        const res = await execute(routes, req);
        usage.attempts.push(...res.attempts);
        addTotals(usage, res.attemptTotals);
        return res;
      } catch (err) {
        if (err instanceof LlmChainError) {
          usage.attempts.push(...err.attempts);
          // A failed attempt may still have spent tokens before it failed.
          for (const attempt of err.attempts) {
            usage.promptTokens += attempt.promptTokens ?? 0;
            usage.completionTokens += attempt.completionTokens ?? 0;
            usage.cachedTokens += attempt.cachedTokens ?? 0;
            usage.totalTokens += attempt.totalTokens ?? 0;
          }
        }
        throw unavailable("No provider could read the sentence", usage);
      } finally {
        usage.latencyMs = Date.now() - startedAt;
      }
    };

    let res = await call(input.routes, request);
    let parsed = parseReply(res.text);
    if (!parsed) {
      // `executeLlmChain` already returned, so it cannot move on by itself: the routes after
      // the one that served get the same request once, within what is left of the trip.
      problems.push(`unusable reply from ${res.route.slug}/${res.route.model}`);
      const rest = routesAfter(input.routes, res.route, usage.attempts);
      const left = deadlineMs - (Date.now() - startedAt);
      if (!rest.length || left < MIN_RETRY_MS) throw unavailable("The reply could not be read and no route is left", usage);
      res = await call(rest, { ...request, deadlineMs: left });
      parsed = parseReply(res.text);
      if (!parsed) {
        problems.push(`unusable reply from ${res.route.slug}/${res.route.model}`);
        throw unavailable("No route returned a readable reply", usage);
      }
    }
    usage.servedBy = res.route.slug;
    usage.model = res.route.model;
    usage.degradedSchema = res.degradedSchema;
    problems.push(...parsed.problems);

    const guarded = guardReading(parsed.reading, text, toGuardContext(ctx, settings));
    const verdict = decide(guarded, toPolicyFacts(ctx), policyFromSettings(settings));

    const events = guarded.events.map((event, index): UnderstoodEvent => {
      const commitment = event.commitment ? ctx.commitmentRefs.get(event.commitment) : undefined;
      const walletId = event.wallet ? ctx.walletRefs.get(event.wallet) : undefined;
      const reasons = verdict.events[index]?.reasons ?? (event.amount > 0 ? [] : ["amount_missing"]);
      const understood: UnderstoodEvent = {
        ...event,
        reasons,
        stored: storedShape(event),
        commitmentId: commitment?.cashflowId ?? null,
        commitmentDueDay: commitment?.dueDay ?? null,
        walletId: walletId ?? null,
      };
      if (ctx.businessMode && (event.category === "work" || event.category === "business_income")) {
        const own = businessCategoryOf(event, ctx.businessCategories);
        if (own) understood.businessCategory = own;
      }
      return understood;
    });

    return {
      outcome: verdict.outcome,
      ...(verdict.question !== undefined ? { question: verdict.question } : {}),
      ...(verdict.askAbout !== undefined ? { askAbout: verdict.askAbout } : {}),
      events,
      ignored: guarded.ignored,
      numbers: guarded.numbers,
      reasons: verdict.reasons,
      source: "model",
      usage,
      versions: { ...VERSIONS },
      problems,
    };
  } catch (err) {
    if (err instanceof UnderstandingUnavailableError) throw err;
    // A defect past the provider is still "not understood": the caller's contract is one error type.
    const wrapped = unavailable("The reading could not be completed", usage);
    (wrapped as Error & { cause?: unknown }).cause = err;
    throw wrapped;
  }
}
