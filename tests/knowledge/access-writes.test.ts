import { describe, expect, it } from "vitest";
import { guardedAccessWrites } from "../../scripts/knowledge/access-writes";

const file = "api/example-router.ts";

describe("writes that change access (api/lib/access-control.ts owns them)", () => {
  it("flags a session deleted anywhere else", () => {
    const text = ['await db.delete(sessions).where(eq(sessions.id, input.sessionId));'].join("\n");
    expect(guardedAccessWrites(file, text)).toEqual([`${file}:1 deletes from sessions`]);
  });

  it("flags a role or a plan written anywhere else, whichever table the variable points at", () => {
    const text = [
      'const table = input.userType === "oauth" ? users : localUsers;',
      "await db.update(table).set({ role: input.role }).where(eq(table.id, input.userId));",
      'await db.update(table).set({ plan: "free" }).where(eq(table.id, input.userId));',
    ].join("\n");

    expect(guardedAccessWrites(file, text)).toEqual([
      `${file}:2 writes role`,
      `${file}:3 writes plan`,
    ]);
  });

  it("says nothing about the module that owns these writes", () => {
    const text = [
      "await db.delete(sessions).where(eq(sessions.id, row.id));",
      "await db.update(users).set({ plan }).where(eq(users.id, userId));",
    ].join("\n");

    expect(guardedAccessWrites("api/lib/access-control.ts", text)).toEqual([]);
    expect(guardedAccessWrites("api\\lib\\access-control.ts", text)).toEqual([]);
  });

  it("leaves other columns and other tables alone", () => {
    const text = [
      'await db.update(proSubscriptions).set({ status: "expired" }).where(eq(proSubscriptions.id, sub.id));',
      "await db.update(localUsers).set({ phone: clean }).where(eq(localUsers.id, id));",
      "await db.delete(authChallenges).where(lt(authChallenges.expiresAt, now));",
    ].join("\n");

    expect(guardedAccessWrites(file, text)).toEqual([]);
  });
});
