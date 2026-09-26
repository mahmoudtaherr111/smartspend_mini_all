import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LabSessionOptions } from "../scripts/voice-lab/session";

interface FakeSocket extends EventEmitter { sent: Record<string, unknown>[]; readyState: number; terminated: boolean }
const sockets = vi.hoisted(() => [] as FakeSocket[]);
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  return { default: class extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    sent: Record<string, unknown>[] = [];
    terminated = false;
    constructor() { super(); sockets.push(this); }
    send(value: string) { this.sent.push(JSON.parse(value)); }
    terminate() { this.terminated = true; }
  } };
});
import { runLabSession } from "../scripts/voice-lab/session";

describe("live session lifecycle", () => {
  beforeEach(() => { vi.useFakeTimers(); sockets.length = 0; });
  afterEach(() => vi.useRealTimers());
  const options = (): LabSessionOptions => ({
    apiKey: "test", model: "gemini-3.8-live", apiVersion: "v1beta", thinking: "low",
    compression: false, triggerTokens: 4096, targetTokens: 2048, systemInstruction: "synthetic",
    turns: [{ id: "one", text: "صرفت كام؟" }, { id: "two", text: "طب امبارح؟" }], toolHandler: () => ({ value: 10 }),
  });
  const message = (value: unknown) => sockets[0].emit("message", Buffer.from(JSON.stringify(value)));
  const audio = () => message({ serverContent: { modelTurn: { parts: [{ inlineData: {
    data: Buffer.alloc(480).toString("base64"), mimeType: "audio/pcm;rate=24000",
  } }] } } });
  const done = () => message({ serverContent: { turnComplete: true } });
  const start = (overrides: Partial<LabSessionOptions> = {}) => {
    const promise = runLabSession({ ...options(), ...overrides });
    sockets[0].emit("open");
    message({ setupComplete: {} });
    return promise;
  };
  it("keeps late usage on the previous turn and sends no turn on generationComplete", async () => {
    const promise = start();
    audio();
    message({ serverContent: { generationComplete: true } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(sockets[0].sent.filter(m => m.clientContent)).toHaveLength(1);
    done();
    await vi.advanceTimersByTimeAsync(1000);
    message({ usageMetadata: { promptTokenCount: 123, responseTokenCount: 12 } });
    await vi.advanceTimersByTimeAsync(1300);
    expect(sockets[0].sent.filter(m => m.clientContent)).toHaveLength(2);
    audio(); done();
    await vi.advanceTimersByTimeAsync(1300);
    const result = await promise;
    expect(result.status).toBe("completed");
    expect(result.measurements[0].usage[0].prompt).toBe(123);
    expect(result.measurements[1].usage).toEqual([]);
    expect(sockets[0].terminated).toBe(true);
  });
  it("waits for the actual tool answer audio across a tool-only turnComplete", async () => {
    const promise = start({ turns: [options().turns[0]] });
    message({ toolCall: { functionCalls: [{ id: "call-1", name: "money_query", args: {} }] } });
    done();
    await vi.advanceTimersByTimeAsync(3000);
    expect(sockets[0].terminated).toBe(false);
    expect(sockets[0].sent.filter(m => m.toolResponse)).toHaveLength(1);
    audio(); done();
    await vi.advanceTimersByTimeAsync(1300);
    expect((await promise).status).toBe("completed");
  });
  it("waits for nested IDLE for extended thinking", async () => {
    const promise = start({ model: "gemini-3.8-live-extended-thinking", turns: [options().turns[0]] });
    audio(); done();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sockets[0].terminated).toBe(false);
    message({ serverContent: { interactionStatus: "IDLE" } });
    await vi.advanceTimersByTimeAsync(1300);
    expect((await promise).status).toBe("completed");
  });
  it("reports a premature close as failure even without a completed turn", async () => {
    const promise = start();
    sockets[0].emit("close", 1007, "do not expose secret or provider content");
    expect(await promise).toMatchObject({ status: "failed", failure: "closed_1007" });
  });
  it("times out a handshake and records no invented zero-cost turn", async () => {
    const promise = runLabSession({ ...options(), sessionTimeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await promise).toMatchObject({ status: "failed", failure: "session_timeout", measurements: [] });
  });
  it("stops a runaway tool loop without hitting a real application", async () => {
    const promise = start();
    message({ toolCall: { functionCalls: Array.from({ length: 9 }, (_, i) => ({ id: `call-${i}`, name: "query", args: {} })) } });
    expect(await promise).toMatchObject({ status: "failed", failure: "tool_budget_exceeded" });
  });
});
