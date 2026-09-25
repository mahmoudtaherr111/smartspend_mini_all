import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/settings-cache", () => ({
  getSystemSettings: vi.fn(async () => ({ ai_api_key: "key-1", ai_api_key_2: "", voice_price_model: "" })),
}));

import { askTextModel } from "./text-model";

function answer(text: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...extra }], usageMetadata: { promptTokenCount: 5 } }));
}

const asked: string[] = [];
let replies: Array<() => Promise<Response>>;

beforeEach(() => {
  asked.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string; signal: AbortSignal }) => {
    asked.push(String(url).match(/models\/([^:]+):/)![1]);
    const next = replies.shift();
    if (!next) throw new Error("no reply");
    return next();
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("askTextModel", () => {
  it("moves to the next model when one is out of quota or overloaded", async () => {
    replies = [async () => new Response("{}", { status: 429 }), async () => new Response("{}", { status: 503 }), async () => answer("ok")];
    const result = await askTextModel({ modelSetting: "voice_price_model", defaultModel: "gemini-3.5-flash-lite", prompt: "p" });
    expect(asked).toEqual(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"]);
    expect(result).toMatchObject({ text: "ok", model: "gemini-3.8-flash" });
  });

  it("fails at once on a bad request, which every model would refuse", async () => {
    replies = [async () => new Response("{}", { status: 400 })];
    await expect(askTextModel({ modelSetting: "voice_price_model", defaultModel: "gemini-3.5-flash-lite", prompt: "p" })).rejects.toThrow("text_model_http_400");
    expect(asked).toHaveLength(1);
  });

  it("asks a slow model's successor, and stops when the caller's time is spent", async () => {
    const slow = () => new Promise<Response>((_, reject) => setTimeout(() => reject(Object.assign(new Error("t"), { name: "TimeoutError" })), 100));
    replies = [slow, slow, slow];
    await expect(askTextModel({
      modelSetting: "voice_price_model", defaultModel: "gemini-3.5-flash-lite", prompt: "p", timeoutMs: 100, deadlineMs: 650,
    })).rejects.toThrow("text_model_timeout");
    // 100 ms each; the third would start with under half a second left.
    expect(asked).toHaveLength(2);
  });

  it("grounds in Google Search when asked, and names the page it came from", async () => {
    replies = [async () => answer("{}", { groundingMetadata: { groundingChunks: [{ web: { title: "gold.example" } }] } })];
    const result = await askTextModel({ modelSetting: "voice_price_model", defaultModel: "gemini-3.5-flash-lite", prompt: "p", search: true });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.tools).toEqual([{ googleSearch: {} }]);
    expect(body.systemInstruction).toBeUndefined();
    expect(result.webSource).toBe("gold.example");
  });
});
