/**
 * The recording service around a fake engine: admission before anything is read, what each
 * outcome answers, the one log row and the one clarification row it writes, and a reading no
 * provider could give.
 */
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classificationLogs, pendingClarifications } from "../../../db/schema";
import type { LlmAttempt } from "../../lib/llm-router";
import { storedShape } from "../../lib/understanding/bridge";
import { UnderstandingUnavailableError, VERSIONS, type Understanding, type UnderstandInput, type UnderstoodEvent } from "../../lib/understanding/engine";
import { assembleContext } from "../../lib/understanding/reading-context";

const h = vi.hoisted(() => {
  const order: string[] = [];
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  let nextId = 500;
  const db = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return [{ insertId: nextId++ }];
      }),
    })),
    select: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const name of ["from", "where", "orderBy"]) chain[name] = () => chain;
      chain.limit = async () => [{ id: 9 }];
      return chain;
    }),
  };
  return {
    order, inserts, db,
    reset: () => { order.length = 0; inserts.length = 0; nextId = 500; },
    settings: {} as Record<string, string>,
    dailyCount: 0,
    budgetError: null as Error | null,
  };
});

vi.mock("../../queries/connection", () => ({ db: h.db, getDb: () => h.db }));
vi.mock("../../lib/settings-cache", () => ({
  getSystemSettings: vi.fn(async () => { h.order.push("settings"); return h.settings; }),
}));
vi.mock("../../lib/ai-usage-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/ai-usage-policy")>();
  return {
    ...actual,
    countDailyAiRequests: vi.fn(async () => { h.order.push("daily"); return h.dailyCount; }),
    assertAiBudget: vi.fn(async () => {
      h.order.push("budget");
      if (h.budgetError) throw h.budgetError;
      return { limit: 50_000, used: 0, remaining: 50_000, plan: "free", perRequestMax: 1024 };
    }),
    trackAiTokens: vi.fn(async () => undefined),
  };
});
vi.mock("../../lib/ai-ledger", () => ({ recordModelCalls: vi.fn() }));
vi.mock("../ai-cost-policy", () => ({ recordAICostMetric: vi.fn(async () => undefined) }));

import { recordModelCalls } from "../../lib/ai-ledger";
import { trackAiTokens } from "../../lib/ai-usage-policy";
import { readSentence, READING_LOG_VERSION, UNAVAILABLE_MESSAGE, type ReadSentenceDeps } from "./read-sentence";

const user = { id: 31, type: "local" as const, plan: "free" };
const context = assembleContext({
  today: "2026-11-11", weekday: "Wednesday",
  contacts: [{ name: "أحمد" }],
  commitments: [{ cashflowId: 41, title: "مدرسة سلمى", kindLabel: "مدرسة", amount: 6500, dueDay: "2026-11-15", person: null }],
  wallets: [{ id: 7, name: "CIB" }],
});

const attempt: LlmAttempt = { slug: "alpha", model: "alpha-1", ok: true, latencyMs: 40, promptTokens: 900, completionTokens: 120, cachedTokens: 600, totalTokens: 1020 };

function ev(over: Partial<UnderstoodEvent> = {}): UnderstoodEvent {
  const base = {
    quote: "دفعت مصاريف المدرسة 6500", amount: 6500, kind: "spending", flow: "out", category: "education", sub: "school_fees",
    what: "مصاريف المدرسة", person: "", personRole: "none", personRelation: "", commitment: "c1", installments: 0, wallet: "w1",
    date: "", doubt: "none", flags: [], reasons: [], commitmentId: 41, commitmentDueDay: "2026-11-15", walletId: 7, ...over,
  } as Omit<UnderstoodEvent, "stored">;
  return { ...base, stored: storedShape(base) } as UnderstoodEvent;
}

function understanding(over: Partial<Understanding> = {}): Understanding {
  return {
    outcome: "save", events: [ev()], ignored: [], numbers: [], reasons: [], source: "model",
    usage: { attempts: [attempt], servedBy: "alpha", model: "alpha-1", degradedSchema: false, promptTokens: 900, completionTokens: 120, cachedTokens: 600, totalTokens: 1020, latencyMs: 40 },
    versions: { ...VERSIONS }, problems: [], ...over,
  };
}

