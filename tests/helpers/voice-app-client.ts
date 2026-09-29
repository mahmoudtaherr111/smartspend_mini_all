/**
 * The app's side of a live call in tests: a socket that records every message and audio frame from the server.
 */
import { WebSocket } from "ws";
import type { VoiceServerMessage } from "../../contracts/voice-protocol";

type Json = Record<string, unknown>;

export class AppClient {
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

export async function until<T>(read: () => T | undefined | false, timeoutMs = 4_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (value) return value as T;
    if (Date.now() - started > timeoutMs) throw new Error("until_timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

