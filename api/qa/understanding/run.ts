/**
 * Runs a labelled set through the understanding engine on ONE real model route, slowly enough
 * for a free-tier key, and scores it.
 *
 *   npm run eval:understand -- --set api/qa/understanding/dev-set.json --rpm 8 [--limit N]
 *     [--ids D-001,D-002] [--out <dir>] [--route gemini:gemini-3.1-flash-lite] [--resume]
 *     [--strict-policy] [--setting name=value ...]
 *
 * Routes come from environment keys only, never from the database, and the harness opens no
 * database or Redis connection: the engine is pure, and the server environment that
 * `api/lib/env.ts` insists on is filled with unreachable placeholders before anything that
 * imports it is loaded.
 *
 * Every finished case is appended to `<out>/results.jsonl` at once, so a run stopped by a
 * quota, five failures in a row or Ctrl-C continues with `--resume`.
 */
import "dotenv/config";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LlmAttempt, LlmRoute } from "../../lib/llm-router";
import { BUILTIN_BASE_URLS, looksLikeReasoningModel } from "../../lib/llm-provider-chain";
import { defaultFireworksModelForPlan, defaultGeminiModelForPlan, defaultGroqModelForPlan, defaultNvidiaModelForPlan, mapModelName } from "../../lib/model-mapper";
import type { ReadingContext } from "../../lib/understanding/reading-context";
import { DEFAULT_RETRY, RateLimiter, realSleep, runWithRetries, type RetryPolicy, type Sleep, type TryResult } from "./limiter";
import { FAILURES_FILE, finishedIds, META_FILE, readMeta, RESULTS_FILE, writeReport, type FailureRecord, type RunMeta } from "./report";
import type { CaseResult, Outcome, PredictedEvent } from "./score";
import { InvalidSetError, loadSet, type EvalCase } from "./set";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const EVAL_ROOT = join(REPO_ROOT, ".agents/rebuild/eval");

// ─── Arguments ──────────────────────────────────────────────────────────────────

export interface Options {
  set: string;
  rpm: number;
  limit: number | null;
  ids: string[] | null;
  out: string | null;
  route: string | null;
  resume: boolean;
  strictPolicy: boolean;
  settings: Record<string, string>;
  help: boolean;
}

export const USAGE = `Usage: npm run eval:understand -- --set <set.json> [options]

  --set <path>          labelled set (default api/qa/understanding/dev-set.json)
  --rpm <n>             requests per minute, spaced between starts (default 8)
  --limit <n>           only the first n cases of the set (after --ids)
  --ids <a,b,...>       only these case ids
  --route <slug:model>  the one model to measure; required when more than one key is set
                        slugs: gemini, groq, openrouter, nvidia, fireworks, anthropic
  --out <dir>           run folder (default .agents/rebuild/eval/<set>-<route>-<yyyymmdd-hhmm>)
  --resume              skip cases already in <out>/results.jsonl (without --out: the latest
                        run folder of this set and route)
  --strict-policy       isFamiliar and isKnownPerson false, as for a new user
  --setting name=value  a system setting the engine reads (repeatable), e.g. llm_timeout_ms=20000
  --help                this text

Keys are read from the environment (or .env): GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY,
NVIDIA_API_KEY, FIREWORKS_API_KEY, ANTHROPIC_API_KEY. Score an existing run with
npm run eval:understand:score -- --out <dir>.
`;

export class UsageError extends Error {}

export function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    set: "api/qa/understanding/dev-set.json",
    rpm: 8,
    limit: null,
    ids: null,
    out: null,
    route: null,
    resume: false,
    strictPolicy: false,
    settings: {},
    help: false,
  };
  const flags = new Set(["resume", "strict-policy", "help"]);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new UsageError(`unexpected argument "${arg}"`);
    const eq = arg.indexOf("=");
    const name = arg.slice(2, eq > 0 ? eq : undefined);
    let value: string | undefined;
    if (!flags.has(name)) {
      value = eq > 0 ? arg.slice(eq + 1) : argv[++index];
      if (value === undefined || value === "") throw new UsageError(`--${name} needs a value`);
    }
    switch (name) {
      case "set":
        options.set = value!;
        break;
      case "rpm":
        options.rpm = Number(value);
        if (!Number.isFinite(options.rpm) || options.rpm <= 0) throw new UsageError("--rpm must be a positive number");
        break;
      case "limit":
        options.limit = Number(value);
        if (!Number.isInteger(options.limit) || options.limit <= 0) throw new UsageError("--limit must be a positive whole number");
        break;
      case "ids":
        options.ids = value!.split(",").map((id) => id.trim()).filter(Boolean);
        break;
      case "out":
        options.out = value!;
        break;
      case "route":
        options.route = value!;
        break;
      case "setting": {
        const at = value!.indexOf("=");
        if (at <= 0) throw new UsageError("--setting takes name=value");
        options.settings[value!.slice(0, at)] = value!.slice(at + 1);
        break;
      }
      case "resume":
        options.resume = true;
        break;
      case "strict-policy":
        options.strictPolicy = true;
        break;
      case "help":
        options.help = true;
        break;
      default:
        throw new UsageError(`unknown option --${name}`);
    }
  }
  return options;
}

