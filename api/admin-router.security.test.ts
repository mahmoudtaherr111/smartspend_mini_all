import { beforeEach, describe, expect, it, vi } from "vitest";
import { callTRPCProcedure } from "@trpc/server";
import { adminRouter } from "./admin-router";
import { adminWhatsappRouter } from "./admin-whatsapp-router";
import { analyticsRouter } from "./analytics-router";
import { exportRouter } from "./export-router";
import { localAuthRouter } from "./local-auth-router";
import { sessionRouter } from "./session-router";
import { supportRouter } from "./support-router";
import { router } from "./middleware";
import type { Context, UnifiedUser } from "./context";

// Use the real routers, middleware, Drizzle schema and SQL projection/mapping.
// Only replace the database transport and unrelated external-service adapters.
const { execute } = vi.hoisted(() => ({
  execute:
    vi.fn<
      (
        sql: string,
        params: unknown[],
        method: string,
      ) => Promise<{ rows: unknown[][] }>
    >(),
}));
vi.mock("./queries/connection", async () => {
  const { drizzle } = await import("drizzle-orm/mysql-proxy");
  const schema = await import("../db/schema");
  const db = drizzle(execute, { schema });
  return { db, getDb: () => db };
});
vi.mock("./services/whatsapp-service", () => ({ whatsappService: {} }));
vi.mock("./notification-engine", () => ({
  sendPush: vi.fn(),
  checkAndTriggerSmartActivityNotifications: vi.fn(),
}));
vi.mock("./services/user-profile-service", () => ({
  getSmartProfile: vi.fn(),
}));
vi.mock("./services/pro-report-engine", () => ({
  wrapReportAsPrintableHtml: vi.fn(),
}));

const administrativeRouter = router({
  admin: adminRouter,
  adminWhatsapp: adminWhatsappRouter,
  analytics: router({
    getAllUserStats: analyticsRouter.getAllUserStats,
    getDashboardStats: analyticsRouter.getDashboardStats,
  }),
  export: router({ allUsers: exportRouter.allUsers }),
  localAuth: router({
    listUsers: localAuthRouter.listUsers,
    getStats: localAuthRouter.getStats,
    deleteUser: localAuthRouter.deleteUser,
    updateRole: localAuthRouter.updateRole,
  }),
  session: router({
    stats: sessionRouter.stats,
    listAll: sessionRouter.listAll,
  }),
  support: router({
    listAll: supportRouter.listAll,
    respond: supportRouter.respond,
    assign: supportRouter.assign,
  }),
});

let nextUserId = 1000;
function context(
  role: UnifiedUser["role"] | null,
  type: UnifiedUser["type"] = "local",
): Context {
  return {
    user: role
      ? {
          id: nextUserId++,
          name: "Synthetic test user",
          type,
          role,
          plan: role === "admin" ? "free" : "ultra",
        }
      : null,
    req: new Request("http://localhost/api/trpc"),
    ip: "127.0.0.1",
  };
}

// Synthetic fixtures deliberately contain credentials. SQL must not select them.
const account = {
  id: 42,
  name: "Test account",
  email: "fixture@example.invalid",
  phone: "01000000000",
  avatar: null,
  role: "admin",
  plan: "free",
  ai_tokens_used: 12,
  password: "SYNTHETIC_PASSWORD_HASH_MUST_NOT_LEAVE_DB",
  union_id: "private-oauth-identity",
  future_secret: "not-an-api-field",
  created_at: "2026-09-01 12:00:00",
  last_sign_in_at: null,
};
const session = {
  id: 50,
  user_id: 42,
  user_type: "local",
  token: "SYNTHETIC_SESSION_TOKEN_MUST_NOT_LEAVE_DB",
  ip_address: "192.0.2.1",
  user_agent: "Synthetic test browser",
  created_at: "2026-09-01 12:00:00",
  expires_at: "2026-10-01 12:00:00",
};
const ticket = {
  id: 9,
  user_id: 42,
  user_type: "local",
  subject: "Test ticket",
  message: "Private support message",
  status: "open",
  priority: "medium",
  assigned_to: null,
  response: null,
  responded_at: null,
  created_at: "2026-09-01 12:00:00",
  updated_at: null,
};

beforeEach(() => {
  execute.mockReset();
  execute.mockImplementation(async (sql) => {
    if (/^select count\(/.test(sql)) return { rows: [[1]] };
    if (!sql.startsWith("select ")) return { rows: [] };
    const table = sql.match(/ from `([^`]+)`/)?.[1];
    const row: Record<string, unknown> | undefined =
      table === "users" || table === "local_users"
        ? account
        : table === "sessions"
          ? session
          : table === "support_tickets"
            ? ticket
            : undefined;
    if (!row) return { rows: [] };
    const fields = sql
      .slice(7, sql.indexOf(" from "))
      .split(", ")
      .map((field) => {
        const name = [...field.matchAll(/`([^`]+)`/g)].at(-1)?.[1];
        return name ? (row[name] ?? null) : null;
      });
    return { rows: [fields] };
  });
});

