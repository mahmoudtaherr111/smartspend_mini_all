/**
 * The coach evaluation: each case of scripts/voice-eval/corpus.ts, on a fresh synthetic user, through the real call
 * (CallSession, the brain and its tools, the app's procedures) and the real Gemini Live model, typed turn by turn.
 *
 *   npx tsx scripts/voice-eval/run.ts --arms coach:high,coach:medium,coach:low --reps 2 --split tuning
 *   npx tsx scripts/voice-eval/run.ts --cases consent-accept,debts-both-ways --arms coach:high
 *
 * Arms: `coach:<level>` (the coach's instructions and tools on gemini-3.8-live-extended-thinking), `coach-live` (the
 * same on gemini-3.8-live, for comparison) or `standard` (the standard call on gemini-3.8-live). For each case and repetition the arms run back to back in a shuffled
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

dotenv.config();

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const evalUrl = process.env.VOICE_EVAL_DATABASE_URL
  ?? String(process.env.DATABASE_URL ?? "").replace(/\/([A-Za-z0-9_]+)(\?|$)/, (_m, name: string, tail: string) => `/${name.endsWith("_eval") ? name : `${name}_eval`}${tail}`);
const database = evalUrl.match(/\/([A-Za-z0-9_]+)(\?|$)/)?.[1] ?? "";
if (!database.endsWith("_eval")) {
  console.error(`Refusing to run: the database "${database}" is not an evaluation database (its name must end in _eval).`);
  process.exit(1);
}
process.env.DATABASE_URL = evalUrl;
if (process.env.REDIS_URL) process.env.REDIS_URL = process.env.REDIS_URL.replace(/(\/\d+)?$/, "/7");

interface Arm {
  id: string;
  coach: boolean;
  model: string;
  level: "low" | "medium" | "high";
}

function parseArms(spec: string): Arm[] {
  return spec.split(",").map((raw) => raw.trim()).filter(Boolean).map((raw) => {
    if (raw === "standard") return { id: raw, coach: false, model: "gemini-3.8-live", level: "low" as const };
    // The coach's instructions and tools on the standard Live model: a comparison arm, not a setting anyone gets.
    if (raw === "coach-live") return { id: raw, coach: true, model: "gemini-3.8-live", level: "low" as const };
    const level = raw.split(":")[1];
    if (level !== "low" && level !== "medium" && level !== "high") throw new Error(`unknown arm ${raw}`);
    return { id: raw, coach: true, model: "gemini-3.8-live-extended-thinking", level };
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
  const onlyCases = arg("cases", "").split(",").filter(Boolean);
  const seed = Number(arg("seed", String(Date.now() % 100_000)));
  const turnTimeoutMs = Number(arg("turn-timeout", "60000"));

  // App modules read the environment when they load: imported only now.
  const [{ SCENARIOS, universalChecks }, fixtures, sessionModule, brainModule, engineModule, appCallsModule, routerModule, schema, drizzle, connection, settingsCache, envModule] =
    await Promise.all([
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

  const scenarios = SCENARIOS.filter((scenario) =>
    onlyCases.length ? onlyCases.includes(scenario.id) : split === "all" ? true : split === "heldout" ? scenario.heldOut : !scenario.heldOut);
  if (!scenarios.length) throw new Error("no cases selected");

  const settings = await settingsCache.getSystemSettings();
  const apiKeys = [settings.ai_api_key || envModule.env.GEMINI_API_KEY || "", settings.ai_api_key_2 || ""].filter(Boolean);
  if (!apiKeys.length) throw new Error("no Gemini key in settings or GEMINI_API_KEY");
  const app = appCallsModule.createVoiceAppCalls(routerModule.appRouter);

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(".agents", "smart-coach-20260929", "eval", runId);
  mkdirSync(dir, { recursive: true });
  const next = random(seed);
  const plan = shuffle(
    scenarios.flatMap((scenario) => Array.from({ length: reps }, (_, rep) => ({ scenario, rep }))),
    next,
  ).flatMap((block) => shuffle(arms, next).map((arm) => ({ ...block, arm })));
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ seed, arms, reps, split, cases: scenarios.map((s) => s.id), order: plan.map((p) => `${p.scenario.id}#${p.rep}@${p.arm.id}`) }, null, 2));
  console.log(`run ${runId}: ${plan.length} calls (${scenarios.length} cases × ${reps} × ${arms.length} arms), seed ${seed}`);

  const results: Array<{ scenario: Scenario; arm: Arm; rep: number; trace: CallTrace; checks: Array<{ id: string; means: string; pass: boolean }>; pass: boolean; endReason: string | null }> = [];

  for (const [index, item] of plan.entries()) {
    const { scenario, arm, rep } = item;
    const user = await fixtures.createEvalUser(scenario.fixture);
    const { max: maxOf, eq: eqOf, and: andOf } = drizzle;
    // Rows the fixture made are not the call's writes: only ids above these count.
    const baseline = async (table: typeof schema.financialGoals | typeof schema.userBudgets) => {
      const [row] = await connection.db.select({ id: maxOf(table.id) }).from(table)
        .where(andOf(eqOf(table.userId, user.id), eqOf(table.userType, "local")));
      return Number(row?.id ?? 0);
    };
    const goalsBefore = await baseline(schema.financialGoals);
    const budgetsBefore = await baseline(schema.userBudgets);
    const raw: Array<Record<string, unknown>> = [];
    const identity = { callId: `vc_eval${Math.random().toString(36).slice(2, 14)}`, userId: user.id, userType: "local" as const, plan: "ultra", role: "user" };
    const events: Array<{ at: number; message: Record<string, unknown> }> = [];
    const audioAt: number[] = [];
    const incidents: string[] = [];
    let final: { costUsd?: number; tokens?: unknown } = {};
    let toolLog: ToolTrace[] = [];
    const inner = brainModule.createCallBrain({ app });
    const brain = {
      ...inner,
      async runTool(call: { id: string; name: string; args: Record<string, unknown> }, context: Parameters<typeof inner.runTool>[1]) {
        const startedAt = Date.now();
        try {
          const outcome = await inner.runTool(call, context);
          toolLog.push({ name: call.name, args: call.args, ok: outcome.response.ok !== false, error: typeof outcome.response.error === "string" ? outcome.response.error : undefined, ms: Date.now() - startedAt });
          return outcome;
        } catch (error) {
          toolLog.push({ name: call.name, args: call.args, ok: false, error: error instanceof Error ? error.message.slice(0, 60) : "thrown", ms: Date.now() - startedAt });
          throw error;
        }
      },
    };
    const state = new Map<string, unknown>();
    let open = true;
    const channel = {
      get open() { return open; },
      sendJson: (message: Record<string, unknown>) => { events.push({ at: Date.now(), message }); },
      sendAudio: () => { audioAt.push(Date.now()); },
      close: () => { open = false; },
    };
    const session = new sessionModule.CallSession(identity, {
      model: arm.model, voiceName: "Kore", thinkingLevel: arm.level, coach: arm.coach, maxSeconds: 900, costBudgetUsd: null, client: "web",
    }, {
      createEngine: () => {
        const engine = new engineModule.GeminiLiveEngine({ apiKeys });
        // What the provider sent, as shapes: which parts, tool names, status, errors — never audio or text.
        const handle = (engine as unknown as { handleMessage(message: Record<string, unknown>): void }).handleMessage.bind(engine);
        (engine as unknown as { handleMessage(message: Record<string, unknown>): void }).handleMessage = (message) => {
          raw.push(shape(message, started));
          handle(message);
        };
        return engine;
      },
      brain,
      persistence: {
        async markLive() {},
        async checkpoint() {},
        async finalize(_id, value) { final = value as typeof final; },
        async incident(_call, kind) { incidents.push(kind); },
      },
      saveState: async (id, value) => { state.set(id, value); },
      loadState: async (id) => (state.get(id) as never) ?? null,
      deleteState: async (id) => { state.delete(id); },
      saveTranscript: async () => undefined,
    });

    const lastState = () => [...events].reverse().find((event) => event.message.type === "state")?.message.state as string | undefined;
    const lastActivity = () => Math.max(events.at(-1)?.at ?? 0, audioAt.at(-1) ?? 0);
    /** Waits until the call listens again after `since` and has been quiet for a moment, or gives up. */
    const settled = async (since: number, timeoutMs: number): Promise<{ timedOut: boolean; doneAt: number | null }> => {
      for (;;) {
        const now = Date.now();
        const back = events.some((event) => event.at > since && event.message.type === "state"
          && (event.message.state === "listening" || event.message.state === "awaiting_confirmation"));
        const ended = events.some((event) => event.message.type === "ended");
        if (ended) return { timedOut: false, doneAt: now };
        if (back && ["listening", "awaiting_confirmation"].includes(lastState() ?? "") && now - lastActivity() > 1_500) {
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
    const connectError = events.find((event) => event.message.type === "error")?.message;
    const providerErrors = connectError ? [String(connectError.code)] : [];
    if (!connectError) await settled(started, turnTimeoutMs);
    for (const text of connectError ? [] : scenario.turns) {
      toolLog = [];
      const since = Date.now();
      await session.onClientMessage({ type: "text", text });
      const { timedOut, doneAt } = await settled(since, turnTimeoutMs);
      const after = events.filter((event) => event.at >= since);
      turns.push({
        user: text,
        assistant: after.filter((e) => e.message.type === "caption" && e.message.role === "assistant").map((e) => String(e.message.text)).join(""),
        tools: toolLog,
        cards: after.filter((e) => e.message.type === "card").map((e) => e.message.card as Record<string, unknown>),
        firstAudioMs: (() => { const first = audioAt.find((at) => at >= since); return first ? first - since : null; })(),
        doneMs: doneAt ? doneAt - since : null,
        timedOut,
      });
      if (events.some((event) => event.message.type === "ended")) break;
    }
    const endedEvent = events.find((event) => event.message.type === "ended")?.message;
    if (endedEvent) {
      endReason = String(endedEvent.reason);
      if (endReason === "provider") providerErrors.push("provider_closed");
    } else {
      await session.end("user");
      endReason = "user";
    }

    const { and, eq, gt, sql } = drizzle;
    const written = await connection.db
      .select({ amount: schema.expenses.amount, category: schema.expenses.category, type: schema.expenses.type })
      .from(schema.expenses)
      .where(and(eq(schema.expenses.userId, user.id), eq(schema.expenses.userType, "local"), eq(schema.expenses.source, "voice")));
    const count = async (table: typeof schema.financialGoals | typeof schema.userBudgets, above: number) => {
      const [row] = await connection.db.select({ n: sql<number>`COUNT(*)` }).from(table)
        .where(and(eq(table.userId, user.id), eq(table.userType, "local"), gt(table.id, above)));
      return Number(row?.n ?? 0);
    };
    const trace: CallTrace = {
      turns,
      incidents,
      writes: {
        expenses: written.map((row) => ({ amount: Number(row.amount), category: row.category, type: row.type })),
        goals: await count(schema.financialGoals, goalsBefore),
        budgets: await count(schema.userBudgets, budgetsBefore),
      },
      costUsd: Number(final.costUsd ?? 0),
      tokens: final.tokens ?? null,
      providerErrors,
    };
    const checks = [...scenario.checks, ...universalChecks(scenario)].map((check) => ({ id: check.id, means: check.means, pass: safe(() => check.test(trace)) }));
    const pass = providerErrors.length === 0 && checks.every((check) => check.pass);
    results.push({ scenario, arm, rep, trace, checks, pass, endReason });
    writeFileSync(join(dir, `${String(index + 1).padStart(3, "0")}-${scenario.id}-${arm.id.replace(":", "-")}-r${rep}.json`),
      JSON.stringify({ scenario: scenario.id, domain: scenario.domain, heldOut: Boolean(scenario.heldOut), arm, rep, pass, endReason, checks, trace, raw }, null, 2));
    const failed = checks.filter((check) => !check.pass).map((check) => check.id);
    console.log(`${index + 1}/${plan.length} ${scenario.id} ${arm.id} r${rep}: ${pass ? "PASS" : "FAIL"}${providerErrors.length ? ` provider:${providerErrors.join(",")}` : ""}${failed.length ? ` [${failed.join(" | ")}]` : ""} $${trace.costUsd.toFixed(4)}`);
    await fixtures.removeEvalUsers([user.id]).catch(() => undefined);
    await sleep(1_500);
  }

  // ─── Summary ───
  const byArm = arms.map((arm) => {
    const runs = results.filter((result) => result.arm.id === arm.id);
    const valid = runs.filter((run) => run.trace.providerErrors.length === 0);
    const passed = valid.filter((run) => run.pass);
    const turns = valid.flatMap((run) => run.trace.turns);
    const domains = [...new Set(runs.map((run) => run.scenario.domain))].map((domain) => {
      const inDomain = valid.filter((run) => run.scenario.domain === domain);
      return { domain, runs: inDomain.length, passed: inDomain.filter((run) => run.pass).length };
    });
    const cost = valid.reduce((sum, run) => sum + run.trace.costUsd, 0);
    return {
      arm: arm.id,
      runs: runs.length,
      providerFailures: runs.length - valid.length,
      passed: passed.length,
      passRate: valid.length ? passed.length / valid.length : null,
      domains,
      timedOutTurns: turns.filter((turn) => turn.timedOut).length,
      firstAudioMs: { p50: percentile(turns.flatMap((t) => (t.firstAudioMs === null ? [] : [t.firstAudioMs])), 0.5), p95: percentile(turns.flatMap((t) => (t.firstAudioMs === null ? [] : [t.firstAudioMs])), 0.95) },
      doneMs: { p50: percentile(turns.flatMap((t) => (t.doneMs === null ? [] : [t.doneMs])), 0.5), p95: percentile(turns.flatMap((t) => (t.doneMs === null ? [] : [t.doneMs])), 0.95) },
      costUsd: cost,
      costPerPassUsd: passed.length ? cost / passed.length : null,
      failedChecks: Object.entries(valid.flatMap((run) => run.checks.filter((c) => !c.pass).map((c) => c.id.split(":")[0]))
        .reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {})),
    };
  });
  writeFileSync(join(dir, "summary.json"), JSON.stringify({ runId, seed, split, reps, byArm }, null, 2));
  const lines = [`# Coach evaluation ${runId}`, "", `Seed ${seed}, split ${split}, ${reps} repetition(s). Typed turns: understanding and tools only.`, ""];
  for (const arm of byArm) {
    lines.push(`## ${arm.arm}`, "",
      `- Passed ${arm.passed}/${arm.runs - arm.providerFailures} (${arm.passRate === null ? "—" : `${Math.round(arm.passRate * 100)}%`}); provider failures ${arm.providerFailures}; timed-out turns ${arm.timedOutTurns}`,
      `- First audio p50/p95: ${arm.firstAudioMs.p50 ?? "—"} / ${arm.firstAudioMs.p95 ?? "—"} ms; turn done p50/p95: ${arm.doneMs.p50 ?? "—"} / ${arm.doneMs.p95 ?? "—"} ms`,
      `- Cost $${arm.costUsd.toFixed(4)}; per passed case ${arm.costPerPassUsd === null ? "—" : `$${arm.costPerPassUsd.toFixed(4)}`}`,
      `- By domain: ${arm.domains.map((d) => `${d.domain} ${d.passed}/${d.runs}`).join(", ")}`,
      `- Failed checks: ${arm.failedChecks.map(([id, n]) => `${id}×${n}`).join(", ") || "none"}`, "");
  }
  writeFileSync(join(dir, "summary.md"), lines.join("\n"));
  console.log(`\n${lines.join("\n")}\nTraces: ${dir}`);
  await connection.db.$client?.end?.().catch?.(() => undefined);
  process.exit(0);
}