// ─── The route ──────────────────────────────────────────────────────────────────

interface ProviderSpec {
  slug: string;
  envKey: string;
  protocol: LlmRoute["protocol"];
  baseUrl: string;
  /** The model a run uses when `--route` names none; null when there is no sensible default. */
  defaultModel: string | null;
}

export const PROVIDERS: readonly ProviderSpec[] = [
  { slug: "gemini", envKey: "GEMINI_API_KEY", protocol: "gemini", baseUrl: "", defaultModel: defaultGeminiModelForPlan("free") },
  { slug: "groq", envKey: "GROQ_API_KEY", protocol: "openai", baseUrl: BUILTIN_BASE_URLS.groq, defaultModel: defaultGroqModelForPlan("free") },
  { slug: "openrouter", envKey: "OPENROUTER_API_KEY", protocol: "openai", baseUrl: BUILTIN_BASE_URLS.openrouter, defaultModel: null },
  { slug: "nvidia", envKey: "NVIDIA_API_KEY", protocol: "openai", baseUrl: BUILTIN_BASE_URLS.nvidia, defaultModel: defaultNvidiaModelForPlan("free") },
  { slug: "fireworks", envKey: "FIREWORKS_API_KEY", protocol: "openai", baseUrl: BUILTIN_BASE_URLS.fireworks, defaultModel: defaultFireworksModelForPlan("free") },
  { slug: "anthropic", envKey: "ANTHROPIC_API_KEY", protocol: "anthropic", baseUrl: BUILTIN_BASE_URLS.anthropic, defaultModel: null },
];

/** The unit suite and these placeholders are not keys; a run against them would score 401s as answers. */
export function usableKey(value: string | undefined): string {
  const key = (value ?? "").trim();
  if (!key || key === "test" || key.startsWith(PLACEHOLDER) || key.length < 20) return "";
  return key;
}

/** The one route a run measures, from the environment's keys and `--route`; throws a `UsageError` saying why not. */
export function resolveRoute(env: Record<string, string | undefined>, routeArg: string | null): LlmRoute {
  const keyed = PROVIDERS.filter((provider) => usableKey(env[provider.envKey]));
  let spec: ProviderSpec | undefined;
  let model: string | null;
  if (routeArg) {
    const at = routeArg.indexOf(":");
    const slug = at > 0 ? routeArg.slice(0, at) : routeArg;
    spec = PROVIDERS.find((provider) => provider.slug === slug);
    if (!spec) throw new UsageError(`unknown provider "${slug}" in --route; one of ${PROVIDERS.map((p) => p.slug).join(", ")}`);
    if (!usableKey(env[spec.envKey])) throw new UsageError(`--route ${slug} needs ${spec.envKey} in the environment (missing, a placeholder, or too short)`);
    model = at > 0 ? routeArg.slice(at + 1) : spec.defaultModel;
  } else {
    if (keyed.length === 0) {
      throw new UsageError(`no model key in the environment: set one of ${PROVIDERS.map((p) => p.envKey).join(", ")} (a real key, not a placeholder)`);
    }
    if (keyed.length > 1) {
      throw new UsageError(`keys for ${keyed.map((p) => p.slug).join(", ")} are set; a run measures one model, so pass --route <slug:model>`);
    }
    spec = keyed[0];
    model = spec.defaultModel;
  }
  if (!model) throw new UsageError(`${spec.slug} has no default model here; pass --route ${spec.slug}:<model>`);
  const mapped = spec.protocol === "gemini" ? mapModelName(model) : model;
  return {
    slug: spec.slug,
    protocol: spec.protocol,
    baseUrl: spec.baseUrl,
    apiKey: usableKey(env[spec.envKey]),
    model: mapped,
    priority: 0,
    suppressReasoning: looksLikeReasoningModel(mapped) || undefined,
  };
}

