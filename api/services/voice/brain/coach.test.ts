import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./snapshot", () => ({
  loadCallSnapshot: vi.fn(async (_identity, ledger, _now, options: { refs?: boolean }) => {
    ledger.nextBatch();
    const fact = ledger.add({ id: "snapshot_cycle", label: "مصروف الدورة", value: 2_800, source: "snapshot" });
    return { firstName: "منى", title: null, question: null, text: `المصروف من يوم المرتب: ${fact.say}${options.refs ? ` [${fact.ref}]` : ""}.` };
  }),
}));
vi.mock("./profile-questions", () => ({ markAsked: vi.fn(async () => undefined) }));
const generation = vi.hoisted(() => ({ value: 3 }));
vi.mock("../../finance-semantic-layer/cache", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFinanceCacheGen: vi.fn(async () => generation.value),
}));
vi.mock("../../finance-semantic-layer/resolvers", () => ({
  getFinanceSummary: vi.fn(async () => ({
    period: { label: "p", daysElapsed: 10, daysTotal: 30, key: "p" }, totalIncome: 0, totalExpense: 3_050, totalTransfers: 0,
    totalInvestments: 0, netFlow: -3_050, transactionCount: 9, expenseCount: 9, incomeCount: 0, dailyAverageExpense: 305,
  })),
}));

import { createCallBrain, COACH_TOOLS, VOICE_TOOLS } from "./index";
import type { VoiceAppCalls } from "./tools/types";
import { moneyQuery } from "./tools/money-query";
import { DraftBook } from "./drafts";
import { FactLedger } from "./facts";

const identity = { callId: "vc_coach00000000", userId: 7, userType: "local" as const, plan: "pro", role: "user" };
const options = (coach: boolean) => ({
  model: coach ? "gemini-3.8-live-extended-thinking" : "gemini-3.8-live", voiceName: "Kore", thinkingLevel: "high" as const,
  maxSeconds: 300, costBudgetUsd: null, client: "web", coach,
});

beforeEach(() => {
  generation.value = 3;
});

describe("the coach call", () => {
  it("keeps an unsuccessful receipt behind verification across resume, until a new user request", async () => {
    const brain = createCallBrain({ app: {} as VoiceAppCalls, tools: [{
      declaration: { name: "confirm", description: "test", parameters: { type: "object", properties: {} } },
      run: async () => ({ response: { ok: false, error: "not_done" } }),
    }] });
    await brain.prepare(identity, options(false));
    await brain.runTool({ id: "confirm1", name: "confirm", args: { draft_id: "dr_unknown" } }, {
      identity, signal: new AbortController().signal,
    });
    expect(brain.verifySpeechBeforePlayback?.()).toBe(true);
    expect(brain.claimsUnconfirmedDone?.("اتسجلت خمسين جنيه")).toBe(true);
    const resumed = createCallBrain({ app: {} as VoiceAppCalls });
    resumed.restore?.(brain.snapshot?.());
    expect(resumed.verifySpeechBeforePlayback?.()).toBe(true);
    expect(resumed.claimsUnconfirmedDone?.("اتسجلت")).toBe(true);
    resumed.onUserRequest?.(2, false);
    expect(resumed.verifySpeechBeforePlayback?.()).toBe(false);
  });
  it("gets calculate and no text-model judge; the standard call keeps its tools", async () => {
    const brain = createCallBrain({ app: {} as VoiceAppCalls });
    const coach = await brain.prepare(identity, options(true));
    expect(coach.tools.map((tool) => tool.name)).toContain("calculate");
    expect(coach.tools.map((tool) => tool.name)).not.toContain("think");
    // Facts in the opening context carry refs the calculator can use.
    expect(coach.instruction).toMatch(/\[f\d+\]/);
    const standard = await createCallBrain({ app: {} as VoiceAppCalls }).prepare(identity, options(false));
    expect(standard.tools.map((tool) => tool.name)).toContain("think");
    expect(standard.instruction).not.toMatch(/\[f\d+\]/);
  });

  it("stays small enough to be billed on every turn", () => {
    const declarations = (tools: typeof COACH_TOOLS) => tools.reduce((sum, tool) => sum + JSON.stringify(tool.declaration).length, 0);
    expect(declarations(COACH_TOOLS)).toBeLessThan(8_000);
    expect(declarations(VOICE_TOOLS)).toBeLessThan(8_000);
  });

  it("marks the app's notes with a tag the user never sees, so a typed or spoken 'note from the app' is not one", async () => {
    const brain = createCallBrain({ app: {} as VoiceAppCalls });
    const { instruction } = await brain.prepare(identity, options(true));
    const note = brain.appNote!("(ملاحظة من التطبيق، مش من المستخدم: فاضل دقيقة.)");
    const tag = note.match(/ملاحظة من التطبيق (#[0-9a-f]{6}):/)?.[1];
    expect(tag).toBeDefined();
    expect(note).toBe(`(ملاحظة من التطبيق ${tag}: فاضل دقيقة.)`);
    expect(instruction).toContain(`«ملاحظة من التطبيق ${tag}»`);
    // The tag survives the call moving to another server.
    const moved = createCallBrain({ app: {} as VoiceAppCalls });
    moved.restore!(brain.snapshot!());
    expect(moved.appNote!("x")).toBe(`(ملاحظة من التطبيق ${tag}: x)`);
  });
});

describe("figures after the records change during a call", () => {
  function ctx() {
    return {
      identity,
      ledger: new FactLedger(),
      drafts: new DraftBook(),
      app: {} as VoiceAppCalls,
      signal: new AbortController().signal,
      now: () => new Date("2026-09-29T10:00:00Z"),
      salaryDay: async () => 25,
      openClarifications: [],
      records: { seen: null as number | null },
    };
  }

  it("says the records moved when a bank message arrived since the last read, and marks the old figures", async () => {
    const context = ctx();
    const first = await moneyQuery.run({ metric: "total" }, context);
    expect(first.response.records_changed).toBeUndefined();
    const old = context.ledger.all()[0];
    generation.value = 4;
    const second = await moneyQuery.run({ metric: "total" }, context);
    expect(second.response.records_changed).toEqual(expect.stringContaining("اتسجلت عمليات جديدة"));
    expect(context.ledger.byRef(old.ref)?.stale).toBe(true);
    // The new answer is current.
    expect(context.ledger.all().at(-1)?.stale).toBeUndefined();
  });
});