/** A provider message reduced to its shape and timing. */
function shape(message: Record<string, unknown>, started: number): Record<string, unknown> {
  const content = (message.serverContent ?? {}) as Record<string, unknown>;
  const parts = ((content.modelTurn as { parts?: Array<Record<string, unknown>> } | undefined)?.parts ?? []);
  const calls = ((message.toolCall as { functionCalls?: Array<{ name?: string; args?: unknown }> } | undefined)?.functionCalls ?? []);
  return {
    t: Date.now() - started,
    keys: Object.keys(message),
    ...(Object.keys(content).length ? { content: Object.keys(content) } : {}),
    ...(parts.length ? { parts: parts.map((part) => Object.keys(part).join("+")) } : {}),
    ...(calls.length ? { calls: calls.map((call) => ({ name: call.name, args: call.args })) } : {}),
    ...(message.interactionStatus ? { status: message.interactionStatus } : {}),
    ...(content.interactionStatus ? { status: content.interactionStatus } : {}),
    ...(message.error ? { error: message.error } : {}),
    ...(message.goAway ? { goAway: message.goAway } : {}),
    ...(message.toolCallCancellation ? { cancelled: message.toolCallCancellation } : {}),
    ...(parts.some((part) => part.thought) ? { thought: true } : {}),
  };
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