// ─── Environment for the server modules the engine shares ───────────────────────

const PLACEHOLDER = "eval-harness-unused";

/**
 * `api/lib/env.ts` validates the whole server environment when it is first imported (through
 * `api/lib/app-time.ts`), and throws without a database URL, OAuth values and a JWT secret.
 * The harness needs none of them. The database URL is ALWAYS replaced with an unreachable one
 * and Redis is turned off, so even a module that tried could not reach real data.
 * Call after the route is resolved: the placeholders are never keys (`usableKey`).
 */
export function prepareScriptEnv(env: NodeJS.ProcessEnv = process.env): void {
  env.DATABASE_URL = "mysql://eval-harness:unused@127.0.0.1:1/eval-harness-no-database";
  env.REDIS_URL = "";
  env.ENABLE_CRONS = "false";
  for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "JWT_SECRET", "GEMINI_API_KEY"]) {
    if (!env[name]) env[name] = PLACEHOLDER;
  }
}

// ─── The engine, behind one function ────────────────────────────────────────────

/** The parts of the engine's `Understanding` the harness records (PACKAGES.md, Package E1). */
export interface EngineAnswer {
  outcome: Outcome;
  question?: string;
  askAbout?: string;
  events: Array<Omit<PredictedEvent, "personRelation"> & { personRelation?: string }>;
  reasons: string[];
  source: string;
  usage: {
    attempts: LlmAttempt[];
    servedBy: string | null;
    model: string | null;
    degradedSchema: boolean;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    totalTokens: number;
    latencyMs: number;
  };
  versions: Record<string, string>;
  problems: string[];
}

export interface EngineInput {
  text: string;
  context: ReadingContext;
  settings: Record<string, string>;
  routes: LlmRoute[];
}

export type Understand = (input: EngineInput) => Promise<EngineAnswer>;

/** The single call to the engine. Loaded on first use, after `prepareScriptEnv`. */
export const callEngine: Understand = async (input) => {
  const engine = await import("../../lib/understanding/engine");
  return engine.understand(input);
};

// ─── One case ───────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface Today {
  day: string;
  weekday: string;
}

/**
 * A case's context: empty unless the case supplies people, commitments or wallets, built by the
 * engine's own `assembleContext` so references are assigned as in production. Unless
 * `strictPolicy`, every pair is familiar and every person known, so the first-time rules of the
 * policy do not blur what is measured.
 */
export function caseContext(
  item: EvalCase,
  today: Today,
  strictPolicy: boolean,
  assemble: typeof import("../../lib/understanding/reading-context").assembleContext,
): ReadingContext {
  const given = item.context ?? {};
  const ctx = assemble({
    today: today.day,
    weekday: today.weekday,
    contacts: (given.people ?? []).map((person) => ({ name: person.name, relation: person.relation ?? null })),
    commitments: (given.commitments ?? []).map((commitment, index) => ({
      cashflowId: index + 1,
      title: commitment.title,
      kindLabel: commitment.kindLabel,
      amount: commitment.amount ?? null,
      dueDay: commitment.dueDay ?? null,
      person: commitment.person ?? null,
    })),
    wallets: (given.wallets ?? []).map((wallet, index) => ({ id: index + 1, name: wallet.name })),
  });
  if (strictPolicy) return ctx;
  return { ...ctx, isFamiliar: () => true, isKnownPerson: () => true };
}

