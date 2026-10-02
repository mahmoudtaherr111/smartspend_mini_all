/**
 * The coach evaluation: each case of scripts/voice-eval/corpus.ts, on a fresh synthetic user, through the real call
 * (CallSession, the brain and its tools, the app's procedures) and the real Gemini Live model, typed turn by turn.
 *
 *   npx tsx scripts/voice-eval/run.ts --arms coach:high,coach:medium,coach:low --reps 2 --split tuning
 *   npx tsx scripts/voice-eval/run.ts --cases consent-accept,debts-both-ways --arms coach:high
 *   npx tsx scripts/voice-eval/run.ts --cases budget-lower --arms coach-live --reps 3 --raw-text
 *
 * Arms: `ultra:<level>` (Ultra Thinking: the coach with its Ultra section on gemini-3.8-live-extended-thinking),
 * `coach:<level>` (the coach without it on the extended model), `coach-live` (the coach on gemini-3.8-live) or
 * `standard` (the standard call on gemini-3.8-live). For each case and repetition the arms run back to back in a shuffled
 * order, so provider load falls on all of them alike. Typed turns test understanding and tools, not the
 * microphone: no result here says anything about speech recognition or playback.
 *
 * It writes only to a database whose name ends in `_eval` (from VOICE_EVAL_DATABASE_URL, or DATABASE_URL with the
 * database renamed) and Redis database 7. Every run, failed and timed out ones included, is kept under
 * `.agents/smart-coach-20260929/eval/<run>/`, which git ignores: the users are fabricated, and no key is written.
 */
import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

dotenv.config();

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

const evalUrl =
  process.env.VOICE_EVAL_DATABASE_URL ??
  String(process.env.DATABASE_URL ?? "").replace(
    /\/([A-Za-z0-9_]+)(\?|$)/,
    (_m, name: string, tail: string) =>
      `/${name.endsWith("_eval") ? name : `${name}_eval`}${tail}`,
  );
const database = evalUrl.match(/\/([A-Za-z0-9_]+)(\?|$)/)?.[1] ?? "";
if (!database.endsWith("_eval")) {
  console.error(
    `Refusing to run: the database "${database}" is not an evaluation database (its name must end in _eval).`,
  );
  process.exit(1);
}
process.env.DATABASE_URL = evalUrl;
if (process.env.REDIS_URL) {
  const database = Number(arg("redis-db", "7"));
  if (!Number.isInteger(database) || database < 1 || database > 15)
    throw new Error("eval_redis_database_must_be_isolated");
  const redisUrl = new URL(process.env.REDIS_URL);
  redisUrl.pathname = `/${database}`;
  process.env.REDIS_URL = redisUrl.toString();
}

interface Arm {
  id: string;
  coach: boolean;
  model: string;
  level: "low" | "medium" | "high";
  /** Ultra Thinking: the coach's instructions with its Ultra section, on the extended model. */
  mode?: "standard" | "ultra";
  /** The shorter instruction candidate. */
  variant?: "lean";
}

function parseArms(spec: string): Arm[] {
  return spec
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      if (raw === "standard")
        return {
          id: raw,
          coach: false,
          model: "gemini-3.8-live",
          level: "low" as const,
        };
      // The coach's instructions and tools on the standard Live model: a comparison arm, not a setting anyone gets.
      if (raw === "coach-live")
        return {
          id: raw,
          coach: true,
          model: "gemini-3.8-live",
          level: "low" as const,
        };
      if (raw === "coach-lean")
        return {
          id: raw,
          coach: true,
          model: "gemini-3.8-live",
          level: "low" as const,
          variant: "lean" as const,
        };
      const [kind, level] = raw.split(":");
      if (level !== "low" && level !== "medium" && level !== "high")
        throw new Error(`unknown arm ${raw}`);
      if (kind === "ultra")
        return {
          id: raw,
          coach: true,
          model: "gemini-3.8-live-extended-thinking",
          level,
          mode: "ultra" as const,
        };
      if (kind !== "coach") throw new Error(`unknown arm ${raw}`);
      return {
        id: raw,
        coach: true,
        model: "gemini-3.8-live-extended-thinking",
        level,
      };
    });
}

