import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFireworksEmbedding,
  resetFireworksCache,
} from "./fireworks-embedding-client";

describe("Fireworks embedding circuit breaker", () => {
  afterEach(() => {
    resetFireworksCache();
    vi.unstubAllGlobals();
  });

  it("suppresses repeated provider calls after an authorization failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("suspended", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getFireworksEmbedding("قهوة", "test-key")).resolves.toBeNull();
    await expect(getFireworksEmbedding("مواصلات", "test-key")).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