/** What the harness keeps of an answer: no prompt, and provider messages cut short. */
export function toCaseResult(item: EvalCase, answer: EngineAnswer, today: string, latencyMs: number, retries: number): CaseResult {
  const events: PredictedEvent[] = answer.events.map((event) => ({
    quote: event.quote,
    amount: event.amount,
    kind: event.kind,
    flow: event.flow,
    category: event.category,
    sub: event.sub,
    what: event.what,
    person: event.person,
    personRole: event.personRole,
    personRelation: event.personRelation ?? "",
    commitment: event.commitment,
    installments: event.installments,
    wallet: event.wallet,
    date: event.date,
    doubt: event.doubt,
    flags: [...event.flags],
    reasons: [...event.reasons],
  }));
  return {
    id: item.id,
    today,
    outcome: answer.outcome,
    ...(answer.question ? { question: answer.question } : {}),
    ...(answer.askAbout ? { askAbout: answer.askAbout } : {}),
    source: answer.source,
    events,
    flags: [...new Set(events.flatMap((event) => event.flags))],
    reasons: [...answer.reasons],
    usage: {
      promptTokens: answer.usage.promptTokens,
      completionTokens: answer.usage.completionTokens,
      cachedTokens: answer.usage.cachedTokens,
      totalTokens: answer.usage.totalTokens,
      servedBy: answer.usage.servedBy,
      model: answer.usage.model,
      degradedSchema: answer.usage.degradedSchema,
      attempts: answer.usage.attempts.map((attempt) => ({
        slug: attempt.slug,
        model: attempt.model,
        ok: attempt.ok,
        latencyMs: attempt.latencyMs,
        ...(attempt.failure ? { failure: attempt.failure } : {}),
        ...(attempt.status ? { status: attempt.status } : {}),
        ...(attempt.retryAfterMs ? { retryAfterMs: attempt.retryAfterMs } : {}),
        ...(attempt.message ? { message: attempt.message.slice(0, 200) } : {}),
      })),
    },
    latencyMs,
    engineLatencyMs: answer.usage.latencyMs,
    problems: [...answer.problems],
    versions: { ...answer.versions },
    retries,
  };
}

/**
 * A thrown error as a try's result. A failure whose attempts were all rate limits (HTTP 429 or
 * `rate_limited`) is retried after the wait the provider named; anything else is final.
 * The detail names the error and each attempt's failure, never the sentence.
 */
export function classifyFailure(error: unknown): Exclude<TryResult<never>, { ok: true }> {
  const attempts = (error as { attempts?: LlmAttempt[] } | null)?.attempts;
  const name = (error as { name?: string } | null)?.name || "Error";
  if (Array.isArray(attempts) && attempts.length > 0) {
    const trail = attempts.map((a) => `${a.slug}:${a.model}(${a.ok ? "ok" : a.failure ?? "?"}${a.status ? ` ${a.status}` : ""})`).join(" → ");
    const failed = attempts.filter((a) => !a.ok);
    const limited = failed.length > 0 && failed.length === attempts.length && failed.every((a) => a.failure === "rate_limited" || a.status === 429);
    if (limited) {
      const waits = failed.map((a) => a.retryAfterMs).filter((ms): ms is number => typeof ms === "number" && ms > 0);
      return { ok: false, rateLimited: true, retryAfterMs: waits.length ? Math.max(...waits) : undefined, detail: `${name}: ${trail}` };
    }
    return { ok: false, rateLimited: false, detail: `${name}: ${trail}` };
  }
  const message = (error as { message?: string } | null)?.message ?? String(error);
  return { ok: false, rateLimited: false, detail: `${name}: ${message.slice(0, 200)}` };
}

// ─── The loop ───────────────────────────────────────────────────────────────────

export const MAX_CONSECUTIVE_FAILURES = 5;

export interface LoopDeps {
  cases: readonly EvalCase[];
  /** Ids already finished: skipped. */
  done: ReadonlySet<string>;
  limiter: RateLimiter;
  sleep: Sleep;
  policy?: RetryPolicy;
  /** One try of one case. */
  attempt: (item: EvalCase, retries: number) => Promise<TryResult<CaseResult>>;
  onResult: (result: CaseResult) => void;
  onFailure: (failure: Omit<FailureRecord, "at">) => void;
  log: (line: string) => void;
  /** Checked before each case: true stops the run (Ctrl-C). */
  stopRequested?: () => boolean;
}

export interface LoopSummary {
  finished: number;
  failed: number;
  skipped: number;
  stopped: null | "consecutive_failures" | "quota" | "interrupted";
}

