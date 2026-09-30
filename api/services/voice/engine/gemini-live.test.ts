import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeGeminiLive, type LiveClientMessage } from "../../../../tests/helpers/fake-gemini-live";
import { GeminiLiveEngine, buildLiveSetup, isQuotaRefusal, readLiveUsage } from "./gemini-live";
import type { EngineEvent, EngineSetup } from "./types";

const setup: EngineSetup = {
  model: "gemini-3.8-live",
  voiceName: "Kore",
  systemInstruction: "انت سمارت",
  tools: [{ name: "money_query", description: "numbers", parameters: { type: "object", properties: {} } }],
  compression: { triggerTokens: 16_000, targetTokens: 8_000 },
};

function collect(engine: GeminiLiveEngine): EngineEvent[] {
  const events: EngineEvent[] = [];
  engine.onEvent((event) => events.push(event));
  return events;
}

async function until<T>(read: () => T | undefined, timeoutMs = 3_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() - started > timeoutMs) throw new Error("until_timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("buildLiveSetup", () => {
  it("asks for transcripts, resumption, a context window and non-blocking tools", () => {
    const message = buildLiveSetup(setup, null).setup as NonNullable<LiveClientMessage["setup"]>;
    expect(message.model).toBe("models/gemini-3.8-live");
    expect(message.inputAudioTranscription).toEqual({});
    expect(message.outputAudioTranscription).toEqual({});
    expect(message.sessionResumption).toEqual({});
    expect(message.realtimeInputConfig).toEqual({ automaticActivityDetection: { silenceDurationMs: 1_000 } });
    expect(message.contextWindowCompression).toEqual({ triggerTokens: "16000", slidingWindow: { targetTokens: "8000" } });
    expect(message.tools?.[0].functionDeclarations[0].behavior).toBe("NON_BLOCKING");
    expect(message.generationConfig?.thinkingConfig).toBeUndefined();
  });

  it("puts the thinking level in generationConfig only for the thinking model, and resumes a handle", () => {
    const message = buildLiveSetup({ ...setup, model: "gemini-3.8-live-extended-thinking", thinkingLevel: "medium" }, "h1")
      .setup as NonNullable<LiveClientMessage["setup"]>;
    expect(message.generationConfig?.thinkingConfig).toEqual({ thinkingLevel: "MEDIUM" });
    expect(message.sessionResumption).toEqual({ handle: "h1" });
  });

  it("asks for history in client content only for a fresh session that has some", () => {
    const history = [{ role: "user" as const, text: "معايا ستة آلاف" }];
    expect((buildLiveSetup({ ...setup, history }, null).setup as Record<string, unknown>).historyConfig)
      .toEqual({ initialHistoryInClientContent: true });
    expect((buildLiveSetup({ ...setup, history }, "h1").setup as Record<string, unknown>).historyConfig).toBeUndefined();
    expect((buildLiveSetup(setup, null).setup as Record<string, unknown>).historyConfig).toBeUndefined();
  });
});

describe("readLiveUsage", () => {
  it("splits tokens by direction and modality", () => {
    expect(readLiveUsage({
      usageMetadata: {
        promptTokenCount: 1300, responseTokenCount: 240, thoughtsTokenCount: 70,
        promptTokensDetails: [{ modality: "TEXT", tokenCount: 900 }, { modality: "AUDIO", tokenCount: 400 }],
        responseTokensDetails: [{ modality: "AUDIO", tokenCount: 240 }],
      },
    })).toEqual({ input: { text: 900, audio: 400 }, output: { audio: 240 }, thoughts: 70, promptTotal: 1300, responseTotal: 240 });
    expect(readLiveUsage({})).toBeNull();
  });
});

