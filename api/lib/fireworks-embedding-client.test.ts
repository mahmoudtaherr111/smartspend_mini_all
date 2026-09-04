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

  it("opens on a suspended account, which answers 412 and was not in the list", async () => {
    // The real message: "Account … is suspended, possibly due to reaching the monthly
    // spending limit or failure to pay past invoices." A live benchmark run made this
    // call 87 times — once per case — because 412 fell through the enumerated statuses
    // and left the circuit closed.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: "suspended" } }), { status: 412 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getFireworksEmbedding("بنزين", "test-key")).resolves.toBeNull();
    await expect(getFireworksEmbedding("أكل", "test-key")).resolves.toBeNull();
    await expect(getFireworksEmbedding("مترو", "test-key")).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps retrying after a server error, which does fix itself", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("upstream boom", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getFireworksEmbedding("قهوة", "test-key")).resolves.toBeNull();
    await expect(getFireworksEmbedding("شاي", "test-key")).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
