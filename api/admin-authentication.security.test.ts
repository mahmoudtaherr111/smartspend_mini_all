import { beforeEach, describe, expect, it, vi } from "vitest";
import { sign } from "hono/jwt";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { createContext } from "./context";
import { adminProcedure, router } from "./middleware";
import { env } from "./lib/env";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  oauth: vi.fn(),
  local: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheIncr: vi.fn(),
  executeSlidingWindowRateLimit: vi.fn(),
}));
vi.mock("./queries/connection", () => ({
  db: {
    query: {
      sessions: { findFirst: mocks.session },
      users: { findFirst: mocks.oauth },
      localUsers: { findFirst: mocks.local },
    },
  },
}));
vi.mock("./lib/redis-client", () => ({
  cacheGet: mocks.cacheGet,
  cacheSet: mocks.cacheSet,
  cacheDel: mocks.cacheDel,
  cacheIncr: mocks.cacheIncr,
  executeSlidingWindowRateLimit: mocks.executeSlidingWindowRateLimit,
}));

const guarded = router({
  identity: adminProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    type: ctx.user.type,
    role: ctx.user.role,
  })),
});
let storedSession: {
  token: string;
  userId: number;
  userType: string;
  expiresAt: Date;
} | null;
let databaseRole: string;

beforeEach(() => {
  storedSession = null;
  databaseRole = "admin";
  vi.clearAllMocks();
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.cacheDel.mockResolvedValue(undefined);
  mocks.cacheIncr.mockResolvedValue(1);
  mocks.executeSlidingWindowRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 99,
    resetMs: 0,
  });
  mocks.session.mockImplementation(({ where }: { where: SQL }) => {
    const query = new MySqlDialect().sqlToQuery(where);
    expect(query.sql).toContain("`sessions`.`token` = ?");
    expect(query.sql).toContain("`sessions`.`user_id` = ?");
    expect(query.sql).toContain("`sessions`.`user_type` = ?");
    expect(query.sql).toContain("`sessions`.`expires_at` > ?");
    const [, token, userId, userType, now] = query.params;
    // Drizzle serializes DATETIME parameters in UTC without a timezone suffix.
    const cutoff = new Date(`${String(now).replace(" ", "T")}Z`);
    return storedSession &&
      storedSession.token === token &&
      storedSession.userId === userId &&
      storedSession.userType === userType &&
      storedSession.expiresAt > cutoff
        ? { ...storedSession, tokenHash: null }
        : undefined;
  });
  for (const mock of [mocks.oauth, mocks.local]) {
    mock.mockImplementation(() => ({
      id: 42,
      name: "Synthetic identity",
      role: databaseRole,
      plan: "free",
    }));
  }
});

async function sessionToken(
  type: "oauth" | "local",
  claims: Record<string, unknown> = {},
) {
  const token = await sign(
    {
      userId: 42,
      userType: type,
      exp: Math.floor(Date.now() / 1000) + 600,
      ...claims,
    },
    env.JWT_SECRET,
    "HS256",
  );
  storedSession = {
    token,
    userId: 42,
    userType: type,
    expiresAt: new Date(Date.now() + 600_000),
  };
  return token;
}
async function access(headers: HeadersInit) {
  const ctx = await createContext(
    new Request("http://localhost/api/trpc/identity", { headers }),
  );
  return guarded.createCaller(ctx).identity();
}

describe("authentication boundary for administrative access", () => {
  for (const type of ["oauth", "local"] as const) {
    it(`${type}: accepts an active signed session and database admin role`, async () => {
      const token = await sessionToken(type);
      const headers =
        type === "oauth"
          ? { cookie: `google_session=${token}` }
          : { authorization: `Bearer ${token}` };
      await expect(access(headers)).resolves.toMatchObject({
        id: 42,
        type,
        role: "admin",
      });
    });
    it(`${type}: ignores admin claims and headers when the database role is user`, async () => {
      const token = await sessionToken(type, { role: "admin", plan: "ultra" });
      databaseRole = "user";
      await expect(
        access({ authorization: `Bearer ${token}`, "x-role": "admin" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it(`${type}: rechecks the database role after demotion`, async () => {
      const token = await sessionToken(type);
      await expect(
        access({ authorization: `Bearer ${token}` }),
      ).resolves.toHaveProperty("role", "admin");
      databaseRole = "moderator";
      await expect(
        access({ authorization: `Bearer ${token}` }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it(`${type}: rejects revoked database sessions even if the JWT has not expired`, async () => {
      const token = await sessionToken(type);
      storedSession = null;
      await expect(
        access({ authorization: `Bearer ${token}` }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
    it(`${type}: rejects expired database sessions`, async () => {
      const token = await sessionToken(type);
      storedSession!.expiresAt = new Date(Date.now() - 1000);
      await expect(
        access({ authorization: `Bearer ${token}` }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
    it(`${type}: rejects expired JWTs`, async () => {
      const token = await sessionToken(type, {
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      await expect(
        access({ authorization: `Bearer ${token}` }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(mocks.session).not.toHaveBeenCalled();
    });
  }
  it("rejects a forged signature before querying sessions", async () => {
    const token = await sign(
      { userId: 42, userType: "local", role: "admin" },
      "attacker-controlled-test-secret",
      "HS256",
    );
    await expect(
      access({ authorization: `Bearer ${token}` }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("cannot use a local session as a Google cookie with a colliding user id", async () => {
    const token = await sessionToken("local");
    await expect(
      access({ cookie: `google_session=${token}` }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.oauth).not.toHaveBeenCalled();
  });
});
