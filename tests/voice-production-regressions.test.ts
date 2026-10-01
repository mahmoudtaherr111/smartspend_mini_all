// Production regressions: real modules, synthetic input, no provider or customer data.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../api/lib/redis-client", () => ({
  getRedisClient: vi.fn(async () => null),
  getCacheRuntimeStatus: vi.fn(() => ({ memoryFallbackAllowed: true })),
}));
import {
  admitCall,
  releaseCall,
  resetAdmissionMemory,
} from "../api/services/voice/gateway/admission";
import { LostToolCallGuard } from "../api/services/voice/gateway/lost-call-guard";
import {
  claimsDone,
  claimsFailure,
  LOST_CALL_GIVE_UP_NOTE,
  LOST_CALL_RETRY_NOTE,
} from "../api/services/voice/brain/claims";
import {
  CallSession,
  type CallBrain,
  type CallSessionDeps,
} from "../api/services/voice/gateway/call-session";
import type {
  EngineEvent,
  ToolCallResult,
  VoiceEngine,
} from "../api/services/voice/engine/types";
import type { VoiceServerMessage } from "../contracts/voice-protocol";
import { FactLedger } from "../api/services/voice/brain/facts";
import { universalChecks } from "../scripts/voice-eval/corpus";
import { SpokenNumberValidator } from "../api/services/voice/brain/validator";

class Engine implements VoiceEngine {
  readonly name = "synthetic-review";
  listener: (event: EngineEvent) => void = () => {};
  notes: string[] = [];
  results: ToolCallResult[] = [];
  async connect() {}
  sendAudio() {}
  endOfSpeech() {}
  sendText(text: string) {
    this.notes.push(text);
  }
  sendToolResults(results: ToolCallResult[]) {
    this.results.push(...results);
  }
  close() {
    this.listener = () => {};
  }
  onEvent(listener: (event: EngineEvent) => void) {
    this.listener = listener;
  }
  emit(event: EngineEvent) {
    this.listener(event);
  }
}
const active: CallSession[] = [];
async function setup(runTool?: CallBrain["runTool"]) {
  const engine = new Engine();
  const messages: VoiceServerMessage[] = [];
  const brain: CallBrain = {
    prepare: async () => ({ instruction: "synthetic", tools: [] }),
    openingNote: () => "[opening]",
    claimsFailure,
    lostToolCallNote: (retry) =>
      retry ? LOST_CALL_RETRY_NOTE : LOST_CALL_GIVE_UP_NOTE,
    runTool: runTool ?? (async () => ({ response: { ok: true } })),
  };
  const deps: CallSessionDeps = {
    brain,
    createEngine: () => engine,
    persistence: {
      markLive: async () => {},
      checkpoint: async () => {},
      finalize: async () => {},
      incident: async () => {},
    },
    saveState: async () => {},
    loadState: async () => null,
    deleteState: async () => {},
    saveTranscript: async () => {},
  };
  const session = new CallSession(
    {
      callId: "vc_review",
      userId: 7,
      userType: "local",
      plan: "pro",
      role: "user",
    },
    {
      model: "gemini-3.8-live-extended-thinking",
      thinkingLevel: "low",
      voiceName: "Kore",
      maxSeconds: 120,
      costBudgetUsd: null,
      client: "web",
    },
    deps,
  );
  active.push(session);
  await session.attach(
    {
      open: true,
      sendJson: (message) => messages.push(message),
      sendAudio: () => {},
      close: () => {},
    },
    false,
  );
  engine.notes.length = 0;
  await session.onClientMessage({ type: "text", text: "معايا كام؟" });
  engine.notes.length = 0;
  return { session, engine, messages, deps };
}
const audio: EngineEvent = {
  type: "audio",
  pcm: Buffer.alloc(4800),
  sampleRate: 24000,
};
afterEach(async () => {
  await Promise.all(active.splice(0).map((s) => s.end("user")));
});

