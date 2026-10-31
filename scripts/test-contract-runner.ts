import { serve } from "@hono/node-server";
import { db } from "../api/queries/connection";
import {
  localUsers,
  userWallets,
  expenses,
  pendingClarifications,
  expenseDailyRollups,
} from "../db/schema";
import { generateToken, createSession, hashPassword } from "../api/local-auth-utils";
import { eq, and } from "drizzle-orm";

async function main() {
  const TEST_USER_ID = 88991;
  const TEST_PHONE = "01012345678";

  console.log("Seeding test user and ledger rows...");

  // Clean old rows if any
  await db.delete(expenses).where(and(eq(expenses.userId, TEST_USER_ID), eq(expenses.userType, "local")));
  await db.delete(userWallets).where(and(eq(userWallets.userId, TEST_USER_ID), eq(userWallets.userType, "local")));
  await db.delete(pendingClarifications).where(and(eq(pendingClarifications.userId, TEST_USER_ID), eq(pendingClarifications.userType, "local")));
  await db.delete(expenseDailyRollups).where(and(eq(expenseDailyRollups.userId, TEST_USER_ID), eq(expenseDailyRollups.userType, "local")));
  await db.delete(localUsers).where(eq(localUsers.id, TEST_USER_ID));

  // Insert test user
  await db.insert(localUsers).values({
    id: TEST_USER_ID,
    name: "محمود تيست",
    phone: TEST_PHONE,
    password: await hashPassword("testpass123"),
    plan: "free",
    role: "user",
  });

  // Generate real JWT token & session
  const token = await generateToken(TEST_USER_ID, "local");
  await createSession(TEST_USER_ID, "local", token, {
    ipAddress: "127.0.0.1",
    userAgent: "SmartSpendMobileContractTest/1.0",
  });

  // Insert a test wallet
  const [walletResult] = await db.insert(userWallets).values({
    id: 1,
    userId: TEST_USER_ID,
    userType: "local",
    name: "كارت CIB",
    provider: "CIB",
    lastFourDigits: "1234",
    balance: "5000.00",
    balanceObservedAt: new Date("2026-10-31T12:00:00Z"),
    balanceSource: "user",
  });

  // Insert test expenses for October 2026
  await db.insert(expenses).values([
    {
      id: 101,
      userId: TEST_USER_ID,
      userType: "local",
      amount: "185.00",
      type: "expense",
      category: "أكل وشرب",
      subCategory: "دليفري",
      description: "Talabat",
      rawText: "طلبت أكل من طلبات بـ 185",
      source: "manual",
      walletId: 1,
      date: new Date("2026-10-19T14:20:00Z"),
      status: "confirmed",
    },
    {
      id: 102,
      userId: TEST_USER_ID,
      userType: "local",
      amount: "15000.00",
      type: "income",
      category: "مرتب",
      subCategory: "مرتب أساسي",
      description: "المرتب",
      rawText: "نزل المرتب 15000",
      source: "manual",
      walletId: 1,
      date: new Date("2026-10-18T09:00:00Z"),
      status: "confirmed",
    },
  ]);

  // Insert daily rollups for the month summary
  await db.insert(expenseDailyRollups).values([
    {
      userId: TEST_USER_ID,
      userType: "local",
      businessId: 0,
      day: "2026-10-19",
      expense: "185.00",
      income: "0.00",
      transfer: "0.00",
      investment: "0.00",
      automatedExpense: "0.00",
      automatedIncome: "0.00",
      txnCount: 1,
    },
    {
      userId: TEST_USER_ID,
      userType: "local",
      businessId: 0,
      day: "2026-10-18",
      expense: "0.00",
      income: "15000.00",
      transfer: "0.00",
      investment: "0.00",
      automatedExpense: "0.00",
      automatedIncome: "0.00",
      txnCount: 1,
    },
  ]);

  // Insert a test pending clarification
  await db.insert(pendingClarifications).values({
    id: 501,
    userId: TEST_USER_ID,
    userType: "local",
    originalText: "سلفت محمد 500",
    question: "مين محمد؟",
    status: "pending",
  });

  // Now boot the server
  const { app } = await import("../api/boot");
  const port = 3005;
  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });

  console.log(`CONTRACT_READY:http://127.0.0.1:${port}/trpc:${token}`);

  // Handle process shutdown
  process.on("SIGINT", () => {
    server.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Test contract runner failure:", err);
  process.exit(1);
});
