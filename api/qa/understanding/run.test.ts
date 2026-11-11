import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assembleContext } from "../../lib/understanding/reading-context";
import { RateLimiter, type TryResult } from "./limiter";
import { finishedIds, readJsonl, RESULTS_FILE } from "./report";
import {
  appendLine,
  caseContext,
  classifyFailure,
  latestRunDir,
  parseArgs,
  prepareScriptEnv,
  resolveRoute,
  runCases,
  selectCases,
  toCaseResult,
  UsageError,
  type EngineAnswer,
} from "./run";
import type { CaseResult } from "./score";
import type { EvalCase } from "./set";

const KEY = "k".repeat(39);
const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-understand-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const cases: EvalCase[] = Array.from({ length: 8 }, (_, i) => ({
  id: `C-${i + 1}`,
  text: `قهوة ${i + 1}0`,
  expect: "clear",
  events: [{ amount: (i + 1) * 10, kind: "spending", flow: "out", category: "dining", sub: "cafe" }],
}));

function fakeTime() {
  const state = { now: 0, sleeps: [] as number[] };
  return { state, clock: () => state.now, sleep: async (ms: number) => void (state.sleeps.push(ms), (state.now += ms)) };
}

const finished = (id: string): CaseResult => ({
  id,
  today: "2026-11-11",
  outcome: "save",
  source: "model",
  events: [],
  flags: [],
  reasons: [],
  usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0, servedBy: null, model: null, degradedSchema: false, attempts: [] },
  latencyMs: 1,
  engineLatencyMs: 1,
  problems: [],
  versions: {},
  retries: 0,
});

describe("parseArgs", () => {
  it("reads the documented options in both spellings", () => {
    const options = parseArgs(["--set", "s.json", "--rpm=6", "--limit", "20", "--ids", "D-001, D-002", "--route", "gemini:gemini-3.1-flash-lite", "--resume", "--setting", "llm_timeout_ms=20000"]);
    expect(options).toMatchObject({ set: "s.json", rpm: 6, limit: 20, ids: ["D-001", "D-002"], route: "gemini:gemini-3.1-flash-lite", resume: true, settings: { llm_timeout_ms: "20000" } });
    expect(parseArgs([])).toMatchObject({ rpm: 8, resume: false, strictPolicy: false, set: "api/qa/understanding/dev-set.json" });
  });

  it("refuses unknown options and bad numbers", () => {
    expect(() => parseArgs(["--rpm", "0"])).toThrow(UsageError);
    expect(() => parseArgs(["--limit", "2.5"])).toThrow(UsageError);
    expect(() => parseArgs(["--fast"])).toThrow(UsageError);
    expect(() => parseArgs(["--set"])).toThrow(UsageError);
  });
});

describe("resolveRoute", () => {
  it("refuses to start without a real key", () => {
    expect(() => resolveRoute({}, null)).toThrow(/no model key/);
    expect(() => resolveRoute({ GEMINI_API_KEY: "test" }, null)).toThrow(/no model key/);
    expect(() => resolveRoute({ GEMINI_API_KEY: "eval-harness-unused-and-long-enough" }, null)).toThrow(/no model key/);
  });

  it("uses the only key present with its default model", () => {
    const route = resolveRoute({ GEMINI_API_KEY: KEY }, null);
    expect(route).toMatchObject({ slug: "gemini", protocol: "gemini", apiKey: KEY, model: "gemini-3.1-flash-lite" });
  });

  it("requires --route when several keys are present, and its key when given", () => {
    expect(() => resolveRoute({ GEMINI_API_KEY: KEY, GROQ_API_KEY: KEY }, null)).toThrow(/pass --route/);
    const route = resolveRoute({ GEMINI_API_KEY: KEY, OPENROUTER_API_KEY: KEY }, "openrouter:meta-llama/llama-4:free");
    expect(route).toMatchObject({ slug: "openrouter", protocol: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-4:free" });
    expect(() => resolveRoute({ GEMINI_API_KEY: KEY }, "groq:llama-3.3-70b-versatile")).toThrow(/needs GROQ_API_KEY/);
    expect(() => resolveRoute({ GEMINI_API_KEY: KEY }, "openai:gpt")).toThrow(/unknown provider/);
    expect(() => resolveRoute({ ANTHROPIC_API_KEY: KEY }, null)).toThrow(/no default model/);
  });
});

describe("prepareScriptEnv", () => {
  it("fills what env.ts requires and always points the database somewhere unreachable", () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "mysql://real:secret@db/prod", JWT_SECRET: "kept", REDIS_URL: "redis://real" };
    prepareScriptEnv(env);
    expect(env.DATABASE_URL).toContain("127.0.0.1:1");
    expect(env.REDIS_URL).toBe("");
    expect(env.JWT_SECRET).toBe("kept");
    expect(env.GOOGLE_CLIENT_ID).toBeTruthy();
    // The placeholder is never usable as a model key.
    expect(() => resolveRoute(env, null)).toThrow(/no model key/);
  });
});

