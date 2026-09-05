import { describe, expect, it } from "vitest";
import {
  getQueryCacheScope,
  PERSISTED_QUERY_BUSTER,
  PERSISTED_QUERY_MAX_AGE,
  shouldPersistQueryKey,
} from "../src/lib/queryPersister";

describe("scoped query persistence", () => {
  it("keeps local and OAuth accounts in different IndexedDB scopes", () => {
    expect(getQueryCacheScope({ id: 42, type: "oauth" })).toBe("oauth:42");
    expect(getQueryCacheScope({ id: 42, type: "local" })).toBe("local:42");
  });

  it("rejects invalid account identities rather than sharing a cache key", () => {
    expect(() =>
      getQueryCacheScope({ id: 0, type: "oauth" }),
    ).toThrow("valid user id");
  });

  it("never persists authentication or administrator query results", () => {
    expect(shouldPersistQueryKey([["auth", "me"]])).toBe(false);
    expect(shouldPersistQueryKey([["localAuth", "me"]])).toBe(false);
    expect(shouldPersistQueryKey([["admin", "listAllUsers"]])).toBe(false);
  });

  it("allows a regular personal finance query to be restored offline", () => {
    expect(
      shouldPersistQueryKey([["expense", "getMonthSummary"], { month: "2026-08" }]),
    ).toBe(true);
  });

  it("uses a bounded cache lifetime and an explicit schema buster", () => {
    expect(PERSISTED_QUERY_MAX_AGE).toBe(12 * 60 * 60 * 1_000);
    expect(PERSISTED_QUERY_BUSTER).toBe("smartspend-query-cache-v2");
  });
});