describe("requirements missing from Claude qualification", () => {
  beforeEach(resetAdmissionMemory);
  it("holds an unconfirmed done claim and recovers without the false caption reaching the user", async () => {
    const { deps } = await setup();
    const engine = new Engine();
    deps.createEngine = () => engine;
    deps.brain.awaitingConfirmation = () => true;
    deps.brain.claimsUnconfirmedDone = claimsDone;
    deps.brain.unconfirmedDoneNote = () => "[preview only]";
    const messages: VoiceServerMessage[] = [];
    const audioFrames: Buffer[] = [];
    const session = new CallSession(
      {
        callId: "vc_preview",
        userId: 7,
        userType: "local",
        plan: "pro",
        role: "user",
      },
      {
        model: "gemini-3.8-live",
        thinkingLevel: "low",
        voiceName: "Kore",
        maxSeconds: 120,
        costBudgetUsd: null,
        client: "web",
      },
      deps,
    );
    active.push(session);
    deps.brain.runTool = async () => ({
      response: { ok: true },
      card: {
        kind: "draft",
        draftId: "dr_abcdefgh",
        title: "مسودة",
        items: [],
        status: "pending",
        expiresAt: new Date().toISOString(),
      },
    });
    await session.attach(
      {
        open: true,
        sendJson: (m) => messages.push(m),
        sendAudio: (pcm) => audioFrames.push(pcm),
        close: () => {},
      },
      false,
    );
    engine.emit({
      type: "tool_calls",
      calls: [{ id: "draft", name: "record_draft", args: {} }],
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    engine.emit(audio);
    engine.emit({ type: "output_transcript", text: "سجلنا خمسين جنيه" });
    engine.emit({ type: "output_transcript", text: " أأكد؟" });
    expect(audioFrames).toHaveLength(0);
    expect(
      messages.filter((m) => m.type === "caption" && m.role === "assistant"),
    ).toHaveLength(0);
    expect(
      engine.notes.filter((note) => note === "[preview only]"),
    ).toHaveLength(1);
  });
  it("keeps the user seat after moving the same call to another model pool", async () => {
    const limits = { poolMax: 20, userMax: 1 };
    const who = { id: 7, type: "local" };
    const old = { pool: "standard", callId: "c1", user: who };
    await admitCall(old, limits, 1_000_000);
    await admitCall({ ...old, pool: "extended" }, limits, 1_000_001);
    await releaseCall(old, { keepUser: true });
    expect(
      await admitCall(
        { pool: "standard", callId: "c2", user: who },
        limits,
        1_000_002,
      ),
    ).toMatchObject({ ok: false, reason: "user_busy" });
  });
  it("sends only one recovery note for all chunks of one suppressed apology", async () => {
    const { engine } = await setup();
    engine.emit({ type: "turn_complete", working: true });
    engine.emit(audio);
    engine.emit({ type: "output_transcript", text: "حصل عطل في النظام" });
    engine.emit({ type: "output_transcript", text: " ومش قادر أكمل" });
    expect(engine.notes).toEqual([LOST_CALL_RETRY_NOTE]);
  });
  it("lets the final honest inability answer reach the user after retries are exhausted", async () => {
    const { engine, messages } = await setup();
    engine.emit({ type: "turn_complete", working: true });
    for (let i = 0; i < 3; i++) {
      engine.emit(audio);
      engine.emit({ type: "output_transcript", text: "حصل عطل في النظام" });
      engine.emit({ type: "interrupted" });
      engine.emit({ type: "turn_complete", working: false });
    }
    engine.emit(audio);
    engine.emit({
      type: "output_transcript",
      text: "مش قادر أوصل للمعلومة دي في المكالمة دلوقتي",
    });
    expect(
      messages.some(
        (m) =>
          m.type === "caption" &&
          m.role === "assistant" &&
          m.text.includes("مش قادر أوصل"),
      ),
    ).toBe(true);
    expect(
      engine.notes.filter((n) => n === LOST_CALL_GIVE_UP_NOTE),
    ).toHaveLength(1);
  });
  it("keeps discussion of a car breakdown audible", () => {
    const g = new LostToolCallGuard({ claimsFailure });
    g.newRequest();
    g.utteranceEnded(true);
    g.audio(Buffer.alloc(4800), 24000, 0);
    expect(
      g.words("حصل عطل في العربية وصرفت على تصليحها كتير", 10),
    ).toMatchObject({ kind: "release" });
  });
  it("does not pass an apology unexamined when its transcript precedes audio", () => {
    const g = new LostToolCallGuard({ claimsFailure });
    g.newRequest();
    g.utteranceEnded(true);
    expect(g.words("حصل عطل في النظام", 0).kind).not.toBe("pass");
  });
  it("marks old results superseded when a spoken correction is already transcribed before speech_end", async () => {
    let finish!: (v: { response: { ok: boolean; balance: number } }) => void;
    const running = new Promise<{ response: { ok: boolean; balance: number } }>(
      (r) => {
        finish = r;
      },
    );
    const { session, engine } = await setup(async () => running);
    engine.emit({
      type: "tool_calls",
      calls: [{ id: "old", name: "read_balance", args: {} }],
    });
    session.onClientAudio(Buffer.alloc(640));
    engine.emit({ type: "interrupted" });
    engine.emit({
      type: "input_transcript",
      text: "لا استنى قولي الالتزامات بس",
    });
    finish({ response: { ok: true, balance: 5000 } });
    await new Promise((r) => setTimeout(r, 10));
    expect(engine.results[0].response).toHaveProperty("earlier_request");
  });
  it("does not accept a salary number as verified spending just because both numbers were read", () => {
    const ledger = new FactLedger();
    ledger.nextBatch();
    ledger.add({ id: "salary", label: "مرتب", value: 7000, source: "ledger" });
    ledger.add({
      id: "spending",
      label: "مصروف",
      value: 4000,
      source: "ledger",
    });
    const validator = new SpokenNumberValidator(ledger);
    validator.addAssistantWords("إجمالي مصاريفك سبعة آلاف جنيه");
    expect(validator.endTurn()).not.toBeNull();
  });
  it("closes the new provider connection when the user hangs up while a mode switch is connecting", async () => {
    const { session, deps } = await setup();
    session.options.mode = "ultra";
    session.options.modes = {
      standard: { model: "gemini-3.8-live", thinkingLevel: "low" },
      ultra: {
        model: "gemini-3.8-live-extended-thinking",
        thinkingLevel: "low",
      },
    };
    const next = new Engine();
    let connected!: () => void;
    const pending = new Promise<void>((r) => {
      connected = r;
    });
    next.connect = async () => pending;
    next.close = vi.fn();
    deps.createEngine = () => next;
    const switching = session.onClientMessage({
      type: "mode",
      mode: "standard",
    });
    await new Promise((r) => setTimeout(r, 5));
    await session.end("user");
    connected();
    await switching;
    expect(session.ended).toBe(true);
    expect(next.close).toHaveBeenCalled();
  });
  it("does not interrupt an extended task still IN_PROGRESS just because its post-tool timer elapsed", async () => {
    const { engine, deps } = await setup();
    deps.replyWaitMs = 10;
    deps.brain.replyNudge = () => "[timer nudge interrupts]";
    engine.emit({ type: "working" });
    engine.emit({
      type: "tool_calls",
      calls: [{ id: "read", name: "money_query", args: {} }],
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(engine.notes).not.toContain("[timer nudge interrupts]");
  });
  it("fails the universal no-unagreed-write check for a new financial commitment without consent", () => {
    const check = universalChecks({
      id: "ordinary-read",
      domain: "analysis",
      fixture: "base",
      turns: ["قولي صرفت كام"],
      checks: [],
    }).find((c) => c.id === "no_unagreed_write")!;
    const trace = {
      turns: [],
      incidents: [],
      writes: {
        expenses: [],
        goals: 0,
        budgets: 0,
        budgetStates: [],
        cashflows: [
          {
            kind: "debt",
            direction: "expense",
            amount: 9000,
            startDay: "2026-10-04",
          },
        ],
      },
      costUsd: 0,
      tokens: null,
      providerErrors: [],
    };
    expect(check.test(trace)).toBe(false);
  });

  it("ends a silent request before any tool with an explicit user notice", async () => {
    const { session, deps, messages } = await setup();
    deps.taskTimeoutMs = 20;
    await session.onClientMessage({ type: "text", text: "راجع حساباتي" });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(session.ended).toBe(true);
    expect(
      messages.some((m) => m.type === "notice" && m.kind === "degraded"),
    ).toBe(true);
  });

  it("carries text received during model connection to the new model", async () => {
    const { session, deps } = await setup();
    session.options.mode = "ultra";
    session.options.modes = {
      standard: { model: "gemini-3.8-live", thinkingLevel: "low" },
      ultra: null,
    };
    const next = new Engine();
    let connected!: () => void;
    const pending = new Promise<void>((resolve) => {
      connected = resolve;
    });
    next.connect = async () => pending;
    deps.createEngine = () => next;
    const switchPromise = session.onClientMessage({
      type: "mode",
      mode: "standard",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await session.onClientMessage({
      type: "text",
      text: "لا خلينا نشوف المواصلات",
    });
    connected();
    await switchPromise;
    expect(next.notes).toContain("لا خلينا نشوف المواصلات");
  });
});