describe("classifyFailure", () => {
  it("retries only when every attempt was a rate limit, with the longest wait asked", () => {
    const limited = classifyFailure(
      Object.assign(new Error("all failed"), {
        name: "UnderstandingUnavailableError",
        attempts: [{ slug: "gemini", model: "m", ok: false, latencyMs: 5, failure: "rate_limited", status: 429, retryAfterMs: 30_000 }],
      }),
    );
    expect(limited).toMatchObject({ rateLimited: true, retryAfterMs: 30_000 });
    expect(limited.detail).toContain("UnderstandingUnavailableError");

    const unusable = classifyFailure(Object.assign(new Error("x"), { attempts: [{ slug: "gemini", model: "m", ok: true, latencyMs: 5 }] }));
    expect(unusable.rateLimited).toBe(false);
    expect(classifyFailure(new TypeError("boom"))).toMatchObject({ rateLimited: false, detail: "TypeError: boom" });
  });
});

describe("runCases", () => {
  const run = (attempt: (item: EvalCase) => Promise<TryResult<CaseResult>>, done = new Set<string>()) => {
    const time = fakeTime();
    const results: string[] = [];
    const failures: string[] = [];
    const log: string[] = [];
    const promise = runCases({
      cases,
      done,
      limiter: new RateLimiter(6, time.clock, time.sleep),
      sleep: time.sleep,
      attempt,
      onResult: (r) => results.push(r.id),
      onFailure: (f) => failures.push(f.id),
      log: (line) => log.push(line),
    });
    return { promise, time, results, failures, log };
  };

  it("runs sequentially, spaced by the rpm, and skips finished ids", async () => {
    let active = 0;
    let maxActive = 0;
    const { promise, time, results } = run(async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return { ok: true, value: finished(item.id) };
    }, new Set(["C-2", "C-5"]));
    const summary = await promise;
    expect(summary).toMatchObject({ finished: 6, skipped: 2, failed: 0, stopped: null });
    expect(results).toEqual(["C-1", "C-3", "C-4", "C-6", "C-7", "C-8"]);
    expect(maxActive).toBe(1);
    expect(time.state.sleeps).toEqual([10_000, 10_000, 10_000, 10_000, 10_000]);
  });

  it("stops cleanly after 5 consecutive failed cases", async () => {
    let calls = 0;
    const { promise, failures, log } = run(async () => (calls++, { ok: false, rateLimited: false, detail: "timeout" }));
    const summary = await promise;
    expect(summary).toMatchObject({ failed: 5, finished: 0, stopped: "consecutive_failures" });
    expect(calls).toBe(5);
    expect(failures).toEqual(["C-1", "C-2", "C-3", "C-4", "C-5"]);
    expect(log.at(-1)).toContain("5 cases in a row failed");
  });

  it("a success resets the failure streak", async () => {
    const { promise } = run(async (item) =>
      ["C-3", "C-8"].includes(item.id) ? { ok: true, value: finished(item.id) } : { ok: false, rateLimited: false, detail: "server" },
    );
    expect(await promise).toMatchObject({ failed: 6, finished: 2, stopped: null });
  });

  it("retries a rate-limited case after the wait and records its retries", async () => {
    let tries = 0;
    const { promise, time } = run(async (item) => {
      if (item.id === "C-1" && tries++ < 2) return { ok: false, rateLimited: true, detail: "429" };
      return { ok: true, value: finished(item.id) };
    });
    expect(await promise).toMatchObject({ finished: 8, failed: 0 });
    expect(time.state.sleeps.slice(0, 2)).toEqual([60_000, 60_000]);
  });

  it("stops on a quota-sized wait without retrying", async () => {
    const { promise } = run(async () => ({ ok: false, rateLimited: true, retryAfterMs: 3_600_000, detail: "429" }));
    expect(await promise).toMatchObject({ failed: 1, stopped: "quota" });
  });
});

