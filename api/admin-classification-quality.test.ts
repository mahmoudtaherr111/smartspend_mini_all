import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeClassificationQuality } from "./admin-router";
import { adminConsoleRouter } from "./admin-console-router";
import type { Context, UnifiedUser } from "./context";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn<(sql: string, params: unknown[], method: string) => Promise<{ rows: unknown[][] }>>(),
}));
vi.mock("./queries/connection", async () => {
  const { drizzle } = await import("drizzle-orm/mysql-proxy");
  const schema = await import("../db/schema");
  const db = drizzle(execute, { schema });
  return { db, getDb: () => db };
});

let nextId = 100;
function caller(role: UnifiedUser["role"] | null) {
  const context: Context = {
    user: role ? { id: nextId++, type: "local", role, plan: "ultra", name: "Fixture" } : null,
    req: new Request("http://localhost/api/trpc/adminConsole.understandingQuality"),
    ip: "127.0.0.1",
  };
  return adminConsoleRouter.createCaller(context);
}

beforeEach(() => execute.mockReset());

describe("classification quality for the admin", () => {
  it("measures silent mistakes against what was saved on its own", () => {
    const quality = summarizeClassificationQuality({
      total: 200, autoSaved: 120, review: 60, clarify: 20, corrected: 15,
      autoSavedCorrected: 6, byModel: 30, avgTimeMs: 41.6,
    });
    expect(quality).toEqual({
      total: 200, autoSaveRate: 60, reviewRate: 30, clarifyRate: 10, correctionRate: 7.5,
      silentMistakeRate: 5, modelShare: 15, avgTimeMs: 42,
    });
  });

  it("reads an empty period as zeros", () => {
    const quality = summarizeClassificationQuality({
      total: 0, autoSaved: 0, review: 0, clarify: 0, corrected: 0, autoSavedCorrected: 0, byModel: 0, avgTimeMs: 0,
    });
    expect(quality.silentMistakeRate).toBe(0);
    expect(quality.autoSaveRate).toBe(0);
  });
});

describe("understanding engine quality for the deployed admin console", () => {
  it.each([[null, "UNAUTHORIZED"], ["user", "FORBIDDEN"], ["moderator", "FORBIDDEN"]] as const)(
    "refuses %s before querying aggregates",
    async (role, code) => {
      await expect(caller(role).understandingQuality({ days: 7 })).rejects.toMatchObject({ code });
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("returns decisions, surviving ledger links and category feedback by version and model", async () => {
    execute.mockResolvedValue({ rows: [
      ["u2-p3-t2.0", "example-model", "10", "6", "3", "1", "7", "1"],
      ["u1-p1-t2.0", null, "3", "0", "1", "2", "1", "0"],
    ] });
    await expect(caller("admin").understandingQuality({ days: 7 })).resolves.toEqual({
      groups: [
        { version: "u2-p3-t2.0", model: "example-model", total: 10, autoSave: 6, review: 3, clarify: 1, linked: 7, corrected: 1 },
        { version: "u1-p1-t2.0", model: null, total: 3, autoSave: 0, review: 1, clarify: 2, linked: 1, corrected: 0 },
      ],
      totals: { total: 13, autoSave: 6, review: 4, clarify: 3, linked: 8, corrected: 1 },
    });
    expect(execute).toHaveBeenCalledOnce();
    const [query, params] = execute.mock.calls[0];
    expect(query).toContain("`classification_logs`.`created_at` >= ?");
    expect(query).toContain("`classification_logs`.`created_at` < ?");
    expect(query).toContain("`classification_logs`.`classification_version` REGEXP");
    expect(query).toContain("'$.route.model'");
    expect(query).toContain("'$.clarificationSuppressed'");
    expect(query).toContain("`expenses`.`classification_log_id` = `classification_logs`.`id`");
    expect(query).toContain("`expenses`.`user_id` = `classification_logs`.`user_id`");
    expect(query).toContain("`expenses`.`user_type` = `classification_logs`.`user_type`");
    expect(query).toContain("`expenses`.`id` = CAST(JSON_UNQUOTE(JSON_EXTRACT(`classification_logs`.`correction`, '$.expenseId')) AS UNSIGNED)");
    expect(query).not.toMatch(/original_text|final_result|correctedCategory|amount|phone/i);
    expect(params).toHaveLength(2);
    expect(new Date(String(params[0])).getTime()).toBeLessThan(new Date(String(params[1])).getTime());
  });

  it("leaves an empty period empty and refuses an unbounded query", async () => {
    execute.mockResolvedValue({ rows: [] });
    const admin = caller("admin");
    await expect(admin.understandingQuality({ days: 1 })).resolves.toEqual({
      groups: [], totals: { total: 0, autoSave: 0, review: 0, clarify: 0, linked: 0, corrected: 0 },
    });
    await expect(admin.understandingQuality({ days: 91 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(execute).toHaveBeenCalledOnce();
  });
});
