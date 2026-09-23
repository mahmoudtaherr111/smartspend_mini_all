import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { VoiceServerMessage } from "../../../../contracts/voice-protocol";
import { FakeGeminiLive } from "../../../../tests/helpers/fake-gemini-live";
import { GeminiLiveEngine } from "../engine/gemini-live";
import type { CallBrain, CallSessionDeps, StoredCall } from "./call-session";
import type { CallFinal, CallPersistence, CallProgress } from "./persistence";
import { createVoiceSocketHandler } from "./socket";
import type { TicketPayload } from "./start-call";
import type { TranscriptLine } from "./store";

type Json = Record<string, unknown>;

class AppClient {
  readonly messages: VoiceServerMessage[] = [];
  readonly audio: Buffer[] = [];
  closed = false;
  private constructor(readonly ws: WebSocket) {
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) this.audio.push(data);
      else this.messages.push(JSON.parse(data.toString()));
    });
    ws.on("close", () => {
      this.closed = true;
    });
  }
  static async connect(url: string): Promise<AppClient> {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    return new AppClient(ws);
  }
  send(message: Json) {
    this.ws.send(JSON.stringify(message));
  }
  async waitFor<T extends VoiceServerMessage["type"]>(type: T, timeoutMs = 4_000): Promise<Extract<VoiceServerMessage, { type: T }>> {
    const started = Date.now();
    for (;;) {
      const found = this.messages.find((m) => m.type === type);
      if (found) return found as Extract<VoiceServerMessage, { type: T }>;
      if (Date.now() - started > timeoutMs) throw new Error(`no ${type}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

async function until<T>(read: () => T | undefined | false, timeoutMs = 4_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (value) return value as T;
    if (Date.now() - started > timeoutMs) throw new Error("until_timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const tickets = new Map<string, TicketPayload>();
const states = new Map<string, StoredCall>();
const transcripts = new Map<string, TranscriptLine[]>();
const rows = { live: [] as string[], checkpoints: [] as CallProgress[], finals: [] as CallFinal[], incidents: [] as string[] };

const persistence: CallPersistence = {
  async markLive(callId) { rows.live.push(callId); },
  async checkpoint(_callId, progress) { rows.checkpoints.push(progress); },
  async finalize(_callId, final) { rows.finals.push(final); },
  async incident(_call, kind) { rows.incidents.push(kind); },
};

function fakeBrain(): CallBrain {
  let executed = false;
  return {
    async prepare() {
      return { instruction: "انت سمارت", tools: [{ name: "money_query", description: "numbers", parameters: { type: "object", properties: {} } }] };
    },
    openingNote: (resumed) => (resumed ? "[continue]" : "[greet]"),
    async runTool(call) {
      executed = true;
      return {
        response: { ok: true, total: 320, spoken: "تلتمية وعشرين" },
        card: { kind: "fact", id: call.id, title: "النهارده", items: [{ label: "المصروف", value: 320 }] },
      };
    },
    summary: () => ({ done: executed ? ["سؤال عن النهارده"] : [], notDone: [] }),
  };
}

function payload(overrides: Partial<TicketPayload> = {}): TicketPayload {
  return {
    callId: `vc_test${Math.random().toString(36).slice(2, 12)}`,
    userId: 7, userType: "local", plan: "pro", role: "user",
    model: "gemini-3.8-live", voiceName: "Kore", thinkingLevel: "low",
    maxSeconds: 120, costBudgetUsd: null, client: "web",
    ...overrides,
  };
}

describe("the /api/voice/v2 socket", () => {
  let fake: FakeGeminiLive;
  let server: Server;
  let url: string;
  let graceMs = 2_000;

  beforeEach(async () => {
    tickets.clear();
    states.clear();
    transcripts.clear();
    rows.live = [];
    rows.checkpoints = [];
    rows.finals = [];
    rows.incidents = [];
    graceMs = 2_000;
    fake = await FakeGeminiLive.start();
    const sessionDeps = (): CallSessionDeps => ({
      createEngine: () => new GeminiLiveEngine({ apiKeys: ["test-key"], url: fake.url }),
      brain: fakeBrain(),
      persistence,
      saveState: async (callId, state) => { states.set(callId, JSON.parse(JSON.stringify(state))); },
      loadState: async (callId) => states.get(callId) ?? null,
      deleteState: async (callId) => { states.delete(callId); },
      saveTranscript: async (callId, lines) => { transcripts.set(callId, lines); },
      graceMs,
      checkpointMs: 200,
    });
    const handle = createVoiceSocketHandler({
      sessionDeps,
      takeTicket: async (ticket) => {
        const found = tickets.get(ticket) ?? null;
        tickets.delete(ticket);
        return found;
      },
      loadState: async (callId) => states.get(callId) ?? null,
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

  async function startCall(p = payload()) {
    const ticket = `tk_${Math.random().toString(36).slice(2, 14)}`;
    tickets.set(ticket, p);
    const session = fake.nextSession();
    const app = await AppClient.connect(url);
    app.send({ type: "hello", v: 2, ticket, codecs: ["pcm16"], client: "android" });
    const ready = await app.waitFor("ready");
    const live = await session;
    return { app, live, ready, payload: p };
  }

  it("opens a call on a ticket, greets, answers a tool call and ends with a summary", async () => {
    const { app, live, ready, payload: p } = await startCall();
    expect(ready).toMatchObject({ callId: p.callId, codec: "pcm16", maxSeconds: 120, resumed: false });
    expect(live.setup.inputAudioTranscription).toEqual({});
    await live.waitFor((m) => m.clientContent?.turns?.[0]?.parts?.[0]?.text === "[greet]");
    expect(rows.live).toEqual([p.callId]);

    app.ws.send(Buffer.alloc(640), { binary: true });
    await live.waitFor((m) => Boolean(m.realtimeInput?.audio));
    app.send({ type: "speech_end" });
    await live.waitFor((m) => m.realtimeInput?.audioStreamEnd === true);

    live.sendInputTranscript("صرفت كام النهارده");
    live.sendToolCall([{ id: "t1", name: "money_query", args: { metric: "total", period: "today" } }]);
    const card = await app.waitFor("card");
    expect(card.card).toMatchObject({ kind: "fact", items: [{ label: "المصروف", value: 320 }] });
    const toolReply = await live.waitFor((m) => Boolean(m.toolResponse));
    expect(toolReply.toolResponse?.functionResponses[0]).toMatchObject({ id: "t1", response: { ok: true, total: 320 } });

    live.sendAudio(Buffer.from([1, 2, 3, 4]));
    live.sendOutputTranscript("تلتمية وعشرين");
    live.sendTurnComplete();
    await until(() => app.audio.length > 0);
    await until(() => app.messages.some((m) => m.type === "caption" && m.role === "assistant"));

    app.send({ type: "end" });
    const ended = await app.waitFor("ended");
    expect(ended.reason).toBe("user");
    expect(ended.summary?.done).toEqual(["سؤال عن النهارده"]);
    await until(() => rows.finals.length === 1);
    expect(rows.finals[0]).toMatchObject({ endReason: "user", memoryStatus: "pending", toolCalls: 1, failed: false });
    expect(transcripts.get(p.callId)).toEqual([
      { role: "user", text: "صرفت كام النهارده" },
      { role: "assistant", text: "تلتمية وعشرين" },
    ]);
    expect(states.has(p.callId)).toBe(false);
  });

  it("refuses a ticket used twice", async () => {
    const p = payload();
    tickets.set("tk_once_only_0001", p);
    const first = await AppClient.connect(url);
    first.send({ type: "hello", v: 2, ticket: "tk_once_only_0001", codecs: ["pcm16"], client: "web" });
    await first.waitFor("ready");
    const second = await AppClient.connect(url);
    second.send({ type: "hello", v: 2, ticket: "tk_once_only_0001", codecs: ["pcm16"], client: "web" });
    expect((await second.waitFor("error")).code).toBe("ticket");
    first.send({ type: "end" });
    await first.waitFor("ended");
  });

  it("keeps a dropped call and resumes it on the provider's handle", async () => {
    const { app, live, ready } = await startCall();
    live.sendResumption("handle-42");
    await until(() => states.get(ready.callId)?.handle === "handle-42" || undefined, 1_500).catch(() => undefined);
    // The handle is saved with the state when the app drops.
    app.ws.close();
    await until(() => states.get(ready.callId)?.handle === "handle-42");
    await until(() => rows.checkpoints.some((c) => c.status === "reconnecting"));

    const resumedSession = fake.nextSession();
    const again = await AppClient.connect(url);
    again.send({ type: "hello", v: 2, resume: { callId: ready.callId, token: ready.resumeToken }, codecs: ["pcm16"], client: "android" });
    const readyAgain = await again.waitFor("ready");
    expect(readyAgain).toMatchObject({ callId: ready.callId, resumed: true });
    expect(readyAgain.resumeToken).not.toBe(ready.resumeToken);
    const next = await resumedSession;
    expect(next.setup.sessionResumption).toEqual({ handle: "handle-42" });
    await next.waitFor((m) => m.clientContent?.turns?.[0]?.parts?.[0]?.text === "[continue]");

    again.send({ type: "end" });
    await again.waitFor("ended");
    expect(rows.finals[0]).toMatchObject({ endReason: "user", reconnects: 1 });
  });

  it("refuses a resume with the wrong token", async () => {
    const { app, ready } = await startCall();
    app.ws.close();
    await until(() => states.has(ready.callId));
    const intruder = await AppClient.connect(url);
    intruder.send({ type: "hello", v: 2, resume: { callId: ready.callId, token: "rt_not_the_right_token" }, codecs: ["pcm16"], client: "web" });
    expect((await intruder.waitFor("error")).code).toBe("ticket");
  });

  it("ends a dropped call for the network when nobody comes back", async () => {
    graceMs = 300;
    const { app } = await startCall();
    app.ws.close();
    await until(() => rows.finals.length === 1);
    expect(rows.finals[0].endReason).toBe("network");
  });

  it("ends the call at its time limit", async () => {
    const { app } = await startCall(payload({ maxSeconds: 1 }));
    const ended = await app.waitFor("ended", 5_000);
    expect(ended.reason).toBe("time_limit");
    expect(rows.finals[0].billedSeconds).toBeGreaterThanOrEqual(1);
  });
});
