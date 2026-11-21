import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const entries: Array<Record<string, unknown>> = [];
vi.mock("./queries/connection", () => ({
  db: { insert: () => ({ values: (row: Record<string, unknown>) => { entries.push(row); return Promise.resolve(); } }) },
}));

const { adminProcedure, moderatorProcedure, router } = await import("./middleware");
const { logAdminAction } = await import("./lib/admin-audit");
type Ctx = import("./context").Context;

const staff = router({
  quiet: adminProcedure.mutation(() => "done"),
  explained: adminProcedure.mutation(async ({ ctx }) => {
    await logAdminAction(ctx, { action: "UPDATE_USER_PLAN", targetType: "user", targetId: 7 });
    return "done";
  }),
  refused: moderatorProcedure.mutation(() => {
    throw new TRPCError({ code: "BAD_REQUEST", message: "no" });
  }),
  read: adminProcedure.query(() => "seen"),
});

const caller = (role: "admin" | "moderator") =>
  staff.createCaller({
    user: { id: 1, name: "Staff", type: "local", role, plan: "free" },
    req: new Request("http://localhost/api/trpc"),
    ip: "127.0.0.1",
  } as Ctx);

describe("every staff change reaches the audit log", () => {
  beforeEach(() => { entries.length = 0; });

  it("records a mutation that wrote nothing itself, by its path and never its input", async () => {
    await caller("admin").quiet();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "quiet", targetType: "procedure", targetId: "quiet", adminId: 1, adminType: "local" });
  });

  it("adds no second entry when the procedure wrote its own", async () => {
    await caller("admin").explained();
    expect(entries.map((entry) => entry.action)).toEqual(["UPDATE_USER_PLAN"]);
  });

  it("records a change that failed, with the error's code", async () => {
    await expect(caller("moderator").refused()).rejects.toThrow("no");
    expect(entries[0]).toMatchObject({ action: "refused", details: { failed: true, code: "BAD_REQUEST" } });
  });

  it("leaves reads out", async () => {
    await caller("admin").read();
    expect(entries).toHaveLength(0);
  });
});
