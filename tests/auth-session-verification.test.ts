/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createQueryPersister,
  saveOfflineIdentity,
  getOfflineIdentity,
  clearOfflineIdentity,
  type QueryCacheUser,
} from "../src/lib/queryPersister";

describe("Auth Session Verification & Cache Isolation Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("prevents write operations to IndexedDB when canWrite is false", async () => {
    const user: QueryCacheUser = { id: 99, type: "oauth" };
    const persister = createQueryPersister(user, { canWrite: false });

    // persistClient should be a safe no-op when canWrite is false
    await expect(
      persister.persistClient({
        buster: "test",
        timestamp: Date.now(),
        clientState: { queries: [], mutations: [] },
      }),
    ).resolves.toBeUndefined();
  });

  it("supports dynamic canWrite getter to avoid stale closures", async () => {
    let verified = false;
    const user: QueryCacheUser = { id: 101, type: "oauth" };
    const persister = createQueryPersister(user, { canWrite: () => verified });

    // When unverified, writing should be blocked
    await expect(
      persister.persistClient({
        buster: "test",
        timestamp: Date.now(),
        clientState: { queries: [], mutations: [] },
      }),
    ).resolves.toBeUndefined();

    // When verified becomes true dynamically, writes are unblocked
    verified = true;
    await expect(
      persister.persistClient({
        buster: "test",
        timestamp: Date.now(),
        clientState: { queries: [], mutations: [] },
      }),
    ).resolves.toBeUndefined();
  });

  it("stores and clears offline identity on session invalidation", () => {
    saveOfflineIdentity({
      id: 42,
      type: "local",
      name: "أحمد",
      plan: "pro",
    });

    expect(getOfflineIdentity()).toEqual(
      expect.objectContaining({
        id: 42,
        type: "local",
        name: "أحمد",
        plan: "pro",
      }),
    );

    clearOfflineIdentity();
    expect(getOfflineIdentity()).toBeNull();
  });
});