describe("resume", () => {
  it("reads finished ids, skipping a line a stopped run cut short, and appends on a fresh line", () => {
    const dir = tempDir();
    const file = join(dir, RESULTS_FILE);
    writeFileSync(file, `${JSON.stringify(finished("C-1"))}\n${JSON.stringify(finished("C-2")).slice(0, 30)}`);
    expect([...finishedIds(dir)]).toEqual(["C-1"]);
    expect(readJsonl(file).broken).toBe(1);
    appendLine(file, finished("C-3"));
    expect([...finishedIds(dir)].sort()).toEqual(["C-1", "C-3"]);
    expect(readFileSync(file, "utf8").endsWith("\n")).toBe(true);
  });

  it("finds the latest run folder of a set and route", () => {
    const root = tempDir();
    for (const name of ["dev-gemini-m-20261110-0900", "dev-gemini-m-20261111-0830", "dev-groq-m-20261112-0000", "dev-gemini-m-notes"]) mkdirSync(join(root, name));
    expect(latestRunDir(root, "dev", { slug: "gemini", model: "m" })).toBe(join(root, "dev-gemini-m-20261111-0830"));
    expect(latestRunDir(root, "dev", { slug: "nvidia", model: "m" })).toBeNull();
    expect(latestRunDir(join(root, "missing"), "dev", { slug: "gemini", model: "m" })).toBeNull();
  });

  it("selects by ids then limit, in set order", () => {
    expect(selectCases(cases, ["C-4", "C-2"], null).map((c) => c.id)).toEqual(["C-2", "C-4"]);
    expect(selectCases(cases, null, 3).map((c) => c.id)).toEqual(["C-1", "C-2", "C-3"]);
    expect(() => selectCases(cases, ["X"], null)).toThrow(/not in the set/);
  });
});

describe("case context", () => {
  const today = { day: "2026-11-11", weekday: "Wednesday" };

  it("is empty with today's date unless the case supplies parts; familiar and known by default", () => {
    const ctx = caseContext(cases[0], today, false, assembleContext);
    expect(ctx).toMatchObject({ today: "2026-11-11", weekday: "Wednesday", people: [], commitments: [], wallets: [] });
    expect(ctx.isFamiliar("health", "doctor")).toBe(true);
    expect(ctx.isKnownPerson("أي حد")).toBe(true);
  });

  it("--strict-policy keeps the context's own answers", () => {
    const item: EvalCase = { ...cases[0], context: { people: [{ name: "أحمد" }] } };
    const ctx = caseContext(item, today, true, assembleContext);
    expect(ctx.isFamiliar("health", "doctor")).toBe(false);
    expect(ctx.isKnownPerson("لأحمد")).toBe(true);
    expect(ctx.isKnownPerson("محمود")).toBe(false);
  });

  it("references are assigned by the engine's rules, earliest due first", () => {
    const item: EvalCase = {
      ...cases[0],
      context: {
        commitments: [
          { title: "قسط العربية", kindLabel: "قسط", amount: 4500, dueDay: "2026-11-20" },
          { title: "مصاريف المدرسة", kindLabel: "مدرسة", amount: 8000, dueDay: "2026-11-15" },
        ],
        wallets: [{ name: "فيزا" }],
      },
    };
    const ctx = caseContext(item, today, false, assembleContext);
    expect(ctx.commitments.map((c) => [c.ref, c.title])).toEqual([
      ["c1", "مصاريف المدرسة"],
      ["c2", "قسط العربية"],
    ]);
    expect([...ctx.walletRefs.keys()]).toEqual(["w1"]);
  });
});

describe("toCaseResult", () => {
  it("keeps the answer's facts, cuts provider messages and keeps no prompt", () => {
    const answer: EngineAnswer = {
      outcome: "show",
      events: [
        {
          quote: "قهوة 10",
          amount: 10,
          kind: "spending",
          flow: "out",
          category: "dining",
          sub: "cafe",
          what: "قهوة",
          person: "",
          personRole: "none",
          personRelation: "",
          commitment: "",
          installments: 0,
          wallet: "",
          date: "",
          doubt: "none",
          flags: ["number_unaccounted"],
          reasons: ["number_unaccounted"],
        },
      ],
      reasons: ["number_unaccounted"],
      source: "model",
      usage: {
        attempts: [{ slug: "gemini", model: "m", ok: false, latencyMs: 9, failure: "server", status: 503, message: "x".repeat(500) }],
        servedBy: "gemini",
        model: "m",
        degradedSchema: false,
        promptTokens: 10,
        completionTokens: 5,
        cachedTokens: 0,
        totalTokens: 15,
        latencyMs: 900,
      },
      versions: { contract: "1", prompt: "1", taxonomy: "2.0" },
      problems: ["event 2: dropped, unknown kind"],
    };
    const row = toCaseResult(cases[0], answer, "2026-11-11", 950, 1);
    expect(row).toMatchObject({ id: "C-1", outcome: "show", flags: ["number_unaccounted"], latencyMs: 950, engineLatencyMs: 900, retries: 1 });
    expect(row.usage.attempts[0].message).toHaveLength(200);
    expect(JSON.stringify(row)).not.toMatch(/systemPrompt|SYSTEM/);
  });
});
