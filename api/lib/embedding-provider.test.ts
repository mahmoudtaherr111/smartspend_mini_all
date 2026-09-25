import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ai-gateway", () => ({ resolveAdminRoutes: vi.fn(async () => ({ routes: [] })) }));
vi.mock("./settings-cache", () => ({ getSystemSettings: vi.fn(async () => ({ ai_api_key: "g-key-1", ai_api_key_2: "g-key-2" })) }));

import { resolveAdminRoutes } from "./ai-gateway";
import { embedTexts, embeddingRoutes, taskText } from "./embedding-provider";

const geminiAnswer = (count: number) => new Response(JSON.stringify({ embeddings: Array.from({ length: count }, () => ({ values: [0.6, 0.8] })) }));

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("embedding provider", () => {
  it("puts the admin's providers first, then Google's gemini-embedding-2 with each Gemini key", async () => {
    vi.mocked(resolveAdminRoutes).mockResolvedValueOnce({
      preferred: null,
      routes: [{ slug: "openai", protocol: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk", model: "text-embedding-3-small", priority: 0, providerId: 4, suppressReasoning: false }],
    } as never);
    const routes = await embeddingRoutes();
    expect(routes.map((route) => `${route.slug}:${route.model}`)).toEqual(["openai:text-embedding-3-small", "gemini:gemini-embedding-2", "gemini:gemini-embedding-2"]);
  });

  it("states the task the way each model expects it", () => {
    expect(taskText("gemini-embedding-2", "query", "أوبر")).toBe("task: search result | query: أوبر");
    expect(taskText("gemini-embedding-2", "classification", "أوبر")).toBe("task: classification | query: أوبر");
    expect(taskText("gemini-embedding-2", "document", "أوبر")).toBe("title: none | text: أوبر");
    expect(taskText("text-embedding-3-small", "query", "أوبر")).toBe("أوبر");
  });

  it("moves to the next key when one is out of quota, and rests the one that failed", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(geminiAnswer(2));
    const batch = await embedTexts(["a", "b"], { dimensions: 768, task: "query" });
    expect(batch).toMatchObject({ vectors: [[0.6, 0.8], [0.6, 0.8]], model: "gemini-embedding-2", provider: "gemini" });
    const keys = vi.mocked(fetch).mock.calls.map((call) => (call[1]!.headers as Record<string, string>)["x-goog-api-key"]);
    expect(keys).toEqual(["g-key-1", "g-key-2"]);
    // The first key rests: the next request goes straight to the second.
    vi.mocked(fetch).mockResolvedValueOnce(geminiAnswer(1));
    await embedTexts(["c"], { dimensions: 768, task: "query" });
    expect((vi.mocked(fetch).mock.calls[2][1]!.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key-2");
  });
});
