import { FireworksEmbeddingClient } from "./embedding-client";
import { getRedisClient } from "../../lib/redis-client";

vi.mock("../../lib/redis-client", () => ({
  getRedisClient: vi.fn(async () => null),
}));

describe("Fireworks embedding client", () => {
  beforeEach(() => {
    vi.mocked(getRedisClient).mockResolvedValue(null as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends Qwen3 dimensions to the embeddings endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    } as Response);

    const client = new FireworksEmbeddingClient({
      provider: "fireworks",
      enabled: true,
      apiKey: "test-key",
      baseUrl: "https://api.fireworks.ai/inference/v1",
      model: "accounts/fireworks/models/qwen3-embedding-8b",
      dimensions: 768,
    });

    const result = await client.embedText({ text: "memory text", dimensions: 256 });

    expect(result).toMatchObject({
      vector: [0.1, 0.2, 0.3],
      model: "accounts/fireworks/models/qwen3-embedding-8b",
      requestModel: "accounts/fireworks/models/qwen3-embedding-8b",
      dimensions: 256,
      provider: "fireworks",
      cacheHit: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.fireworks.ai/inference/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "accounts/fireworks/models/qwen3-embedding-8b",
          input: "memory text",
          dimensions: 256,
        }),
      }),
    );
  });

  it("retries the documented Fireworks model alias when the account model path is rejected", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.4, 0.5] }] }),
      } as Response);

    const client = new FireworksEmbeddingClient({
      provider: "fireworks",
      enabled: true,
      apiKey: "test-key",
      baseUrl: "https://api.fireworks.ai/inference/v1",
      model: "accounts/fireworks/models/qwen3-embedding-8b",
      dimensions: 768,
    });

    const result = await client.embedText({ text: "memory text", dimensions: 256 });

    expect(result).toMatchObject({
      vector: [0.4, 0.5],
      model: "accounts/fireworks/models/qwen3-embedding-8b",
      requestModel: "fireworks/qwen3-embedding-8b",
    });
    expect(result.fallback).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.fireworks.ai/inference/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "fireworks/qwen3-embedding-8b",
          input: "memory text",
          dimensions: 256,
        }),
      }),
    );
  });

  it("returns a deterministic fallback vector when Fireworks fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const client = new FireworksEmbeddingClient({
      provider: "fireworks",
      enabled: true,
      apiKey: "test-key",
      baseUrl: "https://api.fireworks.ai/inference/v1",
      model: "accounts/fireworks/models/qwen3-embedding-8b",
      dimensions: 256,
    });

    const result = await client.embedText({ text: "memory text", dimensions: 256 });

    expect(result).toMatchObject({
      dimensions: 256,
      provider: "fireworks",
      cacheHit: false,
      fallback: true,
      fallbackReason: "fireworks_embedding_failed_accounts/fireworks/models/qwen3-embedding-8b:500",
    });
    expect(result.vector).toHaveLength(256);
  });

  it("scopes Redis embedding cache keys by user type and user id", async () => {
    const redis = {
      get: vi.fn(async () => null),
      setEx: vi.fn(async () => "OK"),
    };
    vi.mocked(getRedisClient).mockResolvedValue(redis as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.7, 0.8] }] }),
    } as Response);

    const client = new FireworksEmbeddingClient({
      provider: "fireworks",
      enabled: true,
      apiKey: "test-key",
      baseUrl: "https://api.fireworks.ai/inference/v1",
      model: "accounts/fireworks/models/qwen3-embedding-8b",
      dimensions: 768,
    });

    await client.embedText({ text: "same query", dimensions: 768, userId: 1, userType: "oauth" });
    await client.embedText({ text: "same query", dimensions: 768, userId: 1, userType: "local" });

    expect(redis.get).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(":oauth:1:"),
    );
    expect(redis.get).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(":local:1:"),
    );
    expect(redis.setEx.mock.calls[0][0]).toContain(":oauth:1:");
    expect(redis.setEx.mock.calls[1][0]).toContain(":local:1:");
  });
});
