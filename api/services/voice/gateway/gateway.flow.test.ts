/**
 * How a call's turns flow over a real socket: tool answers sent as each is ready, the screen's state following the
 * work rather than a timer, the extended-thinking model's IN_PROGRESS and IDLE, app notes that wait for the model
 * to be idle, and a slow write that is never reported as failed.
 */
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import type { VoiceCard } from "../../../../contracts/voice-protocol";
import { FakeGeminiLive, type FakeLiveConnection } from "../../../../tests/helpers/fake-gemini-live";
import { AppClient, until } from "../../../../tests/helpers/voice-app-client";
import { claimsFailure, LOST_CALL_RETRY_NOTE } from "../brain/claims";
import { GeminiLiveEngine } from "../engine/gemini-live";
import type { CallBrain, CallSessionDeps, StoredCall, ToolRunOutcome } from "./call-session";
import type { CallPersistence } from "./persistence";
import { createVoiceSocketHandler } from "./socket";
import type { TicketPayload } from "./start-call";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tools by name: how long each takes and what it answers. */
type ToolPlan = Record<string, { ms: number; outcome: ToolRunOutcome }>;

function brainFor(tools: ToolPlan, cardNote = "(ملاحظة من التطبيق: المستخدم أكد من الشاشة.)"): CallBrain {
  return {
    async prepare() {
      return { instruction: "انت سمارت", tools: Object.keys(tools).map((name) => ({ name, description: name, parameters: { type: "object", properties: {} } })) };
    },
    openingNote: () => "[greet]",
    modeNote: (mode) => `[mode:${mode}]`,
    writes: (name) => name === "confirm",
    claimsFailure,
    lostToolCallNote: (retry) => (retry ? LOST_CALL_RETRY_NOTE : "[give up]"),
    forgotten: () => ["مرتبه بينزل يوم 25"],
    async runTool(call) {
      const plan = tools[call.name];
      await delay(plan.ms);
      return plan.outcome;
    },
    async onCardAction(_action, draftId) {
      const card: VoiceCard = { kind: "draft", draftId, title: "تسجيل", items: [], status: "executed", expiresAt: new Date().toISOString() };
      return { card, note: cardNote };
    },
  };
}

const incidents: string[] = [];
const persistence: CallPersistence = {
  async markLive() {},
  async checkpoint() {},
  async finalize() {},
  async incident(_call, kind) { incidents.push(kind); },
};