/** Strictly sequential: one case at a time, its retries included, before the next starts. */
export async function runCases(deps: LoopDeps): Promise<LoopSummary> {
  const summary: LoopSummary = { finished: 0, failed: 0, skipped: 0, stopped: null };
  let consecutive = 0;
  for (const item of deps.cases) {
    if (deps.done.has(item.id)) {
      summary.skipped += 1;
      continue;
    }
    if (deps.stopRequested?.()) {
      summary.stopped = "interrupted";
      break;
    }
    let tries = 0;
    const outcome = await runWithRetries(
      () => deps.attempt(item, tries++),
      deps.limiter,
      deps.sleep,
      deps.policy ?? DEFAULT_RETRY,
      (ms, retry) => deps.log(`${item.id} rate limited: waiting ${Math.round(ms / 1000)} s before retry ${retry}`),
    );
    if (outcome.status === "done") {
      consecutive = 0;
      summary.finished += 1;
      deps.onResult({ ...outcome.value, retries: outcome.retries });
      continue;
    }
    summary.failed += 1;
    consecutive += 1;
    deps.onFailure({ id: item.id, detail: outcome.detail, rateLimited: outcome.status === "quota" || outcome.rateLimited, retries: outcome.retries });
    if (outcome.status === "quota") {
      deps.log(`${item.id} the provider asks to wait ${Math.round(outcome.retryAfterMs / 60_000)} min: probably a daily quota. Stopping; resume later with --resume.`);
      summary.stopped = "quota";
      break;
    }
    deps.log(`${item.id} FAILED ${outcome.detail}`);
    if (consecutive >= MAX_CONSECUTIVE_FAILURES) {
      deps.log(`${MAX_CONSECUTIVE_FAILURES} cases in a row failed: stopping so the provider is not hammered. Resume later with --resume.`);
      summary.stopped = "consecutive_failures";
      break;
    }
  }
  return summary;
}

