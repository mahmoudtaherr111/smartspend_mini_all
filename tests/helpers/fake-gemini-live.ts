/**
 * A stand-in for Google's Live API WebSocket, for tests of the voice engine and gateway. It speaks the parts of
 * BidiGenerateContent the call uses: setup, audio in and out, transcriptions, tool calls and responses, usage,
 * resumption handles, GoAway and interruption. Nothing leaves the machine.
 */
import type { AddressInfo } from "net";
import { WebSocketServer, WebSocket } from "ws";

/** The client messages the call sends to the Live API, as far as tests read them. */
export interface LiveClientMessage {
  setup?: {
    model?: string;
    generationConfig?: { thinkingConfig?: { thinkingLevel?: string } };
    inputAudioTranscription?: object;
    outputAudioTranscription?: object;
    sessionResumption?: { handle?: string };
    contextWindowCompression?: object;
    tools?: Array<{ functionDeclarations: Array<{ name: string; behavior?: string }> }>;
  };
  realtimeInput?: { audio?: { mimeType: string; data: string }; audioStreamEnd?: boolean };
  clientContent?: { turns: Array<{ role: string; parts: Array<{ text: string }> }>; turnComplete?: boolean };
  toolResponse?: { functionResponses: Array<{ id: string; name: string; response: Record<string, unknown> }> };
}

type Json = Record<string, unknown>;

export class FakeLiveConnection {
  readonly received: LiveClientMessage[] = [];
  readonly apiKey: string;
  private waiters: Array<{ predicate: (m: LiveClientMessage) => boolean; resolve: (m: LiveClientMessage) => void }> = [];

  constructor(readonly socket: WebSocket, apiKey: string) {
    this.apiKey = apiKey;
    socket.on("message", (raw) => {
      let message: LiveClientMessage;
      try {
        message = JSON.parse(raw.toString()) as LiveClientMessage;
      } catch {
        return;
      }
      this.received.push(message);
      this.waiters = this.waiters.filter((waiter) => {
        if (!waiter.predicate(message)) return true;
        waiter.resolve(message);
        return false;
      });
    });
  }

  get setup(): NonNullable<LiveClientMessage["setup"]> {
    return this.received.find((m) => m.setup)?.setup ?? {};
  }

  /** Resolves with the first message (already received or future) that matches. */
  waitFor(predicate: (message: LiveClientMessage) => boolean, timeoutMs = 3_000): Promise<LiveClientMessage> {
    const found = this.received.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("fake_live_wait_timeout")), timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  send(message: Json): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  sendAudio(pcm: Buffer, rate = 24_000): void {
    this.send({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: `audio/pcm;rate=${rate}`, data: pcm.toString("base64") } }] } } });
  }

  sendOutputTranscript(text: string): void {
    this.send({ serverContent: { outputTranscription: { text } } });
  }

  sendInputTranscript(text: string): void {
    this.send({ serverContent: { inputTranscription: { text } } });
  }

  sendToolCall(calls: Array<{ id: string; name: string; args?: Json }>): void {
    this.send({ toolCall: { functionCalls: calls.map((call) => ({ args: {}, ...call })) } });
  }

  sendTurnComplete(): void {
    this.send({ serverContent: { turnComplete: true } });
  }

  sendInterrupted(): void {
    this.send({ serverContent: { interrupted: true } });
  }

  sendUsage(usage: { prompt: Record<string, number>; response: Record<string, number>; thoughts?: number }): void {
    const details = (byModality: Record<string, number>) =>
      Object.entries(byModality).map(([modality, tokenCount]) => ({ modality: modality.toUpperCase(), tokenCount }));
    const sum = (byModality: Record<string, number>) => Object.values(byModality).reduce((a, b) => a + b, 0);
    this.send({
      usageMetadata: {
        promptTokenCount: sum(usage.prompt),
        responseTokenCount: sum(usage.response),
        thoughtsTokenCount: usage.thoughts ?? 0,
        promptTokensDetails: details(usage.prompt),
        responseTokensDetails: details(usage.response),
      },
    });
  }

  sendResumption(handle: string): void {
    this.send({ sessionResumptionUpdate: { newHandle: handle, resumable: true } });
  }

  sendGoAway(timeLeft = "10s"): void {
    this.send({ goAway: { timeLeft } });
  }

  close(code = 1000): void {
    this.socket.close(code);
  }
}

export class FakeGeminiLive {
  readonly connections: FakeLiveConnection[] = [];
  private waiters: Array<(connection: FakeLiveConnection) => void> = [];

  private constructor(
    private readonly server: WebSocketServer,
    private readonly options: { rejectKeys: string[]; completeSetup: boolean },
  ) {
    server.on("connection", (socket, request) => {
      const apiKey = String(request.headers["x-goog-api-key"] ?? "");
      const connection = new FakeLiveConnection(socket, apiKey);
      this.connections.push(connection);
      void connection.waitFor((m) => Boolean(m.setup), 5_000).then(() => {
        if (this.options.rejectKeys.includes(apiKey)) {
          socket.close(1008, "API key not valid");
          return;
        }
        if (this.options.completeSetup) connection.send({ setupComplete: {} });
        const waiters = this.waiters;
        this.waiters = [];
        for (const resolve of waiters) resolve(connection);
      }).catch(() => undefined);
    });
  }

  static async start(options: Partial<{ rejectKeys: string[]; completeSetup: boolean }> = {}): Promise<FakeGeminiLive> {
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    return new FakeGeminiLive(server, { rejectKeys: options.rejectKeys ?? [], completeSetup: options.completeSetup ?? true });
  }

  get url(): string {
    const { port } = this.server.address() as AddressInfo;
    return `ws://127.0.0.1:${port}`;
  }

  /** The newest connection whose setup was accepted, waiting for the next one when `fresh`. */
  nextSession(timeoutMs = 3_000): Promise<FakeLiveConnection> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("fake_live_no_session")), timeoutMs);
      this.waiters.push((connection) => {
        clearTimeout(timer);
        resolve(connection);
      });
    });
  }

  async stop(): Promise<void> {
    for (const connection of this.connections) connection.socket.terminate();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