/** A small seeded generator, so a run's order can be repeated. */
function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function shuffle<T>(items: T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

async function main(): Promise<void> {
  const arms = parseArms(arg("arms", "coach:high"));
  const reps = Math.max(1, Number(arg("reps", "1")));
  const split = arg("split", "tuning");
  if (!["tuning", "heldout", "all", "acceptance-v2"].includes(split)) throw new Error("unknown_split");
  const onlyCases = arg("cases", "").split(",").filter(Boolean);
  const seed = Number(arg("seed", String(Date.now() % 100_000)));
  const turnTimeoutMs = Number(arg("turn-timeout", "60000"));
  const pauseMs = Math.max(1500, Number(arg("pause-ms", "1500")) || 1500);

  // App modules read the environment when they load: imported only now.
  const [
    { SCENARIOS, universalChecks },
    fixtures,
    sessionModule,
    brainModule,
    engineModule,
    appCallsModule,
    routerModule,
    schema,
    drizzle,
    connection,
    settingsCache,
    envModule,
  ] = await Promise.all([
    import("./corpus"),
    import("./fixtures"),
    import("../../api/services/voice/gateway/call-session"),
    import("../../api/services/voice/brain"),
    import("../../api/services/voice/engine/gemini-live"),
    import("../../api/services/voice/app-calls"),
    import("../../api/router"),
    import("../../db/schema"),
    import("drizzle-orm"),
    import("../../api/queries/connection"),
    import("../../api/lib/settings-cache"),
    import("../../api/lib/env"),
  ]);
  type Scenario = (typeof SCENARIOS)[number];
  type CallTrace = import("./corpus").CallTrace;
  type TurnTrace = import("./corpus").TurnTrace;
  type ToolTrace = import("./corpus").ToolTrace;

  const availableScenarios = split === "acceptance-v2"
    ? (await import("./acceptance-v2")).ACCEPTANCE_V2 : SCENARIOS;
  const scenarios = availableScenarios.filter((scenario) =>
    onlyCases.length
      ? onlyCases.includes(scenario.id)
      : split === "all" || split === "acceptance-v2"
        ? true
        : split === "heldout"
          ? scenario.heldOut
          : !scenario.heldOut,
  );
  if (!scenarios.length) throw new Error("no cases selected");

  const settings = await settingsCache.getSystemSettings();
  const apiKeys = [
    settings.ai_api_key || envModule.env.GEMINI_API_KEY || "",
    settings.ai_api_key_2 || "",
  ].filter(Boolean);
  if (!apiKeys.length)
    throw new Error("no Gemini key in settings or GEMINI_API_KEY");
  const app = appCallsModule.createVoiceAppCalls(routerModule.appRouter);

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(".agents", "smart-coach-20260929", "eval", runId);
  mkdirSync(dir, { recursive: true });
  // Record revision and a content fingerprint without storing source, secrets,
  // environment values or provider keys. The same fingerprint is checked at end.
  const source = () => ({
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    diffSha256: createHash("sha256").update(execFileSync("git", [
      "diff", "--no-ext-diff", "HEAD", "--", "api", "contracts", "db", "scripts/voice-eval", "package.json", "package-lock.json",
      ":(exclude,glob)api/**/*.test.*", ":(exclude,glob)api/**/*.spec.*",
    ])).digest("hex"),
  });
  const startingSource = source();
  const next = random(seed);
  const plan = shuffle(
    scenarios.flatMap((scenario) =>
      Array.from({ length: reps }, (_, rep) => ({ scenario, rep })),
    ),
    next,
  ).flatMap((block) => shuffle(arms, next).map((arm) => ({ ...block, arm })));
  writeFileSync(
    join(dir, "plan.json"),
    JSON.stringify(
      {
        seed,
        arms,
        reps,
        split,
        source: startingSource,
        cases: scenarios.map((s) => s.id),
        order: plan.map((p) => `${p.scenario.id}#${p.rep}@${p.arm.id}`),
      },
      null,
      2,
    ),
  );
  console.log(
    `run ${runId}: ${plan.length} calls (${scenarios.length} cases × ${reps} × ${arms.length} arms), seed ${seed}`,
  );

  const results: Array<{
    scenario: Scenario;
    arm: Arm;
    rep: number;
    trace: CallTrace;
    checks: Array<{ id: string; means: string; pass: boolean }>;
    pass: boolean;
    endReason: string | null;
  }> = [];

  for (const [index, item] of plan.entries()) {
    const { scenario, arm, rep } = item;
    const user = await fixtures.createEvalUser(scenario.fixture);
    const { max: maxOf, eq: eqOf, and: andOf } = drizzle;
    // Rows the fixture made are not the call's writes: only ids above these count.
    const baseline = async (
      table: typeof schema.financialGoals | typeof schema.userBudgets,
    ) => {
      const [row] = await connection.db
        .select({ id: maxOf(table.id) })
        .from(table)
        .where(
          andOf(eqOf(table.userId, user.id), eqOf(table.userType, "local")),
        );
      return Number(row?.id ?? 0);
    };
    const goalsBefore = await baseline(schema.financialGoals);
    const budgetsBefore = await baseline(schema.userBudgets);
    const financialSnapshot = async () => {
      const tables = {
        expenses: schema.expenses,
        goals: schema.financialGoals,
        budgets: schema.userBudgets,
        commitments: schema.scheduledCashflows,
        settlements: schema.cashflowSettlements,
        plans: schema.coachingPlans,
        steps: schema.coachingSteps,
      };
      return Object.fromEntries(
        await Promise.all(
          Object.entries(tables).map(async ([name, table]) => [
            name,
            await connection.db
              .select()
              .from(table)
              .where(
                andOf(
                  eqOf(table.userId, user.id),
                  eqOf(table.userType, "local"),
                ),
              ),
          ]),
        ),
      ) as Record<string, Array<Record<string, unknown>>>;
    };
    const beforeFinancial = await financialSnapshot();
    const raw: Array<Record<string, unknown>> = [];
    const identity = {
      callId: `vc_eval${Math.random().toString(36).slice(2, 14)}`,
      userId: user.id,
      userType: "local" as const,
      plan: "ultra",
      role: "user",
    };
    const events: Array<{ at: number; message: Record<string, unknown> }> = [];
    const audioAt: number[] = [];
    /** Each chunk of the assistant's voice: when it arrived and how long it plays (24 kHz, 16-bit: 48 bytes a ms). */
    const audioChunks: Array<{ at: number; ms: number }> = [];
    const toolEnds: number[] = [];
    const incidents: string[] = [];
    let final: { costUsd?: number; tokens?: unknown } = {};
    let toolLog: ToolTrace[] = [];
    const inner = brainModule.createCallBrain({ app });
    const brain = {
      ...inner,
      async runTool(
        call: { id: string; name: string; args: Record<string, unknown> },
        context: Parameters<typeof inner.runTool>[1],
      ) {
        const startedAt = Date.now();
        try {
          const outcome = await inner.runTool(call, context);
          toolLog.push({
            name: call.name,
            args: call.args,
            ok: outcome.response.ok !== false,
            error:
              typeof outcome.response.error === "string"
                ? outcome.response.error
                : undefined,
            ms: Date.now() - startedAt,
          });
          toolEnds.push(Date.now());
          return outcome;
        } catch (error) {
          toolLog.push({
            name: call.name,
            args: call.args,
            ok: false,
            error:
              error instanceof Error ? error.message.slice(0, 60) : "thrown",
            ms: Date.now() - startedAt,
          });
          toolEnds.push(Date.now());
          throw error;
        }
      },
    };
    const state = new Map<string, unknown>();
    let open = true;
    const channel = {
      get open() {
        return open;
      },
      sendJson: (message: Record<string, unknown>) => {
        events.push({ at: Date.now(), message });
      },
      sendAudio: (pcm: Buffer) => {
        audioAt.push(Date.now());
        audioChunks.push({ at: Date.now(), ms: pcm.length / 48 });
      },
      close: () => {
        open = false;
      },
    };
    const session = new sessionModule.CallSession(
      identity,
      {
        model: arm.model,
        voiceName: "Kore",
        thinkingLevel: arm.level,
        coach: arm.coach,
        maxSeconds: 900,
        costBudgetUsd: null,
        client: "web",
        mode: arm.mode ?? "standard",
        instructionVariant: arm.variant,
        modes:
          arm.mode === "ultra"
            ? {
                standard: { model: "gemini-3.8-live", thinkingLevel: "low" },
                ultra: { model: arm.model, thinkingLevel: arm.level },
              }
            : undefined,
      },
      {
        createEngine: () => {
          const engine = new engineModule.GeminiLiveEngine({ apiKeys });
          // What the provider sent, as shapes: which parts, tool names, status, errors — never audio or text.
          const handle = (
            engine as unknown as {
              handleMessage(message: Record<string, unknown>): void;
            }
          ).handleMessage.bind(engine);
          (
            engine as unknown as {
              handleMessage(message: Record<string, unknown>): void;
            }
          ).handleMessage = (message) => {
            raw.push(shape(message, started));
            handle(message);
          };
          return engine;
        },
        brain,
        persistence: {
          async markLive() {},
          async checkpoint() {},
          async finalize(_id, value) {
            final = value as typeof final;
          },
          async incident(_call, kind) {
            incidents.push(kind);
          },
        },
        saveState: async (id, value) => {
          state.set(id, value);
        },
        loadState: async (id) => (state.get(id) as never) ?? null,
        deleteState: async (id) => {
          state.delete(id);
        },
        saveTranscript: async () => undefined,
      },
    );

    const lastState = () =>
      [...events].reverse().find((event) => event.message.type === "state")
        ?.message.state as string | undefined;
    const lastActivity = () =>
      Math.max(events.at(-1)?.at ?? 0, audioAt.at(-1) ?? 0);
    /** Waits until the call listens again after `since` and has been quiet for a moment, or gives up. */
    const settled = async (
      since: number,
      timeoutMs: number,
    ): Promise<{ timedOut: boolean; doneAt: number | null }> => {
      for (;;) {
        const now = Date.now();
        const back = events.some(
          (event) =>
            event.at > since &&
            event.message.type === "state" &&
            (event.message.state === "listening" ||
              event.message.state === "awaiting_confirmation"),
        );
        const ended = events.some((event) => event.message.type === "ended");
        if (ended) return { timedOut: false, doneAt: now };
        if (
          back &&
          ["listening", "awaiting_confirmation"].includes(lastState() ?? "") &&
          now - lastActivity() > 1_500
        ) {
          return { timedOut: false, doneAt: lastActivity() };
        }
        if (now - since > timeoutMs) return { timedOut: true, doneAt: null };
        await sleep(100);
      }
    };

    const turns: TurnTrace[] = [];
    let endReason: string | null = null;
    const started = Date.now();
    await session.attach(channel, false);
    const connectError = events.find(
      (event) => event.message.type === "error",
    )?.message;
    const providerErrors = connectError ? [String(connectError.code)] : [];
    if (!connectError) await settled(started, turnTimeoutMs);
    for (const text of connectError ? [] : scenario.turns) {
      toolLog = [];
      const since = Date.now();
      await session.onClientMessage({ type: "text", text });
      const { timedOut, doneAt } = await settled(since, turnTimeoutMs);
      const after = events.filter((event) => event.at >= since);
      const lastToolEnd = toolEnds.filter((at) => at >= since).at(-1) ?? null;
      const turnChunks = audioChunks.filter((chunk) => chunk.at >= since);
      // Played back to back from arrival: a chunk starts when it arrives or when the one before it ends.
      const playbackEnd = turnChunks.reduce<number | null>(
        (end, chunk) => Math.max(end ?? 0, chunk.at) + chunk.ms,
        null,
      );
      const assistantWords = after
        .filter(
          (e) => e.message.type === "caption" && e.message.role === "assistant",
        )
        .map((e) => String(e.message.text))
        .join("");
      turns.push({
        user: text,
        assistant: assistantWords,
        heard: assistantWords,
        tools: toolLog,
        cards: after
          .filter((e) => e.message.type === "card")
          .map((e) => e.message.card as Record<string, unknown>),
        firstAudioMs: (() => {
          const first = audioAt.find((at) => at >= since);
          return first ? first - since : null;
        })(),
        toolsDoneMs: lastToolEnd === null ? null : lastToolEnd - since,
        answerAudioMs: (() => {
          if (lastToolEnd === null) return null;
          const first = audioAt.find((at) => at >= lastToolEnd);
          return first ? first - since : null;
        })(),
        doneMs: doneAt ? doneAt - since : null,
        playbackEndMs:
          playbackEnd === null ? null : Math.round(playbackEnd - since),
        timedOut,
      });
      if (events.some((event) => event.message.type === "ended")) break;
    }
    const endedEvent = events.find(
      (event) => event.message.type === "ended",
    )?.message;
    if (endedEvent) {
      endReason = String(endedEvent.reason);
      if (endReason === "provider") providerErrors.push("provider_closed");
    } else {
      await session.end("user");
      endReason = "user";
    }

    const { and, eq, gt, sql } = drizzle;
    const written = await connection.db
      .select({
        amount: schema.expenses.amount,
        category: schema.expenses.category,
        type: schema.expenses.type,
      })
      .from(schema.expenses)
      .where(
        and(
          eq(schema.expenses.userId, user.id),
          eq(schema.expenses.userType, "local"),
          eq(schema.expenses.source, "voice"),
        ),
      );
    const count = async (
      table: typeof schema.financialGoals | typeof schema.userBudgets,
      above: number,
    ) => {
      const [row] = await connection.db
        .select({ n: sql<number>`COUNT(*)` })
        .from(table)
        .where(
          and(
            eq(table.userId, user.id),
            eq(table.userType, "local"),
            gt(table.id, above),
          ),
        );
      return Number(row?.n ?? 0);
    };
    const budgetStates = await connection.db
      .select({
        title: schema.userBudgets.title,
        limit: schema.userBudgets.monthlyLimit,
        status: schema.userBudgets.status,
      })
      .from(schema.userBudgets)
      .where(
        and(
          eq(schema.userBudgets.userId, user.id),
          eq(schema.userBudgets.userType, "local"),
        ),
      );
    const cashflows = await connection.db
      .select({
        kind: schema.scheduledCashflows.kind,
        direction: schema.scheduledCashflows.direction,
        amount: schema.scheduledCashflows.amount,
        startDay: schema.scheduledCashflows.startDay,
      })
      .from(schema.scheduledCashflows)
      .where(
        and(
          eq(schema.scheduledCashflows.userId, user.id),
          eq(schema.scheduledCashflows.userType, "local"),
        ),
      );
    const trace: CallTrace = {
      turns,
      incidents,
      writes: {
        expenses: written.map((row) => ({
          amount: Number(row.amount),
          category: row.category,
          type: row.type,
        })),
        goals: await count(schema.financialGoals, goalsBefore),
        budgets: await count(schema.userBudgets, budgetsBefore),
        budgetStates: budgetStates.map((budget) => ({
          title: budget.title,
          limit: Number(budget.limit),
          status: String(budget.status),
        })),
        cashflows: cashflows.map((flow) => ({
          kind: String(flow.kind),
          direction: String(flow.direction),
          amount: flow.amount === null ? null : Number(flow.amount),
          startDay: flow.startDay ? String(flow.startDay).slice(0, 10) : null,
        })),
      },
      costUsd: Number(final.costUsd ?? 0),
      tokens: final.tokens ?? null,
      providerErrors,
      mutations: (await import("./corpus")).financialMutationDiff(
        beforeFinancial,
        await financialSnapshot(),
      ),
    };
    const checks = [...scenario.checks, ...universalChecks(scenario)].map(
      (check) => ({
        id: check.id,
        means: check.means,
        pass: safe(() => check.test(trace)),
      }),
    );
    const pass =
      providerErrors.length === 0 && checks.every((check) => check.pass);
    results.push({ scenario, arm, rep, trace, checks, pass, endReason });
    writeFileSync(
      join(
        dir,
        `${String(index + 1).padStart(3, "0")}-${scenario.id}-${arm.id.replace(":", "-")}-r${rep}.json`,
      ),
      JSON.stringify(
        {
          scenario: scenario.id,
          domain: scenario.domain,
          heldOut: Boolean(scenario.heldOut),
          arm,
          rep,
          pass,
          endReason,
          checks,
          trace,
          raw,
        },
        null,
        2,
      ),
    );
    const failed = checks
      .filter((check) => !check.pass)
      .map((check) => check.id);
    console.log(
      `${index + 1}/${plan.length} ${scenario.id} ${arm.id} r${rep}: ${pass ? "PASS" : "FAIL"}${providerErrors.length ? ` provider:${providerErrors.join(",")}` : ""}${failed.length ? ` [${failed.join(" | ")}]` : ""} $${trace.costUsd.toFixed(4)}`,
    );
    await fixtures.removeEvalUsers([user.id]).catch(() => undefined);
    await sleep(pauseMs);
  }

  // ─── Summary ───
  const byArm = arms.map((arm) => {
    const runs = results.filter((result) => result.arm.id === arm.id);
    // Every attempt counts: a provider failure is a failed call for the user. The rate without them is shown apart.
    const valid = runs.filter((run) => run.trace.providerErrors.length === 0);
    const passed = runs.filter((run) => run.pass);
    const turns = runs.flatMap((run) => run.trace.turns);
    const domains = [...new Set(runs.map((run) => run.scenario.domain))].map(
      (domain) => {
        const inDomain = runs.filter((run) => run.scenario.domain === domain);
        return {
          domain,
          runs: inDomain.length,
          passed: inDomain.filter((run) => run.pass).length,
        };
      },
    );
    const cost = runs.reduce((sum, run) => sum + run.trace.costUsd, 0);
    const spread = (pick: (turn: TurnTrace) => number | null | undefined) => {
      const values = turns.flatMap((turn) => {
        const v = pick(turn);
        return typeof v === "number" ? [v] : [];
      });
      return {
        n: values.length,
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
      };
    };
    const [low, high] = wilson(passed.length, runs.length);
    return {
      arm: arm.id,
      runs: runs.length,
      providerFailures: runs.length - valid.length,
      passed: passed.length,
      passRate: runs.length ? passed.length / runs.length : null,
      passRateCi95: [low, high],
      passRateWithoutProviderFailures: valid.length
        ? valid.filter((run) => run.pass).length / valid.length
        : null,
      domains,
      timedOutTurns: turns.filter((turn) => turn.timedOut).length,
      firstAudioMs: spread((t) => t.firstAudioMs),
      toolsDoneMs: spread((t) => t.toolsDoneMs),
      answerAudioMs: spread((t) => t.answerAudioMs),
      doneMs: spread((t) => t.doneMs),
      playbackEndMs: spread((t) => t.playbackEndMs),
      costUsd: cost,
      costPerPassUsd: passed.length ? cost / passed.length : null,
      failedChecks: Object.entries(
        runs
          .flatMap((run) =>
            run.checks.filter((c) => !c.pass).map((c) => c.id.split(":")[0]),
          )
          .reduce<
            Record<string, number>
          >((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {}),
      ),
      incidents: Object.entries(
        runs
          .flatMap((run) => run.trace.incidents)
          .reduce<
            Record<string, number>
          >((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {}),
      ),
    };
  });
  const endingSource = source();
  writeFileSync(
    join(dir, "summary.json"),
    JSON.stringify({ runId, seed, split, reps, byArm, source: startingSource,
      sourceAtEnd: endingSource, sourceUnchanged: JSON.stringify(startingSource) === JSON.stringify(endingSource) }, null, 2),
  );
  const lines = [
    `# Coach evaluation ${runId}`,
    "",
    `Seed ${seed}, split ${split}, ${reps} repetition(s). Typed turns: understanding and tools only.`,
    "",
  ];
  for (const arm of byArm) {
    lines.push(
      `## ${arm.arm}`,
      "",
      `- Passed ${arm.passed}/${arm.runs} of all attempts (${arm.passRate === null ? "—" : `${Math.round(arm.passRate * 100)}%`}, 95% CI ${Math.round(arm.passRateCi95[0] * 100)}–${Math.round(arm.passRateCi95[1] * 100)}%); without the ${arm.providerFailures} provider failure(s): ${arm.passRateWithoutProviderFailures === null ? "—" : `${Math.round(arm.passRateWithoutProviderFailures * 100)}%`}; timed-out turns ${arm.timedOutTurns}`,
      `- Per turn p50/p95 ms — first audio ${arm.firstAudioMs.p50 ?? "—"}/${arm.firstAudioMs.p95 ?? "—"}; tools done ${arm.toolsDoneMs.p50 ?? "—"}/${arm.toolsDoneMs.p95 ?? "—"}; answer audio ${arm.answerAudioMs.p50 ?? "—"}/${arm.answerAudioMs.p95 ?? "—"}; listening again ${arm.doneMs.p50 ?? "—"}/${arm.doneMs.p95 ?? "—"}; heard to the end ${arm.playbackEndMs.p50 ?? "—"}/${arm.playbackEndMs.p95 ?? "—"}`,
      `- Paid-rate estimate (not a bill) $${arm.costUsd.toFixed(4)}; per passed case ${arm.costPerPassUsd === null ? "—" : `$${arm.costPerPassUsd.toFixed(4)}`}`,
      `- By domain: ${arm.domains.map((d) => `${d.domain} ${d.passed}/${d.runs}`).join(", ")}`,
      `- Failed checks: ${arm.failedChecks.map(([id, n]) => `${id}×${n}`).join(", ") || "none"}`,
      `- Incidents: ${arm.incidents.map(([id, n]) => `${id}×${n}`).join(", ") || "none"}`,
      "",
    );
  }
  writeFileSync(join(dir, "summary.md"), lines.join("\n"));
  console.log(`\n${lines.join("\n")}\nTraces: ${dir}`);
  await connection.db.$client?.end?.().catch?.(() => undefined);
  process.exit(0);
}

/**
 * `--raw-text`: also keep the assistant's transcription chunks as they arrived, with turnComplete and
 * generationComplete, to see how text lines up with the end of a turn. The users are synthetic; still off by default.
 */
const RAW_TEXT = process.argv.includes("--raw-text");

/** A provider message reduced to its shape and timing. */
function shape(
  message: Record<string, unknown>,
  started: number,
): Record<string, unknown> {
  const content = (message.serverContent ?? {}) as Record<string, unknown>;
  const transcript = (content.outputTranscription as { text?: string } | undefined)?.text;
  const parts =
    (
      content.modelTurn as
        | { parts?: Array<Record<string, unknown>> }
        | undefined
    )?.parts ?? [];
  const calls =
    (
      message.toolCall as
        | { functionCalls?: Array<{ name?: string; args?: unknown }> }
        | undefined
    )?.functionCalls ?? [];
  return {
    t: Date.now() - started,
    keys: Object.keys(message),
    ...(Object.keys(content).length ? { content: Object.keys(content) } : {}),
    ...(parts.length
      ? { parts: parts.map((part) => Object.keys(part).join("+")) }
      : {}),
    ...(calls.length
      ? { calls: calls.map((call) => ({ name: call.name, args: call.args })) }
      : {}),
    ...(RAW_TEXT && typeof transcript === "string" ? { out: transcript } : {}),
    ...(RAW_TEXT && content.turnComplete ? { turnComplete: true } : {}),
    ...(RAW_TEXT && content.generationComplete ? { generationComplete: true } : {}),
    ...(RAW_TEXT && content.interrupted ? { interrupted: true } : {}),
    ...(message.interactionStatus ? { status: message.interactionStatus } : {}),
    ...(content.interactionStatus ? { status: content.interactionStatus } : {}),
    ...(message.error ? { error: message.error } : {}),
    ...(message.goAway ? { goAway: message.goAway } : {}),
    ...(message.toolCallCancellation
      ? { cancelled: message.toolCallCancellation }
      : {}),
    ...(parts.some((part) => part.thought) ? { thought: true } : {}),
  };
}

/** Wilson 95% interval of a pass rate. */
function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

function safe(test: () => boolean): boolean {
  try {
    return test();
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
