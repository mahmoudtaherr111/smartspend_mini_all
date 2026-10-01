/**
 * Load on the call gateway itself, with a fake provider: how many simultaneous calls one Node process carries before
 * its event loop lags, and what each costs in CPU and memory. It measures this server only — never Google's capacity,
 * quota or latency.
 *
 *   npx tsx scripts/voice-eval/load.ts --calls 25,50,100,200 --seconds 30
 *
 * Each simulated call is a real socket to the real gateway (createVoiceSocketHandler, CallSession, GeminiLiveEngine)
 * in a child process: the user speaks 3 s of 16 kHz audio in 20 ms frames, stops, and the fake provider answers with
 * 3 s of 24 kHz audio streamed at real-time pace in 40 ms chunks, with captions, then waits for the next turn. The brain
 * is a stub (no database): the tools' queries are not part of this number.
 */
import "dotenv/config";
import { fork } from "child_process";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { monitorEventLoopDelay } from "perf_hooks";
import WebSocket, { WebSocketServer } from "ws";
import type { CallBrain, CallSessionDeps } from "../../api/services/voice/gateway/call-session";
import { GeminiLiveEngine } from "../../api/services/voice/engine/gemini-live";
import { createVoiceSocketHandler } from "../../api/services/voice/gateway/socket";
import type { TicketPayload } from "../../api/services/voice/gateway/start-call";

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── The clients (child process) ─────────────────────────────────────

async function runClients(url: string, calls: number, seconds: number): Promise<void> {
  const latencies: number[] = [];
  let turns = 0;
  let failures = 0;
  const frame = Buffer.alloc(640); // 20 ms of 16 kHz 16-bit silence-like audio
  for (let i = 0; i < frame.length; i += 2) frame.writeInt16LE(Math.round(2000 * Math.sin(i / 7)), i);
  const deadline = Date.now() + seconds * 1000;
  await Promise.all(Array.from({ length: calls }, async (_, index) => {
    await sleep(Math.random() * 2_000);
    const ws = new WebSocket(url);
    let speechEndAt = 0;
    let waiting: (() => void) | null = null;
    let lastAudioAt = 0;
    ws.on("message", (data, binary) => {
      if (binary) {
        if (speechEndAt) {
          latencies.push(Date.now() - speechEndAt);
          speechEndAt = 0;
        }
        lastAudioAt = Date.now();
        return;
      }
      const message = JSON.parse(data.toString()) as { type: string; state?: string };
      if (message.type === "state" && message.state === "listening" && waiting) {
        const done = waiting;
        waiting = null;
        done();
      }
    });
    const opened = await new Promise<boolean>((resolve) => {
      ws.once("open", () => resolve(true));
      ws.once("error", () => resolve(false));
    });
    if (!opened) {
      failures += 1;
      return;
    }
    ws.send(JSON.stringify({ type: "hello", v: 2, ticket: `tk_load${String(index).padStart(8, "0")}`, codecs: ["pcm16"], client: "web" }));
    await sleep(1_500);
    while (Date.now() < deadline && ws.readyState === WebSocket.OPEN) {
      for (let f = 0; f < 150; f += 1) {
        ws.send(frame);
        await sleep(20);
      }
      const turnDone = new Promise<void>((resolve) => { waiting = resolve; });
      speechEndAt = Date.now();
      ws.send(JSON.stringify({ type: "speech_end" }));
      await Promise.race([turnDone, sleep(15_000)]);
      if (Date.now() - lastAudioAt > 14_000) failures += 1;
      turns += 1;
      await sleep(500);
    }
    ws.send(JSON.stringify({ type: "end" }));
    await sleep(300);
    ws.close();
  }));
  latencies.sort((a, b) => a - b);
  const q = (p: number) => latencies[Math.max(0, Math.ceil(latencies.length * p) - 1)] ?? null;
  process.send?.({ turns, failures, firstAudioP50: q(0.5), firstAudioP95: q(0.95), firstAudioMax: latencies.at(-1) ?? null });
}

// ─── The server and the fake provider (this process) ─────────────────

