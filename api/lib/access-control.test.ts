/**
 * The contract of api/lib/access-control.ts: every operation that changes access also invalidates what the
 * cache remembers about it. These are the three bugs that made the module necessary, written as tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, cacheMock, bumped, state } = vi.hoisted(() => {
  const state = {
    session: null as null | { id: number; userId: number; userType: "oauth" | "local"; tokenHash: string | null; token: string | null },
    sessions: [] as Array<{ id: number; userId: number; userType: "oauth" | "local"; tokenHash: string | null; token: string | null }>,
    updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
    deletes: [] as string[],
  };

  const chain = (table: string) => ({
    set: vi.fn((values: Record<string, unknown>) => {
      state.updates.push({ table, values });
      return { where: vi.fn(async () => undefined) };
    }),
  });

  const db = {
    update: vi.fn((table: { _: { name?: string } } | string) => chain(nameOf(table))),
    delete: vi.fn((table: { _: { name?: string } } | string) => {
      state.deletes.push(nameOf(table));
      return { where: vi.fn(async () => undefined) };
    }),
    query: {
      sessions: {
        findFirst: vi.fn(async () => state.session),
        findMany: vi.fn(async () => state.sessions),
      },
    },
  };

  function nameOf(table: unknown): string {
    const symbols = Object.getOwnPropertySymbols(table as object);
    for (const symbol of symbols) {
      const value = (table as Record<symbol, unknown>)[symbol];
      if (typeof value === "string") return value;
      if (value && typeof value === "object" && "name" in (value as object)) {
        const name = (value as { name?: unknown }).name;
        if (typeof name === "string") return name;
      }
    }
    return "unknown";
  }

  return {
    dbMock: db,
    cacheMock: { cacheDel: vi.fn(async () => 1) },
    bumped: vi.fn(async () => 1),
    state,
  };
});

vi.mock("../queries/connection", () => ({ db: dbMock, getDb: () => dbMock }));
vi.mock("./redis-client", () => ({ cacheDel: cacheMock.cacheDel }));
vi.mock("./session-validation", async () => {
  const actual = await vi.importActual<typeof import("./session-validation")>("./session-validation");
  return { ...actual, bumpAuthVersion: bumped };
});

const {
  invalidatePrincipal,
  purgeExpiredSessions,
  revokeAllSessions,
  revokeSession,
  revokeSessionByToken,
  setPlan,
  setRole,
} = await import("./access-control");

// The shape the Drizzle mock reports for each table, so a test can say which one was written.
const written = () => dbMock.update.mock.calls.map(([table]) => table);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("changing a role", () => {
  it("writes the row and invalidates every cached session of that user", async () => {
    await setRole("local", 7, "user");
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(bumped).toHaveBeenCalledWith("local", 7);
  });

  it("writes the identity table the user belongs to", async () => {
    await setRole("oauth", 3, "admin");
    await setRole("local", 4, "admin");
    expect(written()).toHaveLength(2);
    expect(written()[0]).not.toBe(written()[1]);
  });
});

describe("changing a plan", () => {
  it("invalidates the cached session, so a downgrade is not a paid quarter of an hour", async () => {
    await setPlan("oauth", 11, "free");
    expect(bumped).toHaveBeenCalledWith("oauth", 11);
  });

  it("writes through a transaction when the caller has one, and still invalidates", async () => {
    const tx = { update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })) };
    await setPlan("local", 12, "pro", { tx: tx as never });
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(bumped).toHaveBeenCalledWith("local", 12);
  });
});

describe("ending a session", () => {
  it("deletes the row, drops that token's cached principal, and bumps for the rest", async () => {
    state.session = { id: 5, userId: 9, userType: "local", tokenHash: "a".repeat(64), token: null };

    await expect(revokeSession({ sessionId: 5 })).resolves.toBe(true);
    expect(cacheMock.cacheDel).toHaveBeenCalledWith(`sess:${"a".repeat(64)}`);
    expect(bumped).toHaveBeenCalledWith("local", 9);
  });

  it("does nothing, and says so, when the session is not there", async () => {
    state.session = null;

    await expect(revokeSession({ sessionId: 404 })).resolves.toBe(false);
    expect(cacheMock.cacheDel).not.toHaveBeenCalled();
    expect(bumped).not.toHaveBeenCalled();
  });
});

describe("signing out of one device", () => {
  it("clears that token and leaves the other devices signed in", async () => {
    await revokeSessionByToken("a-token");
    expect(cacheMock.cacheDel).toHaveBeenCalledTimes(1);
    expect(bumped).not.toHaveBeenCalled();
  });
});

describe("housekeeping", () => {
  it("purging expired rows does not touch the cache: a cached principal carries its own expiry", async () => {
    await purgeExpiredSessions(new Date());
    expect(cacheMock.cacheDel).not.toHaveBeenCalled();
    expect(bumped).not.toHaveBeenCalled();
  });

  it("invalidating a principal on its own is the bump, for a write that cannot go through the helpers", async () => {
    await invalidatePrincipal("oauth", 2);
    expect(bumped).toHaveBeenCalledWith("oauth", 2);
  });

  it("ending every session of a user bumps once, even when there are no rows left", async () => {
    state.sessions = [];
    await expect(revokeAllSessions("local", 3)).resolves.toBe(0);
    expect(bumped).toHaveBeenCalledWith("local", 3);
  });
});