function deps(result: Understanding | (() => never)): ReadSentenceDeps & { seen: UnderstandInput[] } {
  const seen: UnderstandInput[] = [];
  return {
    seen,
    understand: vi.fn(async (input: UnderstandInput) => {
      h.order.push("understand");
      seen.push(input);
      return typeof result === "function" ? result() : result;
    }),
    loadContext: vi.fn(async () => context),
    resolveRoutes: vi.fn(async () => [{ slug: "alpha", protocol: "openai" as const, baseUrl: "", apiKey: "k", model: "alpha-1", priority: 0 }]),
  };
}

const logRow = () => h.inserts.find((entry) => entry.table === classificationLogs)?.values;
const clarificationRow = () => h.inserts.find((entry) => entry.table === pendingClarifications)?.values;

beforeEach(() => {
  h.reset();
  h.settings = {};
  h.dailyCount = 0;
  h.budgetError = null;
  vi.mocked(recordModelCalls).mockClear();
  vi.mocked(trackAiTokens).mockClear();
});

describe("admission", () => {
  it("checks the plan switch, the daily limit and the budget, in that order, before the engine reads", async () => {
    const d = deps(understanding());
    await readSentence({ user, text: "دفعت مصاريف المدرسة 6500", channel: "text" }, d);
    expect(h.order).toEqual(["settings", "daily", "budget", "understand"]);
    expect(d.seen[0]).toMatchObject({ text: "دفعت مصاريف المدرسة 6500", settings: h.settings, maxOutputTokens: 1024 });
    expect(d.seen[0].context).toBe(context);
  });

  it("refuses a plan whose parse switch is off before counting anything", async () => {
    h.settings = { free_ai_parse: "false" };
    const d = deps(understanding());
    await expect(readSentence({ user, text: "x 5", channel: "text" }, d)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.order).toEqual(["settings"]);
    expect(h.inserts).toEqual([]);
  });

  it("refuses at the daily limit with the plan's own limit, before the budget", async () => {
    h.settings = { free_daily_limit: "3" };
    h.dailyCount = 3;
    const d = deps(understanding());
    await expect(readSentence({ user, text: "x 5", channel: "voice" }, d)).rejects.toThrow("(3)");
    expect(h.order).toEqual(["settings", "daily"]);
  });

  it("stops at the budget, and skips the gate a recording already passed", async () => {
    h.budgetError = new TRPCError({ code: "FORBIDDEN", message: "budget" });
    const d = deps(understanding());
    await expect(readSentence({ user, text: "x 5", channel: "voice", gateChecked: true }, d)).rejects.toThrow("budget");
    expect(h.order).toEqual(["settings", "budget"]);
    expect(d.understand).not.toHaveBeenCalled();
  });
});