/** The ids a run covers, in set order: `--ids` first, then the first `--limit`. Unknown ids are a usage error. */
export function selectCases(cases: readonly EvalCase[], ids: string[] | null, limit: number | null): EvalCase[] {
  let picked = [...cases];
  if (ids) {
    const known = new Set(cases.map((item) => item.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length) throw new UsageError(`ids not in the set: ${unknown.join(", ")}`);
    const wanted = new Set(ids);
    picked = picked.filter((item) => wanted.has(item.id));
  }
  return limit ? picked.slice(0, limit) : picked;
}

/** Appends one JSON line, starting a new line first when a stopped run left the last one unfinished. */
export function appendLine(path: string, row: unknown): void {
  const needsBreak = existsSync(path) && (() => {
    const text = readFileSync(path, "utf8");
    return text.length > 0 && !text.endsWith("\n");
  })();
  appendFileSync(path, `${needsBreak ? "\n" : ""}${JSON.stringify(row)}\n`);
}

export function routeLabel(route: Pick<LlmRoute, "slug" | "model">): string {
  return `${route.slug}-${route.model}`.replace(/[^A-Za-z0-9._-]+/g, "_");
}

/** The latest run folder of this set and route, for `--resume` without `--out`. */
export function latestRunDir(root: string, setName: string, route: Pick<LlmRoute, "slug" | "model">): string | null {
  if (!existsSync(root)) return null;
  const prefix = `${setName}-${routeLabel(route)}-`;
  const names = readdirSync(root)
    .filter((name) => name.startsWith(prefix) && /^\d{8}-\d{4}$/.test(name.slice(prefix.length)))
    .sort();
  return names.length ? join(root, names[names.length - 1]) : null;
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main(argv: string[]): Promise<number> {
  const say = (line: string) => process.stdout.write(`${line}\n`);
  const refuse = (line: string) => {
    process.stderr.write(`eval:understand refused: ${line}\n`);
    return 2;
  };

  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    return refuse(`${(error as Error).message}\n\n${USAGE}`);
  }
  if (options.help) {
    say(USAGE);
    return 0;
  }

  let route: LlmRoute;
  let set: ReturnType<typeof loadSet>;
  let cases: EvalCase[];
  try {
    route = resolveRoute(process.env, options.route);
    set = loadSet(resolve(options.set));
    cases = selectCases(set.cases, options.ids, options.limit);
  } catch (error) {
    if (error instanceof UsageError || error instanceof InvalidSetError) return refuse(error.message);
    throw error;
  }
  set.warnings.forEach((warning) => say(`set warning: ${warning}`));

  prepareScriptEnv();
  const time = await import("../../lib/app-time");
  const { assembleContext } = await import("../../lib/understanding/reading-context");
  const { resetCircuitBreakers } = await import("../../lib/llm-router");
  const now = () => ({ day: time.businessDateKey(), weekday: WEEKDAYS[time.businessWeekday()] });

  let outDir: string;
  if (options.out) outDir = resolve(options.out);
  else if (options.resume) {
    const latest = latestRunDir(EVAL_ROOT, set.name, route);
    if (!latest) return refuse(`--resume found no earlier run of ${set.name} on ${route.slug}:${route.model} in ${relative(REPO_ROOT, EVAL_ROOT)}; pass --out`);
    outDir = latest;
  } else {
    const stamp = time.businessTimeLabel().replace(/[-:]/g, "").replace(" ", "-");
    outDir = join(EVAL_ROOT, `${set.name}-${routeLabel(route)}-${stamp}`);
  }

  const existing = readMeta(outDir);
  const done = options.resume ? finishedIds(outDir) : new Set<string>();
  if (!options.resume && existsSync(join(outDir, RESULTS_FILE))) {
    return refuse(`${outDir} already holds results; pass --resume to continue it or another --out`);
  }
  if (existing && (existing.route.slug !== route.slug || existing.route.model !== route.model || existing.setName !== set.name)) {
    return refuse(`${outDir} is a run of ${existing.setName} on ${existing.route.slug}:${existing.route.model}; a folder measures one set on one model`);
  }
  if (options.resume && existing && !options.ids && !options.limit) {
    // A resumed run covers what the run it continues covered, unless told otherwise.
    cases = selectCases(set.cases, existing.ids, existing.limit);
  }

  mkdirSync(outDir, { recursive: true });
  const meta: RunMeta = existing
    ? { ...existing, rpm: options.rpm, resumedAt: [...existing.resumedAt, new Date().toISOString()] }
    : {
        setName: set.name,
        setPath: relative(REPO_ROOT, resolve(options.set)),
        route: { slug: route.slug, model: route.model, protocol: route.protocol },
        rpm: options.rpm,
        strictPolicy: options.strictPolicy,
        settings: options.settings,
        limit: options.limit,
        ids: options.ids,
        startedAt: new Date().toISOString(),
        resumedAt: [],
      };
  writeFileSync(join(outDir, META_FILE), `${JSON.stringify(meta, null, 2)}\n`);

  const todo = cases.filter((item) => !done.has(item.id)).length;
  say(`Route: ${route.slug}:${route.model} (key from ${PROVIDERS.find((p) => p.slug === route.slug)!.envKey})`);
  say(`Set: ${set.name}, ${cases.length} cases selected, ${cases.length - todo} already done, ${todo} to run at ${options.rpm} rpm (about ${Math.ceil(todo / options.rpm)} min)`);
  say(`Out: ${outDir}`);

  let interrupted = false;
  process.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    say("Stopping after the current case (Ctrl-C again to quit now; finished cases are kept).");
  });

  const limiter = new RateLimiter(options.rpm);
  const settings = { ...meta.settings, ...options.settings };
  const summary = await runCases({
    cases,
    done,
    limiter,
    sleep: realSleep,
    stopRequested: () => interrupted,
    log: say,
    attempt: async (item, tries) => {
      // The harness paces the provider itself; a breaker opened by an earlier 429 would only skip the call.
      resetCircuitBreakers();
      const today = now();
      const startedAt = Date.now();
      try {
        const answer = await callEngine({
          text: item.text,
          context: caseContext(item, today, meta.strictPolicy, assembleContext),
          settings,
          routes: [route],
        });
        return { ok: true, value: toCaseResult(item, answer, today.day, Date.now() - startedAt, tries) };
      } catch (error) {
        return classifyFailure(error);
      }
    },
    onResult: (result) => {
      appendLine(join(outDir, RESULTS_FILE), result);
      say(`${result.id} ${result.outcome} ${result.events.length} event(s) ${result.latencyMs} ms${result.reasons.length ? ` [${result.reasons.join(", ")}]` : ""}`);
    },
    onFailure: (failure) => appendLine(join(outDir, FAILURES_FILE), { ...failure, at: new Date().toISOString() }),
  });

  const { path, aggregate } = writeReport(outDir);
  const g1 = aggregate.wrongAutoSave;
  say(
    `Done: ${summary.finished} finished, ${summary.failed} failed, ${summary.skipped} skipped${summary.stopped ? `, stopped (${summary.stopped})` : ""}. ` +
      `G1 ${g1.count}/${g1.of} unsafe saves · no extra tap ${aggregate.noExtraTap.count}/${aggregate.noExtraTap.of} · questions ${aggregate.question.count}/${aggregate.question.of}`,
  );
  say(`Report: ${path}`);
  return summary.stopped && summary.stopped !== "interrupted" ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`eval:understand failed: ${(error as Error)?.message ?? String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
