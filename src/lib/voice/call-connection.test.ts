import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceServerMessage } from "@contracts/voice-protocol";
import { CallConnection, type ConnectionEvents, type SocketLike } from "./call-connection";

class FakeSocket implements SocketLike {
  binaryType = "blob";
  readyState = 0;
  bufferedAmount = 0;
  readonly sent: Array<string | ArrayBufferLike | ArrayBufferView> = [];
  closedWith: number | null = null;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  send(data: string | ArrayBufferLike | ArrayBufferView) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code ?? 1000;
    this.readyState = 3;
  }
  // Test controls
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(message: VoiceServerMessage | ArrayBuffer) {
    this.onmessage?.({ data: message instanceof ArrayBuffer ? message : JSON.stringify(message) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({});
  }
  json(): Array<Record<string, unknown>> {
    return this.sent.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d));
  }
}

function ready(token: string, resumed = false): VoiceServerMessage {
  return { type: "ready", callId: "vc_call00001", resumeToken: token, codec: "pcm16", maxSeconds: 600, resumed };
}

describe("CallConnection", () => {
  let sockets: FakeSocket[];
  let events: {
    ready: ReturnType<typeof vi.fn<ConnectionEvents["ready"]>>;
    message: ReturnType<typeof vi.fn<ConnectionEvents["message"]>>;
    audio: ReturnType<typeof vi.fn<ConnectionEvents["audio"]>>;
    reconnecting: ReturnType<typeof vi.fn<ConnectionEvents["reconnecting"]>>;
    closed: ReturnType<typeof vi.fn<ConnectionEvents["closed"]>>;
    rtt: ReturnType<typeof vi.fn<NonNullable<ConnectionEvents["rtt"]>>>;
  };
  let connection: CallConnection;
  const latest = () => sockets[sockets.length - 1];

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    events = {
      ready: vi.fn<ConnectionEvents["ready"]>(),
      message: vi.fn<ConnectionEvents["message"]>(),
      audio: vi.fn<ConnectionEvents["audio"]>(),
      reconnecting: vi.fn<ConnectionEvents["reconnecting"]>(),
      closed: vi.fn<ConnectionEvents["closed"]>(),
      rtt: vi.fn<NonNullable<ConnectionEvents["rtt"]>>(),
    };
    connection = new CallConnection({
      url: "wss://example.test/api/voice/v2",
      client: "android",
      events,
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
  });

  afterEach(() => {
    connection.dispose();
    vi.useRealTimers();
  });

  it("opens with the ticket, forwards audio once live, and pings", () => {
    connection.open("tk_ticket000001");
    latest().open();
    expect(latest().json()[0]).toEqual({ type: "hello", v: 2, codecs: ["pcm16"], client: "android", ticket: "tk_ticket000001" });
    latest().receive(new ArrayBuffer(4));
    expect(events.audio).not.toHaveBeenCalled();

    latest().receive(ready("rt_token000001"));
    expect(events.ready).toHaveBeenCalledOnce();
    latest().receive(new ArrayBuffer(4));
    expect(events.audio).toHaveBeenCalledOnce();
    expect(connection.sendAudio(new Int16Array(320))).toBe(true);

    vi.advanceTimersByTime(10_000);
    const ping = latest().json().find((m) => m.type === "ping");
    expect(ping).toBeDefined();
    latest().receive({ type: "pong", t: ping!.t as number });
    expect(events.rtt).toHaveBeenCalled();
  });

  it("comes back after a drop with the latest resume token", () => {
    connection.open("tk_ticket000001");
    latest().open();
    latest().receive(ready("rt_token000001"));
    latest().drop();
    expect(events.reconnecting).toHaveBeenCalledOnce();
    expect(connection.sendAudio(new Int16Array(320))).toBe(false);

    vi.advanceTimersByTime(0);
    expect(sockets).toHaveLength(2);
    latest().open();
    expect(latest().json()[0]).toMatchObject({ type: "hello", resume: { callId: "vc_call00001", token: "rt_token000001" } });
    latest().receive(ready("rt_token000002", true));
    expect(events.ready).toHaveBeenCalledTimes(2);

    latest().drop();
    vi.advanceTimersByTime(0);
    latest().open();
    expect(latest().json()[0]).toMatchObject({ resume: { token: "rt_token000002" } });
    expect(events.reconnecting).toHaveBeenCalledTimes(2);
  });

  it("gives up when the call cannot be reached within the hold", () => {
    connection.open("tk_ticket000001");
    latest().open();
    latest().receive(ready("rt_token000001"));
    latest().drop();
    for (let i = 0; i < 20 && events.closed.mock.calls.length === 0; i++) {
      vi.advanceTimersByTime(1_000);
      latest().drop();
    }
    vi.advanceTimersByTime(45_000);
    expect(events.closed).toHaveBeenCalledWith({ kind: "lost" });
    expect(sockets.length).toBeLessThan(20);
  });

  it("does not come back after the server ended the call", () => {
    connection.open("tk_ticket000001");
    latest().open();
    latest().receive(ready("rt_token000001"));
    const ended: VoiceServerMessage = { type: "ended", reason: "time_limit", summary: { done: [], notDone: [], billedSeconds: 600 } };
    latest().receive(ended);
    latest().drop();
    vi.advanceTimersByTime(5_000);
    expect(sockets).toHaveLength(1);
    expect(events.closed).toHaveBeenCalledWith({ kind: "ended", message: ended });
  });

  it("stops trying when the server refuses the resume", () => {
    connection.open("tk_ticket000001");
    latest().open();
    latest().receive(ready("rt_token000001"));
    latest().drop();
    vi.advanceTimersByTime(0);
    latest().open();
    latest().receive({ type: "error", code: "ticket", message: "المكالمة خلصت." });
    latest().drop();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(2);
    expect(events.closed.mock.calls[0][0]).toMatchObject({ kind: "refused", error: { code: "ticket" } });
  });

  it("keeps the error as the reason when a call that failed to start is also ended", () => {
    connection.open("tk_ticket000001");
    latest().open();
    latest().receive({ type: "error", code: "provider_unavailable", message: "محرك الصوت مش متاح.", fallback: "chat" });
    latest().receive({ type: "ended", reason: "provider", summary: { done: [], notDone: [], billedSeconds: 0 } });
    latest().drop();
    expect(events.closed.mock.calls[0][0]).toMatchObject({ kind: "refused", error: { code: "provider_unavailable" } });
  });

  it("treats a silent line as dropped", () => {
    connection.open("tk_ticket000001");
    latest().open();
    latest().receive(ready("rt_token000001"));
    vi.advanceTimersByTime(30_000);
    expect(events.reconnecting).toHaveBeenCalledOnce();
    expect(sockets[0].closedWith).toBe(4000);
  });

  it("hangs up and waits for the summary, or closes without it", () => {
    connection.open("tk_ticket000001");
    latest().open();
    latest().receive(ready("rt_token000001"));
    connection.end();
    expect(latest().json().some((m) => m.type === "end")).toBe(true);
    vi.advanceTimersByTime(4_000);
    expect(events.closed).toHaveBeenCalledWith({ kind: "ended", message: null });
  });

  it("hangs up a call that is still connecting as soon as it is ready", () => {
    connection.open("tk_ticket000001");
    latest().open();
    connection.end();
    latest().receive(ready("rt_token000001"));
    expect(events.ready).not.toHaveBeenCalled();
    expect(latest().json().some((m) => m.type === "end")).toBe(true);
  });

  it("retries the first connection while the ticket is unused", () => {
    connection.open("tk_ticket000001");
    latest().drop();
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    latest().open();
    expect(latest().json()[0]).toMatchObject({ ticket: "tk_ticket000001" });
    latest().drop();
    vi.advanceTimersByTime(2_000);
    expect(events.closed).toHaveBeenCalledWith({ kind: "lost" });
  });
});
