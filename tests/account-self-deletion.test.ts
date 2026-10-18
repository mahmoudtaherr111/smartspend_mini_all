import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { expenses, localUsers } from "../db/schema";
import { profileRouter } from "../api/profile-router";
import { hashPassword } from "../api/local-auth-utils";
import { isAccountDeletionConfirmed } from "../contracts/account-deletion";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const phone = "01099988877";

describe("the confirmation phrase", () => {
  it("accepts the phrase in Arabic or English, however spaces, hamza and case fall", () => {
    expect(isAccountDeletionConfirmed("احذف حسابي")).toBe(true);
    expect(isAccountDeletionConfirmed("  إحذف   حسابي ")).toBe(true);
    expect(isAccountDeletionConfirmed("Delete my account")).toBe(true);
    expect(isAccountDeletionConfirmed("احذف")).toBe(false);
    expect(isAccountDeletionConfirmed("")).toBe(false);
  });
});

describe("deleting your own account", () => {
  let userId = 0;

  async function clean() {
    const rows = await db.select({ id: localUsers.id }).from(localUsers).where(eq(localUsers.phone, phone));
    for (const row of rows) {
      await db.delete(expenses).where(eq(expenses.userId, row.id));
      await db.delete(localUsers).where(eq(localUsers.id, row.id));
    }
  }

  beforeEach(async () => {
    if (process.env.RUN_DB_INTEGRATION !== "1") return;
    await clean();
    const [inserted] = await db.insert(localUsers).values({
      phone,
      password: await hashPassword("correct-password"),
      name: "DELETE_SELF_TEST",
    } as never);
    userId = Number((inserted as { insertId: number }).insertId);
    await db.insert(expenses).values({
      userId,
      userType: "local",
      type: "expense",
      amount: "50",
      category: "أكل وشرب",
      description: "test",
      rawText: "test",
      date: new Date(),
    } as never);
  });
  afterAll(async () => {
    if (process.env.RUN_DB_INTEGRATION === "1") await clean();
  });

  const caller = (role = "user") =>
    profileRouter.createCaller({
      user: { id: userId, type: "local", name: "DELETE_SELF_TEST", role, plan: "free" },
      req: new Request("http://local.test/trpc"),
      ip: "delete-self-test",
      resHeaders: new Headers(),
    } as never);

  itWithDatabase("refuses without the phrase, with a wrong password, and for an admin", async () => {
    await expect(caller().deleteMyAccount({ confirmation: "تمام", password: "correct-password" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller().deleteMyAccount({ confirmation: "احذف حسابي", password: "wrong" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "الباسورد مش صح.",
    });
    await expect(caller("admin").deleteMyAccount({ confirmation: "احذف حسابي", password: "correct-password" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await db.select().from(localUsers).where(eq(localUsers.id, userId))).toHaveLength(1);
  });

  itWithDatabase("removes the account and what it owns", async () => {
    await expect(
      caller().deleteMyAccount({ confirmation: "احذف حسابي", password: "correct-password" }),
    ).resolves.toEqual({ success: true });
    expect(await db.select().from(localUsers).where(eq(localUsers.id, userId))).toHaveLength(0);
    expect(await db.select().from(expenses).where(eq(expenses.userId, userId))).toHaveLength(0);
  });
});
