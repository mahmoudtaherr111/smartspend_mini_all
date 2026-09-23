/**
 * The app's end of the call's socket (contracts/voice-protocol.ts). It opens the call with the ticket from
 * `voice.startCall`, keeps the line checked with a ping, and when the network drops it comes back within the time
 * the server holds the call, with the resume token of the latest `ready`. Only an `ended` or `error` from the
 * server, or the user hanging up, closes the call for good.
 */
import {
  VOICE_PROTOCOL_VERSION,
  VOICE_RESUME_GRACE_MS,
  type VoiceClientMessage,
  type VoiceClientPlatform,
  type VoiceServerMessage,
} from "@contracts/voice-protocol";

/** The parts of a browser WebSocket the connection uses. */
export interface SocketLike {
  binaryType: string;
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string | ArrayBufferLike | ArrayBufferView): void;
  close(code?: number): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

type ReadyMessage = Extract<VoiceServerMessage, { type: "ready" }>;
type EndedMessage = Extract<VoiceServerMessage, { type: "ended" }>;
type ErrorMessage = Extract<VoiceServerMessage, { type: "error" }>;
type HelloMessage = Extract<VoiceClientMessage, { type: "hello" }>;

export type ConnectionClose =
  /** The call ended: the server's `ended` when it arrived, null when the user hung up without it. */
  | { kind: "ended"; message: EndedMessage | null }
  | { kind: "refused"; error: ErrorMessage }
  /** The network dropped and the call could not be reached again in time. */
  | { kind: "lost" };

export interface ConnectionEvents {
  ready(message: ReadyMessage): void;
  /** Every server message except `ready` and `pong`. */
  message(message: VoiceServerMessage): void;
  audio(pcm: ArrayBuffer): void;
  /** The line dropped; the connection is trying to reach the call again. */
  reconnecting(): void;
  closed(outcome: ConnectionClose): void;
  rtt?(ms: number): void;
}

export interface ConnectionOptions {
  url: string;
  client: VoiceClientPlatform;
  events: ConnectionEvents;
  createSocket?: (url: string) => SocketLike;
  /** How long after a drop the call can still be reached; a little under the server's hold. */
  graceMs?: number;
  pingEveryMs?: number;
  /** A line that has said nothing for this long is dead, even if the browser has not noticed. */
  silenceLimitMs?: number;
  attemptTimeoutMs?: number;
  endTimeoutMs?: number;
  maxBufferedBytes?: number;
}

const SOCKET_OPEN = 1;
const BACKOFF_MS = [0, 1_000, 2_000, 3_000, 5_000];

function browserSocket(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}