describe("a call's turns", () => {
  let fake: FakeGeminiLive;
  let server: Server;
  let url: string;
  let tools: ToolPlan = {};
  const tickets = new Map<string, TicketPayload>();
  const saved = new Map<string, Array<{ role: string; text: string }>>();
  const states = new Map<string, StoredCall>();

  beforeEach(async () => {
    incidents.length = 0;
    fake = await FakeGeminiLive.start();
    const sessionDeps = (): CallSessionDeps => ({
      createEngine: () => new GeminiLiveEngine({ apiKeys: ["test-key"], url: fake.url }),
      brain: brainFor(tools),
      persistence,
      saveState: async (callId, state) => { states.set(callId, JSON.parse(JSON.stringify(state))); },
      loadState: async (callId) => states.get(callId) ?? null,
      deleteState: async (callId) => { states.delete(callId); },
      saveTranscript: async (callId, lines) => { saved.set(callId, lines); },
      replyWaitMs: 150,
      toolTimeoutMs: 250,
    });
    const handle = createVoiceSocketHandler({
      sessionDeps,
      takeTicket: async (ticket) => tickets.get(ticket) ?? null,
      loadState: async (callId) => states.get(callId) ?? null,
      silenceLimitMs: 45_000,
    });
    server = createServer();
    const wss = new WebSocketServer({ server });
    wss.on("connection", (ws) => handle(ws));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await fake.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const MODES = {
    standard: { model: "gemini-3.8-live", thinkingLevel: "low" as const },
    ultra: { model: "gemini-3.8-live-extended-thinking", thinkingLevel: "low" as const },
  };

  async function startCall(model = "gemini-3.8-live", modes?: TicketPayload["modes"]): Promise<{ app: AppClient; live: FakeLiveConnection }> {
    const ticket = `tk_${Math.random().toString(36).slice(2, 14)}`;
    tickets.set(ticket, {
      callId: `vc_flow${Math.random().toString(36).slice(2, 12)}`,
      userId: 7, userType: "local", plan: "pro", role: "user",
      model, voiceName: "Kore", thinkingLevel: "high", maxSeconds: 120, costBudgetUsd: null, client: "web",
      coach: true, mode: "standard", modes,
    });
    const session = fake.nextSession();
    const app = await AppClient.connect(url);
    app.send({ type: "hello", v: 2, ticket, codecs: ["pcm16"], client: "web" });
    await app.waitFor("ready");
    const live = await session;
    await live.waitFor((m) => m.clientContent?.turns?.[0]?.parts?.[0]?.text === "[greet]");
    return { app, live };
  }

  const stateLog = (app: AppClient) => app.messages.flatMap((m) => (m.type === "state" ? [m.state] : []));
  const toolAnswers = (live: FakeLiveConnection) =>
    live.received.flatMap((m) => m.toolResponse?.functionResponses.map((r) => r.id) ?? []);
  const notesSent = (live: FakeLiveConnection) =>
    live.received.flatMap((m) => m.clientContent?.turns?.flatMap((t) => t.parts.map((p) => p.text)) ?? []);

  it("saves what the user forgot with the words, for the summary to leave out", async () => {
    tools = {};
    const { app, live } = await startCall();
    app.send({ type: "text", text: "انسى موضوع المرتب" });
    live.sendAudio(Buffer.from([1]));
    live.sendTurnComplete();
    app.send({ type: "end" });
    await app.waitFor("ended");
    const lines = [...saved.values()].at(-1)!;
    expect(lines.at(-1)).toEqual({ role: "forgotten", text: "مرتبه بينزل يوم 25" });
  });

  it("sends a quick answer at once instead of holding it behind a slow one", async () => {
    tools = {
      fast: { ms: 10, outcome: { response: { ok: true, n: 1 } } },
      slow: { ms: 200, outcome: { response: { ok: true, n: 2 } } },
    };
    const { app, live } = await startCall();
    live.sendToolCall([{ id: "slow1", name: "slow" }, { id: "fast1", name: "fast" }]);
    await live.waitFor((m) => Boolean(m.toolResponse?.functionResponses.some((r) => r.id === "fast1")));
    // The fast answer went out alone, while the slow tool still works.
    expect(toolAnswers(live)).toEqual(["fast1"]);
    await live.waitFor((m) => Boolean(m.toolResponse?.functionResponses.some((r) => r.id === "slow1")));
    expect(toolAnswers(live)).toEqual(["fast1", "slow1"]);
    app.send({ type: "end" });
    await app.waitFor("ended");
  });

  it("stays on thinking while a tool outlasts the reply wait, and only then waits for the answer", async () => {
    tools = { slow: { ms: 200, outcome: { response: { ok: true } } } };
    const { app, live } = await startCall();
    app.send({ type: "text", text: "صرفت كام؟" });
    live.sendToolCall([{ id: "s1", name: "slow" }]);
    live.sendTurnComplete();
    // replyWaitMs is 150: the old timer, started at the call, said "listening" here while the tool still worked.
    await delay(180);
    expect(stateLog(app).at(-1)).toBe("thinking");
    await live.waitFor((m) => Boolean(m.toolResponse));
    live.sendAudio(Buffer.from([1, 2]));
    live.sendTurnComplete();
    await until(() => stateLog(app).at(-1) === "listening");
    expect(incidents).not.toContain("no_reply_after_tool");
    app.send({ type: "end" });
    await app.waitFor("ended");
  });

  it("follows the extended-thinking model: speaking a line is not the end of the task, IDLE is", async () => {
    tools = {};
    const { app, live } = await startCall("gemini-3.8-live-extended-thinking");
    app.send({ type: "text", text: "أقدر أشتري موبايل؟" });
    live.sendInteractionStatus("IN_PROGRESS");
    live.sendAudio(Buffer.from([1, 2]));
    // A filler line ends; the model is still working.
    live.sendTurnComplete("IN_PROGRESS");
    await until(() => stateLog(app).at(-1) === "thinking" && stateLog(app).includes("speaking"));
    await delay(50);
    expect(stateLog(app).at(-1)).toBe("thinking");
    live.sendAudio(Buffer.from([3, 4]));
    live.sendTurnComplete("IDLE");
    await until(() => stateLog(app).at(-1) === "listening");
    app.send({ type: "end" });
    await app.waitFor("ended");
  });

  it("holds the note about a tap until the model is idle, instead of cutting it off", async () => {
    tools = {};
    const { app, live } = await startCall("gemini-3.8-live-extended-thinking");
    app.send({ type: "text", text: "سجل خمسين أكل" });
    live.sendInteractionStatus("IN_PROGRESS");
    live.sendAudio(Buffer.from([1, 2]));
    app.send({ type: "confirm", draftId: "dr_abcdefgh" });
    await app.waitFor("card");
    await delay(50);
    // Sent now it would be a complete user turn, which stops the sentence being spoken.
    expect(notesSent(live)).not.toContain("(ملاحظة من التطبيق: المستخدم أكد من الشاشة.)");
    live.sendTurnComplete("IDLE");
    await live.waitFor((m) => m.clientContent?.turns?.[0]?.parts?.[0]?.text === "(ملاحظة من التطبيق: المستخدم أكد من الشاشة.)");
    app.send({ type: "end" });
    await app.waitFor("ended");
  });

  it("keeps the extended model's apology for a tool call it lost from the user, and asks for the tool again", async () => {
    tools = { read_balance: { ms: 10, outcome: { response: { ok: true, balance: 5000 } } } };
    const { app, live } = await startCall("gemini-3.8-live-extended-thinking");
    app.send({ type: "text", text: "معايا كام؟" });
    live.sendInteractionStatus("IN_PROGRESS");
    live.sendAudio(Buffer.from([1, 1]));
    live.sendOutputTranscript("هشوفلك الرصيد.");
    live.sendTurnComplete("IN_PROGRESS");
    // No toolCall ever comes; the model apologises for a failure that did not happen.
    live.sendAudio(Buffer.from([9, 9]));
    live.sendOutputTranscript("يا فندم حصل خطأ في النظام");
    await live.waitFor((m) => m.clientContent?.turns?.[0]?.parts?.[0]?.text === LOST_CALL_RETRY_NOTE);
    live.sendAudio(Buffer.from([9, 8]));
    live.sendInterrupted();
    await app.waitFor("interrupted");
    expect(app.audio.map((frame) => [...frame])).toEqual([[1, 1]]);
    const captions = app.messages.flatMap((m) => (m.type === "caption" && m.role === "assistant" ? [m.text] : []));
    expect(captions.join(" ")).not.toContain("خطأ");
    expect(incidents).toContain("lost_tool_call");
    // The retry works: the answer is heard.
    live.sendToolCall([{ id: "r1", name: "read_balance" }]);
    await live.waitFor((m) => Boolean(m.toolResponse));
    live.sendAudio(Buffer.from([5, 5]));
    live.sendOutputTranscript("معاك خمس تلاف.");
    live.sendTurnComplete("IDLE");
    await until(() => app.audio.some((frame) => frame[0] === 5));
    app.send({ type: "end" });
    await app.waitFor("ended");
  });

  it("releases a real answer that follows a filler after a short hold", async () => {
    tools = {};
    const { app, live } = await startCall("gemini-3.8-live-extended-thinking");
    app.send({ type: "text", text: "المرتب بيطير" });
    live.sendInteractionStatus("IN_PROGRESS");
    live.sendAudio(Buffer.from([1, 1]));
    live.sendTurnComplete("IN_PROGRESS");
    live.sendAudio(Buffer.from([2, 2]));
    live.sendOutputTranscript("طيب ");
    await delay(100);
    // Held: too few words yet to tell an answer from an apology.
    expect(app.audio.map((frame) => frame[0])).toEqual([1]);
    live.sendOutputTranscript("خلينا نبص سوا على أكتر حاجة بتصرف عليها");
    await until(() => app.audio.some((frame) => frame[0] === 2));
    expect(incidents).not.toContain("lost_tool_call");
    app.send({ type: "end" });
    await app.waitFor("ended");
  });

  it("tells the model a read answers the request the user replaced while it ran", async () => {
    tools = {
      read_balance: { ms: 150, outcome: { response: { ok: true, balance: 5000 } } },
      read_commitments: { ms: 10, outcome: { response: { ok: true, due: 3000 } } },
    };
    const { app, live } = await startCall();
    app.send({ type: "text", text: "معايا كام؟" });
    live.sendToolCall([{ id: "b1", name: "read_balance" }]);
    await delay(40);
    app.send({ type: "text", text: "لا استنى، قولي الالتزامات بس" });
    await delay(20);
    live.sendToolCall([{ id: "c1", name: "read_commitments" }]);
    const answers = async (id: string) =>
      (await live.waitFor((m) => Boolean(m.toolResponse?.functionResponses.some((r) => r.id === id)))).toolResponse!.functionResponses.find((r) => r.id === id)!.response;
    expect(await answers("c1")).not.toHaveProperty("earlier_request");
    expect(await answers("b1")).toMatchObject({ ok: true, balance: 5000, earlier_request: expect.stringContaining("طلب قبل") });
    app.send({ type: "end" });
    await app.waitFor("ended");
  });

  it("switches a call to Ultra Thinking with its conversation, and tells the app", async () => {
    tools = {};
    const { app, live } = await startCall("gemini-3.8-live", MODES);
    app.send({ type: "text", text: "نفسي أجيب موبايل بتلاتين ألف" });
    live.sendOutputTranscript("حلو، خلينا نشوف.");
    live.sendAudio(Buffer.from([1]));
    live.sendTurnComplete();
    await until(() => app.messages.some((m) => m.type === "caption" && m.role === "assistant"));
    const next = fake.nextSession();
    app.send({ type: "mode", mode: "ultra" });
    const ultra = await next;
    expect((ultra.received[0].setup as { model?: string }).model).toBe("models/gemini-3.8-live-extended-thinking");
    // The new session gets the conversation first, as history, then the note about the switch.
    const history = await ultra.waitFor((m) => Boolean(m.clientContent));
    expect(history.clientContent?.turns.map((t) => [t.role, t.parts[0].text])).toEqual([
      ["user", "نفسي أجيب موبايل بتلاتين ألف"],
      ["model", "حلو، خلينا نشوف."],
    ]);
    await ultra.waitFor((m) => (m.clientContent?.turns?.[0]?.parts?.[0]?.text ?? "") === "[mode:ultra]");
    await until(() => app.messages.some((m) => m.type === "mode" && m.status === "active" && m.mode === "ultra"));
    expect(app.messages.filter((m) => m.type === "mode").map((m) => m.type === "mode" && m.status)).toEqual(["switching", "active"]);
    app.send({ type: "end" });
    await app.waitFor("ended");
    void live;
  });

  it("goes back to the mode it was in, and says so, when the new model cannot connect", async () => {
    tools = {};
    const { app } = await startCall("gemini-3.8-live", MODES);
    fake.rejectModels(["gemini-3.8-live-extended-thinking"]);
    app.send({ type: "text", text: "المرتب بيطير" });
    const back = fake.nextSession(5_000);
    app.send({ type: "mode", mode: "ultra" });
    const standard = await back;
    expect((standard.received[0].setup as { model?: string }).model).toBe("models/gemini-3.8-live");
    await until(() => app.messages.some((m) => m.type === "mode" && m.status === "refused"));
    expect(app.messages.filter((m) => m.type === "mode").at(-1)).toMatchObject({ mode: "standard", status: "refused", message: expect.stringContaining("كملنا عادي") });
    expect(app.messages.some((m) => m.type === "ended")).toBe(false);
    app.send({ type: "end" });
    await app.waitFor("ended");
  });

  it("refuses Ultra Thinking when the call was not offered it", async () => {
    tools = {};
    const { app } = await startCall("gemini-3.8-live", { standard: MODES.standard, ultra: null });
    app.send({ type: "mode", mode: "ultra" });
    await until(() => app.messages.some((m) => m.type === "mode"));
    expect(app.messages.find((m) => m.type === "mode")).toMatchObject({ mode: "standard", status: "refused" });
    expect(fake.connections).toHaveLength(1);
    app.send({ type: "end" });
    await app.waitFor("ended");
  });

  it("never calls a slow write failed: the model hears it is still running, then how it ended", async () => {
    const card: VoiceCard = { kind: "draft", draftId: "dr_abcdefgh", title: "تسجيل", items: [], status: "executed", expiresAt: new Date().toISOString() };
    tools = { confirm: { ms: 400, outcome: { response: { ok: true, done: "اتسجل أكل بخمسين" }, card } } };
    const { app, live } = await startCall();
    live.sendToolCall([{ id: "c1", name: "confirm" }]);
    const first = await live.waitFor((m) => Boolean(m.toolResponse));
    expect(first.toolResponse?.functionResponses[0].response).toMatchObject({ ok: false, error: "still_running" });
    // The write lands after its time limit: the card shows it and the model is told once it is idle.
    await until(() => app.messages.some((m) => m.type === "card" && m.card.kind === "draft" && m.card.status === "executed"));
    live.sendAudio(Buffer.from([1]));
    live.sendTurnComplete();
    await live.waitFor((m) => (m.clientContent?.turns?.[0]?.parts?.[0]?.text ?? "").includes("اتعملت: اتسجل أكل بخمسين"));
    expect(incidents).toContain("tool_slow_write");
    expect(incidents).not.toContain("tool_error");
    app.send({ type: "end" });
    await app.waitFor("ended");
  });
});