describe("GeminiLiveEngine against a fake Live API", () => {
  let fake: FakeGeminiLive;
  let engine: GeminiLiveEngine;

  beforeEach(async () => {
    fake = await FakeGeminiLive.start({ rejectKeys: ["bad-key"] });
  });

  afterEach(async () => {
    engine?.close();
    await fake.stop();
  });

  it("sends the key in a header, streams audio both ways and reports the turn", async () => {
    engine = new GeminiLiveEngine({ apiKeys: ["good-key"], url: fake.url });
    const events = collect(engine);
    const session = fake.nextSession();
    await engine.connect(setup);
    const live = await session;
    expect(live.apiKey).toBe("good-key");

    engine.sendAudio(Buffer.from([1, 2, 3, 4]));
    engine.endOfSpeech();
    engine.sendText("صرفت كام؟");
    const audioIn = await live.waitFor((m) => Boolean(m.realtimeInput?.audio));
    expect(audioIn.realtimeInput?.audio).toEqual({ mimeType: "audio/pcm;rate=16000", data: Buffer.from([1, 2, 3, 4]).toString("base64") });
    await live.waitFor((m) => m.realtimeInput?.audioStreamEnd === true);
    const text = await live.waitFor((m) => Boolean(m.clientContent));
    expect(text.clientContent).toEqual({ turns: [{ role: "user", parts: [{ text: "صرفت كام؟" }] }], turnComplete: true });

    live.sendInputTranscript("صرفت كام");
    live.sendAudio(Buffer.from([9, 9]));
    live.sendOutputTranscript("تلتمية وعشرين");
    live.sendTurnComplete();
    await until(() => events.find((e) => e.type === "idle"));

    expect(events.map((e) => e.type)).toEqual(["ready", "input_transcript", "audio", "output_transcript", "turn_complete", "idle"]);
    const audio = events.find((e) => e.type === "audio") as Extract<EngineEvent, { type: "audio" }>;
    expect([...audio.pcm]).toEqual([9, 9]);
    expect(audio.sampleRate).toBe(24_000);
  });

  it("falls back to the second key when the first cannot open a session", async () => {
    const failures: number[] = [];
    engine = new GeminiLiveEngine({ apiKeys: ["bad-key", "good-key"], url: fake.url, onKeyFailure: (index) => failures.push(index) });
    const session = fake.nextSession();
    await engine.connect(setup);
    expect((await session).apiKey).toBe("good-key");
    expect(failures).toEqual([0]);
  });

  it("sends a fresh session the call's history before anything else, as roles and text", async () => {
    engine = new GeminiLiveEngine({ apiKeys: ["good-key"], url: fake.url });
    const session = fake.nextSession();
    await engine.connect({ ...setup, history: [{ role: "user", text: "معايا ستة آلاف" }, { role: "model", text: "تمام" }] });
    const live = await session;
    const first = await live.waitFor((m) => Boolean(m.clientContent));
    expect(first.clientContent).toEqual({
      turns: [{ role: "user", parts: [{ text: "معايا ستة آلاف" }] }, { role: "model", parts: [{ text: "تمام" }] }],
      turnComplete: true,
    });
  });

  it("never tries another key after a quota refusal: limits are per project", async () => {
    const quota = await FakeGeminiLive.start({ quotaKeys: ["quota-key"] });
    const failures: number[] = [];
    engine = new GeminiLiveEngine({ apiKeys: ["quota-key", "good-key"], url: quota.url, onKeyFailure: (index) => failures.push(index) });
    await expect(engine.connect(setup)).rejects.toThrow("provider_quota");
    expect(failures).toEqual([0]);
    expect(quota.connections.map((connection) => connection.apiKey)).toEqual(["quota-key"]);
    await quota.stop();
  });

  it("calls only an explicit quota or rate refusal quota", () => {
    expect(isQuotaRefusal("You exceeded your current quota, please check your plan and billing details.")).toBe(true);
    expect(isQuotaRefusal('{"code":429,"status":"RESOURCE_EXHAUSTED"}')).toBe(true);
    expect(isQuotaRefusal("Internal error encountered.")).toBe(false);
    expect(isQuotaRefusal("")).toBe(false);
  });

  it("answers tool calls with a scheduling hint", async () => {
    engine = new GeminiLiveEngine({ apiKeys: ["good-key"], url: fake.url });
    const events = collect(engine);
    const session = fake.nextSession();
    await engine.connect(setup);
    const live = await session;

    live.sendToolCall([{ id: "c1", name: "money_query", args: { metric: "total" } }]);
    const call = await until(() => events.find((e) => e.type === "tool_calls")) as Extract<EngineEvent, { type: "tool_calls" }>;
    expect(call.calls).toEqual([{ id: "c1", name: "money_query", args: { metric: "total" } }]);

    engine.sendToolResults([{ id: "c1", name: "money_query", response: { ok: true } }]);
    const reply = await live.waitFor((m) => Boolean(m.toolResponse));
    expect(reply.toolResponse?.functionResponses).toEqual([{ id: "c1", name: "money_query", response: { ok: true, scheduling: "WHEN_IDLE" } }]);
  });

  it("moves to a new connection on GoAway, resuming the latest handle", async () => {
    engine = new GeminiLiveEngine({ apiKeys: ["good-key"], url: fake.url });
    const events = collect(engine);
    const first = fake.nextSession();
    await engine.connect(setup);
    const live = await first;

    live.sendResumption("handle-7");
    await until(() => events.find((e) => e.type === "resumption"));
    const second = fake.nextSession();
    live.sendGoAway("10s");
    const next = await second;

    expect(next.setup.sessionResumption).toEqual({ handle: "handle-7" });
    await until(() => events.find((e) => e.type === "reconnected"));
    engine.sendAudio(Buffer.from([5, 6]));
    await next.waitFor((m) => Boolean(m.realtimeInput?.audio));
  });

  it("reconnects after an unexpected close, and reports closed when it has no handle", async () => {
    engine = new GeminiLiveEngine({ apiKeys: ["good-key"], url: fake.url });
    const events = collect(engine);
    const first = fake.nextSession();
    await engine.connect(setup);
    const live = await first;

    live.close(1011);
    const closed = await until(() => events.find((e) => e.type === "closed")) as Extract<EngineEvent, { type: "closed" }>;
    expect(closed.resumable).toBe(false);
  });

  it("does not move on GoAway while a tool answer is owed on this connection", async () => {
    engine = new GeminiLiveEngine({ apiKeys: ["good-key"], url: fake.url });
    const events = collect(engine);
    const first = fake.nextSession();
    await engine.connect(setup);
    const live = await first;
    live.sendResumption("handle-8");
    live.sendToolCall([{ id: "c2", name: "money_query" }]);
    await until(() => events.find((e) => e.type === "tool_calls"));

    live.sendGoAway("30s");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(events.some((e) => e.type === "reconnecting")).toBe(false);

    const second = fake.nextSession();
    engine.sendToolResults([{ id: "c2", name: "money_query", response: { ok: true } }]);
    expect((await second).setup.sessionResumption).toEqual({ handle: "handle-8" });
  });
});