export class CallConnection {
  private socket: SocketLike | null = null;
  private phase: "idle" | "connecting" | "live" | "reconnecting" | "closed" = "idle";
  private callId: string | null = null;
  private resumeToken: string | null = null;
  private ticket: string | null = null;
  private openedAt = 0;
  private helloSent = false;
  private droppedAt = 0;
  private attempt = 0;
  private final: ConnectionClose | null = null;
  private ending = false;
  private lastHeard = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attemptTimer: ReturnType<typeof setTimeout> | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: ConnectionOptions) {}

  get state(): "idle" | "connecting" | "live" | "reconnecting" | "closed" {
    return this.phase;
  }

  get id(): string | null {
    return this.callId;
  }

  /** Opens a new call with a ticket from `voice.startCall`. */
  open(ticket: string): void {
    if (this.phase !== "idle") return;
    this.ticket = ticket;
    this.openedAt = Date.now();
    this.phase = "connecting";
    this.connect();
  }

  private hello(): HelloMessage {
    const base: Omit<HelloMessage, "ticket" | "resume"> = {
      type: "hello",
      v: VOICE_PROTOCOL_VERSION,
      codecs: ["pcm16"],
      client: this.options.client,
    };
    return this.callId && this.resumeToken
      ? { ...base, resume: { callId: this.callId, token: this.resumeToken } }
      : { ...base, ticket: this.ticket ?? "" };
  }

  private connect(): void {
    const socket = (this.options.createSocket ?? browserSocket)(this.options.url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.helloSent = false;
    socket.onopen = () => {
      if (socket !== this.socket) return;
      socket.send(JSON.stringify(this.hello()));
      this.helloSent = true;
    };
    socket.onmessage = (event) => this.onSocketMessage(socket, event.data);
    socket.onclose = () => {
      if (socket === this.socket) this.onDrop();
    };
    socket.onerror = () => undefined;
    this.armAttemptTimer(socket);
  }

  /** A connection that makes no progress is abandoned; any message from the server counts as progress. */
  private armAttemptTimer(socket: SocketLike): void {
    if (this.attemptTimer) clearTimeout(this.attemptTimer);
    this.attemptTimer = setTimeout(() => {
      if (socket === this.socket && this.phase !== "live") this.abandon(socket);
    }, this.options.attemptTimeoutMs ?? 15_000);
  }

  private onSocketMessage(socket: SocketLike, data: unknown): void {
    if (socket !== this.socket) return;
    this.lastHeard = Date.now();
    if (data instanceof ArrayBuffer) {
      if (this.phase === "live") this.options.events.audio(data);
      return;
    }
    if (typeof data !== "string") return;
    let message: VoiceServerMessage;
    try {
      message = JSON.parse(data) as VoiceServerMessage;
    } catch {
      return;
    }
    if (this.phase !== "live") this.armAttemptTimer(socket);
    switch (message.type) {
      case "ready":
        if (this.attemptTimer) clearTimeout(this.attemptTimer);
        this.attemptTimer = null;
        this.callId = message.callId;
        this.resumeToken = message.resumeToken;
        this.phase = "live";
        this.attempt = 0;
        this.droppedAt = 0;
        this.startPing(socket);
        // Hung up while the server was still opening the call: end it now that it can hear us.
        if (this.ending) this.sendEnd();
        else this.options.events.ready(message);
        return;
      case "pong":
        this.options.events.rtt?.(Date.now() - message.t);
        return;
      case "ended":
        // A call that failed to start says why in an `error` first; that stays the reason.
        if (this.final?.kind !== "refused") this.final = { kind: "ended", message };
        this.options.events.message(message);
        return;
      case "error":
        this.final = { kind: "refused", error: message };
        this.options.events.message(message);
        return;
      default:
        this.options.events.message(message);
    }
  }

  private startPing(socket: SocketLike): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const every = this.options.pingEveryMs ?? 10_000;
    const limit = this.options.silenceLimitMs ?? 25_000;
    this.pingTimer = setInterval(() => {
      if (socket !== this.socket) return;
      if (Date.now() - this.lastHeard > limit) {
        this.abandon(socket);
        return;
      }
      if (socket.readyState === SOCKET_OPEN) socket.send(JSON.stringify({ type: "ping", t: Date.now() }));
    }, every);
  }

  /** Drops a socket without waiting for the browser to notice it is dead. */
  private abandon(socket: SocketLike): void {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close(4000);
    } catch {
      // Already closed.
    }
    if (socket === this.socket) this.onDrop();
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.attemptTimer) clearTimeout(this.attemptTimer);
    if (this.endTimer) clearTimeout(this.endTimer);
    this.pingTimer = this.retryTimer = this.attemptTimer = this.endTimer = null;
  }

  private onDrop(): void {
    this.socket = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.attemptTimer) clearTimeout(this.attemptTimer);
    this.pingTimer = this.attemptTimer = null;
    if (this.phase === "closed") return;
    if (this.final) return this.finish(this.final);
    if (this.ending) return this.finish({ kind: "ended", message: null });

    const now = Date.now();
    if (!this.callId || !this.resumeToken) {
      // Never reached the call. The ticket is still unused if the hello never left, so try again while it is fresh.
      if (!this.helloSent && now - this.openedAt < 45_000) {
        this.retryTimer = setTimeout(() => this.connect(), BACKOFF_MS[Math.min(++this.attempt, BACKOFF_MS.length - 1)]);
        return;
      }
      return this.finish({ kind: "lost" });
    }

    if (!this.droppedAt) {
      this.droppedAt = now;
      this.phase = "reconnecting";
      this.options.events.reconnecting();
    }
    const left = this.droppedAt + (this.options.graceMs ?? VOICE_RESUME_GRACE_MS - 3_000) - now;
    if (left <= 0) return this.finish({ kind: "lost" });
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, Math.min(delay, left));
  }

  private finish(outcome: ConnectionClose): void {
    if (this.phase === "closed") return;
    this.phase = "closed";
    this.clearTimers();
    this.options.events.closed(outcome);
  }

  /** The network came back or the app came to the front: try the call again now instead of waiting. */
  retryNow(): void {
    if (this.phase !== "reconnecting" || this.socket || !this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.connect();
  }

  send(message: VoiceClientMessage): boolean {
    const socket = this.socket;
    if (this.phase !== "live" || !socket || socket.readyState !== SOCKET_OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  /** One frame of 16 kHz PCM. Dropped while the line is down or badly backed up. */
  sendAudio(pcm: ArrayBufferView): boolean {
    const socket = this.socket;
    if (this.phase !== "live" || !socket || socket.readyState !== SOCKET_OPEN) return false;
    if (socket.bufferedAmount > (this.options.maxBufferedBytes ?? 256 * 1024)) return false;
    socket.send(pcm);
    return true;
  }

  private sendEnd(): boolean {
    if (!this.send({ type: "end" })) return false;
    this.armEndTimer();
    return true;
  }

  private armEndTimer(): void {
    const socket = this.socket;
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => {
      if (socket && socket === this.socket) this.abandon(socket);
      else this.finish({ kind: "ended", message: null });
    }, this.options.endTimeoutMs ?? 4_000);
  }

  /** Hangs up: the server ends the call and answers with its summary, or the call closes without it. */
  end(): void {
    if (this.phase === "closed" || this.ending) return;
    this.ending = true;
    if (this.phase === "connecting" && this.helloSent && this.socket) {
      // The server is opening the call; it is ended the moment it is ready.
      this.armEndTimer();
      return;
    }
    if (this.sendEnd()) return;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close(1000);
    }
    this.finish({ kind: "ended", message: null });
  }

  /** Forgets the call without telling anyone (the screen went away). */
  dispose(): void {
    this.phase = "closed";
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      try {
        socket.close(1000);
      } catch {
        // Already closed.
      }
    }
  }
}
