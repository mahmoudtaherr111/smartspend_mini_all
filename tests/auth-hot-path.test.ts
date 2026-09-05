import { describe, it, expect, beforeEach } from "vitest";
import { createContext, UnifiedUser } from "../api/context";
import { mysqlPool } from "../api/queries/connection";
import { generateToken, invalidateSession } from "../api/local-auth-utils";
import {
  bumpAuthVersion,
  cacheResolvedSession,
  getCachedResolvedSession,
  getAuthVersion,
  hashSessionToken,
} from "../api/lib/session-validation";
import { db } from "../api/queries/connection";
import { users, localUsers, sessions } from "../db/schema";
import { eq } from "drizzle-orm";

describe("Authentication Hot Path & Redis Session Caching (P1)", () => {
  const dummyOauthId = 99901;
  const dummyLocalId = 99902;

  beforeEach(async () => {
    // Clean up test state
    try {
      await db.delete(sessions).where(eq(sessions.userId, dummyOauthId));
      await db.delete(sessions).where(eq(sessions.userId, dummyLocalId));
      await db.delete(users).where(eq(users.id, dummyOauthId));
      await db.delete(localUsers).where(eq(localUsers.id, dummyLocalId));
    } catch {
      // ignore
    }

    try {
      await mysqlPool.query("ALTER TABLE `users` ADD `referred_by_type` varchar(50)");
    } catch {
      // column already exists
    }
    try {
      await mysqlPool.query("ALTER TABLE `local_users` ADD `referred_by_type` varchar(50)");
    } catch {
      // column already exists
    }

    // Seed dummy users if live DB connected
    try {
      await db.insert(users).values({
        id: dummyOauthId,
        unionId: `test_oauth_${dummyOauthId}`,
        name: "Test OAuth User",
        email: `oauth_${dummyOauthId}@test.com`,
        role: "user",
        plan: "free",
      });

      await db.insert(localUsers).values({
        id: dummyLocalId,
        name: "Test Local User",
        phone: `+20109999999`,
        password: "hashed_password",
        role: "user",
        plan: "free",
      });
    } catch {
      // ignore
    }
  });

  it("issues zero MySQL queries on an authenticated request with warm cache (P1 Gate)", async () => {
    const token = await generateToken(dummyOauthId, "oauth");
    const { hex: tokenHashHex } = hashSessionToken(token);

    const testUser: UnifiedUser = {
      id: dummyOauthId,
      name: "Test OAuth User",
      email: "oauth@test.com",
      role: "user",
      plan: "free",
      type: "oauth",
    };

    const ver = await getAuthVersion("oauth", dummyOauthId);

    // Warm the cache directly
    await cacheResolvedSession(
      tokenHashHex,
      testUser,
      new Date(Date.now() + 3600 * 1000),
      ver,
    );

    // Verify cache has it
    const cached = await getCachedResolvedSession(tokenHashHex);
    expect(cached).not.toBeNull();
    expect(cached?.user.id).toBe(dummyOauthId);

    // Instrument MySQL queries
    let queryCount = 0;
    const origQuery = mysqlPool.query.bind(mysqlPool);
    const origExecute = mysqlPool.execute.bind(mysqlPool);

    (mysqlPool as any).query = (...args: any[]) => {
      queryCount++;
      return (origQuery as any)(...args);
    };
    (mysqlPool as any).execute = (...args: any[]) => {
      queryCount++;
      return (origExecute as any)(...args);
    };

    try {
      const mockReq = new Request("http://localhost:3000/api/trpc", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const ctx = await createContext(mockReq);

      expect(ctx.user).not.toBeNull();
      expect(ctx.user?.id).toBe(dummyOauthId);
      expect(ctx.user?.type).toBe("oauth");

      // Zero MySQL queries on warm session cache!
      expect(queryCount).toBe(0);
    } finally {
      (mysqlPool as any).query = origQuery;
      (mysqlPool as any).execute = origExecute;
    }
  });

  it("invalidates session access immediately upon logout (P1 Gate)", async () => {
    const token = await generateToken(dummyLocalId, "local");
    const { hex: tokenHashHex } = hashSessionToken(token);

    const testUser: UnifiedUser = {
      id: dummyLocalId,
      name: "Test Local User",
      role: "user",
      plan: "free",
      type: "local",
    };

    const ver = await getAuthVersion("local", dummyLocalId);
    await cacheResolvedSession(
      tokenHashHex,
      testUser,
      new Date(Date.now() + 3600 * 1000),
      ver,
    );

    const mockReq = new Request("http://localhost:3000/api/trpc", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const ctxBefore = await createContext(mockReq);
    expect(ctxBefore.user?.id).toBe(dummyLocalId);

    // User logs out
    await invalidateSession(token);

    // Immediate invalidation: next request returns null user
    const ctxAfter = await createContext(mockReq);
    expect(ctxAfter.user).toBeNull();
  });

  it("reflects plan upgrade within exactly one request (P1 Gate)", async () => {
    const token = await generateToken(dummyOauthId, "oauth");
    const { hex: tokenHashHex } = hashSessionToken(token);

    const testUser: UnifiedUser = {
      id: dummyOauthId,
      name: "Test OAuth User",
      role: "user",
      plan: "free",
      type: "oauth",
    };

    const initialVer = await getAuthVersion("oauth", dummyOauthId);
    await cacheResolvedSession(
      tokenHashHex,
      testUser,
      new Date(Date.now() + 3600 * 1000),
      initialVer,
    );

    // Request 1: user is on free
    const mockReq = new Request("http://localhost:3000/api/trpc", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const ctx1 = await createContext(mockReq);
    expect(ctx1.user?.plan).toBe("free");

    // Upgrade occurs: DB is updated, and authver is bumped
    await db
      .update(users)
      .set({ plan: "pro" })
      .where(eq(users.id, dummyOauthId));

    await bumpAuthVersion("oauth", dummyOauthId);

    // Also insert session record in DB so fallback can resolve new plan
    try {
      await db.insert(sessions).values({
        userId: dummyOauthId,
        userType: "oauth",
        token,
        tokenHash: tokenHashHex,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      });
    } catch {
      // ignore
    }

    // Request 2 (within 1 request): user immediately sees "pro"
    const ctx2 = await createContext(mockReq);
    expect(ctx2.user).not.toBeNull();
    expect(ctx2.user?.plan).toBe("pro");
  });

  it("covers both local and oauth users through warm session cache", async () => {
    const oauthToken = await generateToken(dummyOauthId, "oauth");
    const localToken = await generateToken(dummyLocalId, "local");

    const oauthHash = hashSessionToken(oauthToken).hex;
    const localHash = hashSessionToken(localToken).hex;

    const oauthVer = await getAuthVersion("oauth", dummyOauthId);
    const localVer = await getAuthVersion("local", dummyLocalId);

    await cacheResolvedSession(
      oauthHash,
      {
        id: dummyOauthId,
        name: "OAuth User",
        role: "user",
        plan: "free",
        type: "oauth",
      },
      new Date(Date.now() + 3600 * 1000),
      oauthVer,
    );

    await cacheResolvedSession(
      localHash,
      {
        id: dummyLocalId,
        name: "Local User",
        role: "user",
        plan: "free",
        type: "local",
      },
      new Date(Date.now() + 3600 * 1000),
      localVer,
    );

    const oauthCtx = await createContext(
      new Request("http://localhost:3000", {
        headers: { Authorization: `Bearer ${oauthToken}` },
      }),
    );
    expect(oauthCtx.user?.type).toBe("oauth");

    const localCtx = await createContext(
      new Request("http://localhost:3000", {
        headers: { Authorization: `Bearer ${localToken}` },
      }),
    );
    expect(localCtx.user?.type).toBe("local");
  });
});
