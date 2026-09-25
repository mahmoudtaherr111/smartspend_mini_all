import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/redis-client", () => ({ getRedisClient: vi.fn(async () => null) }));
vi.mock("../../lib/embedding-provider", () => ({ embedTexts: vi.fn() }));

import { embedTexts } from "../../lib/embedding-provider";
import { FALLBACK_EMBEDDING_MODEL, MemoryEmbeddingClient } from "./embedding-client";

const config = { provider: "gemini", model: "gemini-embedding-2", dimensions: 768 as const, enabled: true };

beforeEach(() => vi.mocked(embedTexts).mockReset());

describe("MemoryEmbeddingClient", () => {
  it("embeds through the shared provider and names the model that answered", async () => {
    vi.mocked(embedTexts).mockResolvedValueOnce({ vectors: [[0.1, 0.2]], model: "text-embedding-3-small", provider: "openai", characters: 11 });
    const result = await new MemoryEmbeddingClient(config).embedText({ text: "memory text", task: "document" });
    expect(result).toMatchObject({ vector: [0.1, 0.2], model: "text-embedding-3-small", provider: "openai", cacheHit: false });
    expect(embedTexts).toHaveBeenCalledWith(["memory text"], { dimensions: 768, task: "document" });
  });

  it("stands in with a local vector of its own model when no provider answers, so it is never stored or matched", async () => {
    vi.mocked(embedTexts).mockResolvedValueOnce(null);
    const result = await new MemoryEmbeddingClient(config).embedText({ text: "memory text" });
    expect(result).toMatchObject({ fallback: true, model: FALLBACK_EMBEDDING_MODEL, provider: "local" });
  });

  it("does not call a provider when memory embeddings are off", async () => {
    const result = await new MemoryEmbeddingClient({ ...config, enabled: false }).embedText({ text: "x" });
    expect(result.fallback).toBe(true);
    expect(embedTexts).not.toHaveBeenCalled();
  });
});