async function startFakeProvider(): Promise<{ url: string; close(): Promise<void> }> {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const chunk = Buffer.alloc(1_920).toString("base64"); // 40 ms at 24 kHz
  wss.on("connection", (socket) => {
    const send = (message: unknown) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));
    const answer = async () => {
      for (let i = 0; i < 75; i += 1) {
        send({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: chunk } }] }, ...(i % 10 === 0 ? { outputTranscription: { text: "تمام " } } : {}) } });
        await sleep(40);
      }
      send({ serverContent: { turnComplete: true }, usageMetadata: { promptTokenCount: 4000, responseTokenCount: 90, promptTokensDetails: [{ modality: "TEXT", tokenCount: 3900 }, { modality: "AUDIO", tokenCount: 100 }], responseTokensDetails: [{ modality: "AUDIO", tokenCount: 90 }] } });
    };
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as { setup?: unknown; clientContent?: unknown; realtimeInput?: { audioStreamEnd?: boolean } };
      if (message.setup) send({ setupComplete: {} });
      if (message.clientContent || message.realtimeInput?.audioStreamEnd) void answer();
    });
  });
  return { url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`, close: () => new Promise((resolve) => wss.close(() => resolve())) };
}

const stubBrain = (): CallBrain => ({
  async prepare() {
    return { instruction: "load test", tools: [] };
  },
  openingNote: () => "[greet]",
  async runTool() {
    return { response: { ok: true } };
  },
});

async function step(calls: number, seconds: number): Promise<Record<string, unknown>> {
  const provider = await startFakeProvider();
  const states = new Map<string, unknown>();
  const handle = createVoiceSocketHandler({
    sessionDeps: (): CallSessionDeps => ({
      createEngine: () => new GeminiLiveEngine({ apiKeys: ["load-key"], url: provider.url }),
      brain: stubBrain(),
      persistence: { async markLive() {}, async checkpoint() {}, async finalize() {}, async incident() {} },
      saveState: async (id, state) => { states.set(id, state); },
      loadState: async (id) => (states.get(id) as never) ?? null,
      deleteState: async (id) => { states.delete(id); },
      saveTranscript: async () => undefined,
    }),
    takeTicket: async (ticket): Promise<TicketPayload | null> => ({
      callId: `vc_${ticket.slice(3)}`, userId: Number(ticket.slice(7)) + 1, userType: "local", plan: "pro", role: "user",
      model: "gemini-3.8-live", voiceName: "Kore", thinkingLevel: "low", coach: false, maxSeconds: 900, costBudgetUsd: null, client: "web",
    }),
    loadState: async () => null,
  });
  const server = createServer();
  const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
  wss.on("connection", (ws) => handle(ws));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const cpuStart = process.cpuUsage();
  const wallStart = Date.now();
  let rssPeak = process.memoryUsage().rss;
  const rssBase = rssPeak;
  const sampler = setInterval(() => { rssPeak = Math.max(rssPeak, process.memoryUsage().rss); }, 500);
  const child = fork(process.argv[1], ["--role", "clients", "--url", url, "--calls", String(calls), "--seconds", String(seconds)], { execArgv: process.execArgv });
  const clients = await new Promise<Record<string, unknown>>((resolve) => child.once("message", (m) => resolve(m as Record<string, unknown>)));
  clearInterval(sampler);
  delay.disable();
  const cpu = process.cpuUsage(cpuStart);
  const wallMs = Date.now() - wallStart;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const client of wss.clients) client.terminate();
  await provider.close();
  return {
    calls,
    wallSeconds: Math.round(wallMs / 1000),
    serverCpuPercentOfOneCore: Math.round(((cpu.user + cpu.system) / 1000 / wallMs) * 1000) / 10,
    cpuMsPerCallSecond: Math.round(((cpu.user + cpu.system) / 1000 / (calls * seconds)) * 100) / 100,
    rssMbAdded: Math.round((rssPeak - rssBase) / 1_048_576),
    rssKbPerCall: Math.round((rssPeak - rssBase) / 1024 / calls),
    eventLoopDelayP99Ms: Math.round(delay.percentile(99) / 1e6),
    eventLoopDelayMaxMs: Math.round(delay.max / 1e6),
    ...clients,
    note: "server + fake provider in this process; clients in a child; stub brain (no database)",
  };
}

async function main(): Promise<void> {
  if (arg("role", "") === "clients") {
    await runClients(arg("url", ""), Number(arg("calls", "10")), Number(arg("seconds", "20")));
    process.exit(0);
  }
  const seconds = Number(arg("seconds", "30"));
  const results = [];
  for (const calls of arg("calls", "25,50,100").split(",").map(Number)) {
    const result = await step(calls, seconds);
    console.log(JSON.stringify(result));
    results.push(result);
  }
  process.exit(0);
}

void main();