describe("each outcome", () => {
  it("saves a clean reading: auto_save, its items, one slim log row, no question", async () => {
    const result = await readSentence({ user, text: "دفعت مصاريف المدرسة 6500", channel: "text" }, deps(understanding()));
    expect(result).toMatchObject({
      text: "دفعت مصاريف المدرسة 6500", decision: "auto_save", overallConfidence: 100, parsedBy: "ai", model: "alpha-1",
      classificationLogId: 500,
      items: [{ amount: 6500, category: "تعليم", subCategory: "مدرسة", type: "expense", reading: { commitmentId: 41, walletId: 7, kind: "spending" } }],
    });
    expect(result.clarificationQuestion).toBeUndefined();
    expect(result.clarificationId).toBeUndefined();
    expect(result.trace).toMatchObject({ engine: "understanding_engine.v1", route: "expense_parse", decision: "auto_save", itemCount: 1 });
    expect(clarificationRow()).toBeUndefined();

    const row = logRow()!;
    expect(row).toMatchObject({
      userId: 31, userType: "local", originalText: "دفعت مصاريف المدرسة 6500", parsedBy: "ai", decision: "auto_save", confidence: 100,
      classificationVersion: READING_LOG_VERSION, inputChannel: "text", needsFollowup: false, modelUsed: "alpha-1", tokensUsed: 1020,
    });
    expect(READING_LOG_VERSION).toMatch(/^u\d+-p\d+-t[\d.]+$/);
    expect(READING_LOG_VERSION.length).toBeLessThanOrEqual(20);
    expect(row.finalResult).toEqual(result.items);
    const trace = row.reasoningTraceLight as Record<string, unknown>;
    expect(Object.keys(trace).sort()).toEqual(["flags", "outcome", "reasons", "route", "usage", "versions"]);
    expect(JSON.stringify(trace)).not.toContain("دفعت");
  });

  it("shows a flagged reading: review, confidence 60, reasons on the item", async () => {
    const result = await readSentence({ user, text: "t", channel: "text" }, deps(understanding({
      outcome: "show", reasons: ["number_unaccounted"], events: [ev({ flags: ["model_doubt:category"], reasons: ["model_doubt:category"] })],
    })));
    expect(result).toMatchObject({ decision: "review", overallConfidence: 60, items: [{ needsReview: true, reviewReasons: ["model_doubt:category"] }] });
    expect(logRow()).toMatchObject({ decision: "review", needsFollowup: true, ambiguityFlags: ["model_doubt:category"] });
  });

  it("asks: clarify with the question and one clarification row made from the INSERT's own id", async () => {
    const result = await readSentence({ user, text: "دفعت القسط", channel: "voice", stt: { model: "stt-1", tokensUsed: 30, seconds: 4 } }, deps(understanding({
      outcome: "ask", question: "«القسط» كان بكام؟", askAbout: "amount", events: [ev({ amount: 0, reasons: ["amount_missing"] })], reasons: ["amount_missing"],
    })));
    expect(result).toMatchObject({ decision: "clarify", overallConfidence: 0, clarificationQuestion: "«القسط» كان بكام؟", clarificationId: 501, classificationLogId: 500, items: [] });
    expect(result.trace).toMatchObject({ route: "voice_expense_parse", stt: { model: "stt-1", tokensUsed: 30, durationSeconds: 4 } });
    expect(logRow()).toMatchObject({ inputChannel: "voice", modelUsed: "STT: stt-1 | Parse: alpha-1", tokensUsed: 1050, decision: "clarify" });
    expect(clarificationRow()).toMatchObject({
      userId: 31, userType: "local", question: "«القسط» كان بكام؟", originalText: "دفعت القسط", status: "pending",
      contextData: { items: [], classificationLogId: 500, source: "voice", followUps: 0 },
    });
  });

  it("never asks in the sandbox, and opens no row when the caller keeps its own question", async () => {
    const ask = understanding({ outcome: "ask", question: "؟", events: [] });
    const sandbox = await readSentence({ user, text: "t", channel: "text", skipClarification: true }, deps(ask));
    expect(sandbox).toMatchObject({ decision: "review", items: [] });
    expect(sandbox.clarificationQuestion).toBeUndefined();
    h.reset();
    const followUp = await readSentence({ user, text: "t", channel: "text", openClarification: false }, deps(ask));
    expect(followUp).toMatchObject({ decision: "clarify", clarificationQuestion: "؟" });
    expect(followUp.clarificationId).toBeUndefined();
    expect(clarificationRow()).toBeUndefined();
  });

  it("files business-mode work under the active business", async () => {
    const d = deps(understanding({ events: [ev({ category: "work", sub: "goods_materials", commitment: "", commitmentId: null, businessCategory: "خامات" })] }));
    const result = await readSentence({ user, text: "t", channel: "text", businessMode: true }, d);
    expect(d.loadContext).toHaveBeenCalledWith({ id: 31, type: "local" }, { businessMode: true });
    expect(result.items[0]).toMatchObject({ businessId: 9, category: "عمل", subCategory: "خامات" });
  });

  it("records what the reading cost", async () => {
    await readSentence({ user, text: "t", channel: "text" }, deps(understanding()));
    expect(trackAiTokens).toHaveBeenCalledWith(user, 1020, "parse", "alpha-1");
    expect(recordModelCalls).toHaveBeenCalledWith(user, "parse", [attempt], expect.objectContaining({ model: "alpha-1", tokens: 1020 }));
  });
});

describe("no provider could read", () => {
  it("answers SERVICE_UNAVAILABLE in Egyptian Arabic, records the failed tries and writes no log row", async () => {
    const failed: LlmAttempt[] = [{ slug: "alpha", model: "alpha-1", ok: false, latencyMs: 9, failure: "timeout", promptTokens: 50, completionTokens: 0, totalTokens: 50 }];
    const d = deps(() => { throw new UnderstandingUnavailableError("no", failed, { promptTokens: 50, completionTokens: 0, cachedTokens: 0, totalTokens: 50 }); });
    const error = await readSentence({ user, text: "t", channel: "text" }, d).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(TRPCError);
    expect(error).toMatchObject({ code: "SERVICE_UNAVAILABLE", message: UNAVAILABLE_MESSAGE });
    expect(recordModelCalls).toHaveBeenCalledWith(user, "parse", failed, expect.objectContaining({ tokens: 50 }));
    expect(trackAiTokens).toHaveBeenCalledWith(user, 50, "parse", "alpha-1");
    expect(h.inserts).toEqual([]);
  });
});