describe("all actual administrative procedures deny non-admin callers", () => {
  for (const [path, procedure] of Object.entries(
    administrativeRouter._def.procedures,
  )) {
    it(path, async () => {
      for (const type of ["oauth", "local"] as const) {
        for (const role of [null, "user", "moderator"] as const) {
          await expect(
            callTRPCProcedure({
              router: administrativeRouter,
              path,
              type: procedure._def.type,
              ctx: context(role, type),
              getRawInput: async () => ({}),
              signal: undefined,
              batchIndex: 0,
            }),
          ).rejects.toMatchObject({
            code: role ? "FORBIDDEN" : "UNAUTHORIZED",
          });
        }
      }
      expect(execute).not.toHaveBeenCalled();
    });
  }
});

describe("administrator response data minimization", () => {
  for (const type of ["oauth", "local"] as const) {
    it(`allows ${type} free-plan admin to list users without password hashes`, async () => {
      const result = await adminRouter
        .createCaller(context("admin", type))
        .listAllUsers({ limit: 20 });
      expect(result.users).toHaveLength(2);
      expect(result.users.map((user) => user.userType).sort()).toEqual([
        "local",
        "oauth",
      ]);
      for (const user of result.users) {
        expect(user).toMatchObject({
          id: 42,
          name: account.name,
          role: "admin",
          aiTokensUsed: 12,
        });
        expect(user).not.toHaveProperty("password");
        expect(user).not.toHaveProperty("unionId");
        expect(user).not.toHaveProperty("futureSecret");
      }
      expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PASSWORD");
      expect(execute.mock.calls.map(([sql]) => sql).join("\n")).not.toMatch(
        /`password`|`union_id`|select \*/,
      );
    });

    it(`allows ${type} admin to inspect sessions without login tokens`, async () => {
      const result = await adminRouter
        .createCaller(context("admin", type))
        .getUserSessions({ userId: 42, userType: type });
      expect(result[0]).toMatchObject({
        id: 50,
        ipAddress: session.ip_address,
      });
      expect(result[0]).not.toHaveProperty("token");
      expect(JSON.stringify(result)).not.toContain("SYNTHETIC_SESSION");
      const [sql, params] = execute.mock.calls[0];
      expect(sql).not.toContain("`token`");
      expect(sql).toContain("`sessions`.`user_id` = ?");
      expect(sql).toContain("`sessions`.`user_type` = ?");
      expect(params).toEqual([42, type]);
    });
  }

  it("keeps the activity log credential-free", async () => {
    const result = await adminRouter
      .createCaller(context("admin"))
      .getActivityLog();
    expect(result[0]).not.toHaveProperty("token");
    expect(execute.mock.calls.map(([sql]) => sql).join("\n")).not.toContain(
      "`token`",
    );
  });

  it.each([{ limit: 0 }, { limit: 101 }, { page: 0 }, { page: 1.5 }])(
    "bounds user-list pagination: %j",
    async (input) => {
      await expect(
        adminRouter.createCaller(context("admin")).listAllUsers(input),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("keeps personal session access available and scoped to both identity fields", async () => {
    const ctx = context("user", "oauth");
    const result = await sessionRouter.createCaller(ctx).listMine();
    expect(result[0]).not.toHaveProperty("token");
    expect(execute.mock.calls[0][1]).toEqual([ctx.user!.id, "oauth"]);
  });
});

describe("support ticket ownership after removing moderator administrative access", () => {
  for (const role of ["user", "moderator"] as const) {
    it(`${role} can still read their own ticket`, async () => {
      const ctx = context(role);
      ctx.user!.id = 42;
      await expect(
        supportRouter.createCaller(ctx).getById({ id: 9 }),
      ).resolves.toMatchObject({ id: 9 });
    });
    it(`${role} cannot read or close someone else's ticket, even with a colliding OAuth id`, async () => {
      const ctx = context(role, "oauth");
      ctx.user!.id = 42;
      const caller = supportRouter.createCaller(ctx);
      await expect(caller.getById({ id: 9 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(caller.close({ id: 9 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(
        execute.mock.calls.every(([sql]) => sql.startsWith("select ")),
      ).toBe(true);
    });
  }
  it("admin can read another user's ticket", async () => {
    await expect(
      supportRouter.createCaller(context("admin")).getById({ id: 9 }),
    ).resolves.toMatchObject({ id: 9 });
  });
});
