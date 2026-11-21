/**
 * `wallet.getWalletMonth` against a real `expenses`: a wallet's money in and out over one Cairo month, every row of
 * it, only the caller's, with transfers counted in neither and a refund counted as money in.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Context } from "../api/context";
import { db } from "../api/queries/connection";
import { walletRouter } from "../api/wallet-router";
import { expenses } from "../db/schema";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_961, userType: "local" as const };
const stranger = { userId: 88_962, userType: "local" as const };
const WALLET = 7_701;

async function clean() {
  for (const who of [user, stranger]) {
    await db.delete(expenses).where(and(eq(expenses.userId, who.userId), eq(expenses.userType, who.userType)));
  }
}

async function row(
  who: typeof user,
  values: { type: string; amount: number; date: string; walletId?: number | null; status?: string },
) {
  await db.insert(expenses).values({
    userId: who.userId,
    userType: who.userType,
    type: values.type,
    amount: values.amount.toFixed(2),
    category: values.type === "income" ? "مرتب" : "أكل وشرب",
    description: "test",
    rawText: "test",
    source: "manual",
    date: new Date(values.date),
    walletId: values.walletId === undefined ? WALLET : values.walletId,
    ...(values.status ? { status: values.status } : {}),
  });
}

const caller = (who: typeof user) =>
  walletRouter.createCaller({
    user: { id: who.userId, type: who.userType },
    req: new Request("http://localhost/api/trpc/wallet.getWalletMonth"),
    resHeaders: new Headers(),
    ip: "127.0.0.1",
  } as unknown as Context);

describe("a wallet's month", () => {
  beforeEach(clean);
  afterAll(clean);

  itWithDatabase("sums every row of the Cairo month, money in apart from money out", async () => {
    // 00:30 on October 1st in Cairo is still September 30th in UTC: it belongs to October.
    await row(user, { type: "expense", amount: 100, date: "2026-09-30T21:30:00Z" });
    // 23:30 on October 31st in Cairo (UTC+2 again from the 30th) is in October; 00:30 on November 1st is not.
    await row(user, { type: "expense", amount: 40, date: "2026-10-31T21:30:00Z" });
    await row(user, { type: "expense", amount: 999, date: "2026-10-31T22:30:00Z" });
    await row(user, { type: "income", amount: 15_000, date: "2026-10-05T08:00:00Z" });
    // A refund saved negative in its category is money that came back.
    await row(user, { type: "expense", amount: -25, date: "2026-10-07T08:00:00Z" });
    // A transfer between the person's own accounts is neither.
    await row(user, { type: "transfer", amount: 500, date: "2026-10-08T08:00:00Z" });
    // Another wallet, no wallet, and a row waiting for confirmation do not count.
    await row(user, { type: "expense", amount: 70, date: "2026-10-09T08:00:00Z", walletId: 7_702 });
    await row(user, { type: "expense", amount: 80, date: "2026-10-09T08:00:00Z", walletId: null });
    await row(user, { type: "expense", amount: 90, date: "2026-10-09T08:00:00Z", status: "pending" });
    // Another account's rows under the same wallet id never count.
    await row(stranger, { type: "expense", amount: 5_000, date: "2026-10-10T08:00:00Z" });

    const month = await caller(user).getWalletMonth({ walletId: WALLET, month: "2026-10" });

    expect(month).toEqual({ month: "2026-10", moneyIn: 15_025, moneyOut: 140, count: 5 });
  });

  itWithDatabase("runs from payday to payday when the person has one", async () => {
    await row(user, { type: "expense", amount: 10, date: "2026-10-24T10:00:00Z" });
    await row(user, { type: "expense", amount: 20, date: "2026-10-25T10:00:00Z" });
    await row(user, { type: "expense", amount: 30, date: "2026-11-24T10:00:00Z" });
    await row(user, { type: "expense", amount: 40, date: "2026-11-25T10:00:00Z" });

    const month = await caller(user).getWalletMonth({ walletId: WALLET, month: "2026-10", salaryDay: 25 });

    expect(month.moneyOut).toBe(50);
  });
});
