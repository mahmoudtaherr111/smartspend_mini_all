import { describe, it, expect, beforeEach } from "vitest";
import {
  toDayString,
  expenseToRollupDelta,
  applyExpenseRollupDelta,
  transferBusinessRollupsToPersonal,
  reconcileRollupsForRange,
} from "../api/services/expense-rollups";
import Decimal from "decimal.js";
import { db } from "../api/queries/connection";
import { expenses, expenseDailyRollups } from "../db/schema";
import { eq, and, sql, gte, lt } from "drizzle-orm";
import { businessDateKey } from "../api/lib/app-time";
import { expenseRouter } from "../api/expense-router";

describe("Expense Daily Rollups Architecture & Reconciliation (P3 Overhaul)", () => {
  const testUserId = 88802;
  const testUserType = "local";

  const callerCtx = {
    user: {
      id: testUserId,
      type: testUserType,
      role: "user" as const,
      plan: "pro" as const,
      name: "Parity Test User",
      email: "parity@test.com",
    },
  };
  const caller = expenseRouter.createCaller(callerCtx as any);

  beforeEach(async () => {
    // Clean up test state before each run
    try {
      await db
        .delete(expenseDailyRollups)
        .where(
          and(
            eq(expenseDailyRollups.userId, testUserId),
            eq(expenseDailyRollups.userType, testUserType),
          ),
        );
      await db
        .delete(expenses)
        .where(
          and(
            eq(expenses.userId, testUserId),
            eq(expenses.userType, testUserType),
          ),
        );
    } catch {
      // ignore
    }
  });

  it("1. aligns day string calculation to Cairo timezone across app time and rollups", () => {
    // UTC late evening: 2026-09-03 at 22:30 UTC
    // In Cairo (+3 DST in Sept), this instant is 2026-09-04 at 01:30 AM
    const lateEveningUtc = new Date("2026-09-03T22:30:00.000Z");

    const cairoAppDay = businessDateKey(lateEveningUtc);
    const rollupDay = toDayString(lateEveningUtc);

    expect(cairoAppDay).toBe("2026-09-04");
    expect(rollupDay).toBe("2026-09-04");
    expect(rollupDay).toBe(cairoAppDay);

    // Earlier in the evening: 20:00 UTC = 23:00 Cairo on Sept 3
    const earlierEveningUtc = new Date("2026-09-03T20:00:00.000Z");
    expect(toDayString(earlierEveningUtc)).toBe("2026-09-03");

    // Pure date string returns untouched
    expect(toDayString("2026-09-04")).toBe("2026-09-04");
  });

  it("2. allows signed negative rollup deltas without GREATEST(0, ...) clamping", async () => {
    const testDay = "2026-09-04";

    // 1. Initial positive rollup: 150.00
    await applyExpenseRollupDelta(db, {
      userId: testUserId,
      userType: testUserType,
      businessId: 0,
      day: testDay,
      expenseDelta: "150.00",
      txnCountDelta: 1,
    });

    // 2. Back out 100.00
    await applyExpenseRollupDelta(db, {
      userId: testUserId,
      userType: testUserType,
      businessId: 0,
      day: testDay,
      expenseDelta: "-100.00",
      txnCountDelta: -1,
    });

    // 3. Back out another 100.00 (total = -50.00)
    await applyExpenseRollupDelta(db, {
      userId: testUserId,
      userType: testUserType,
      businessId: 0,
      day: testDay,
      expenseDelta: "-100.00",
      txnCountDelta: -1,
    });

    const [row] = await db
      .select()
      .from(expenseDailyRollups)
      .where(
        and(
          eq(expenseDailyRollups.userId, testUserId),
          eq(expenseDailyRollups.userType, testUserType),
          eq(expenseDailyRollups.day, testDay),
        ),
      );

    expect(row).toBeDefined();
    // Negative number is retained so that discrepancies are visible and can alert rather than being silenced
    expect(new Decimal(row.expense).toFixed(2)).toBe("-50.00");
    expect(row.txnCount).toBe(-1);
  });

  it("3. unifies status filtering: unconfirmed expenses generate 0 delta and are ignored by reconciliation", async () => {
    const testDay = "2026-09-04";

    // Unconfirmed / pending clarification expense
    const pendingDelta = expenseToRollupDelta(
      {
        userId: testUserId,
        userType: testUserType,
        date: testDay,
        type: "expense",
        amount: "500.00",
        status: "pending_clarification",
      },
      1,
    );

    expect(pendingDelta.expenseDelta).toBe("0.00");
    expect(pendingDelta.txnCountDelta).toBe(0);

    // Insert pending expense into raw ledger
    await db.insert(expenses).values({
      userId: testUserId,
      userType: testUserType,
      amount: "500.00",
      type: "expense",
      category: "عام",
      status: "pending_clarification",
      date: new Date(`${testDay}T12:00:00Z`),
    });

    // Reconcile: since status != confirmed, reconciliation should NOT create a rollup row
    const res = await reconcileRollupsForRange(testUserId, testUserType, testDay, testDay);
    expect(res.driftDetected).toBe(false);
    expect(res.repairedDays).toBe(0);

    const rollups = await db
      .select()
      .from(expenseDailyRollups)
      .where(
        and(
          eq(expenseDailyRollups.userId, testUserId),
          eq(expenseDailyRollups.userType, testUserType),
          eq(expenseDailyRollups.day, testDay),
        ),
      );
    expect(rollups).toHaveLength(0);
  });

  it("4. transfers business rollups to personal (businessId = 0) on business deletion", async () => {
    const testDay = "2026-09-04";
    const testBizId = 991;

    // Seed personal and business rollups
    await applyExpenseRollupDelta(db, {
      userId: testUserId,
      userType: testUserType,
      businessId: 0,
      day: testDay,
      expenseDelta: "100.00",
      txnCountDelta: 1,
    });
    await applyExpenseRollupDelta(db, {
      userId: testUserId,
      userType: testUserType,
      businessId: testBizId,
      day: testDay,
      expenseDelta: "250.00",
      txnCountDelta: 2,
    });

    // Delete business transfer
    await transferBusinessRollupsToPersonal(db, testUserId, testUserType, testBizId);

    // Business bucket should be deleted
    const bizRollup = await db
      .select()
      .from(expenseDailyRollups)
      .where(
        and(
          eq(expenseDailyRollups.userId, testUserId),
          eq(expenseDailyRollups.userType, testUserType),
          eq(expenseDailyRollups.businessId, testBizId),
        ),
      );
    expect(bizRollup).toHaveLength(0);

    // Personal bucket should now have 100 + 250 = 350.00 and 1 + 2 = 3 txns
    const [personalRollup] = await db
      .select()
      .from(expenseDailyRollups)
      .where(
        and(
          eq(expenseDailyRollups.userId, testUserId),
          eq(expenseDailyRollups.userType, testUserType),
          eq(expenseDailyRollups.businessId, 0),
          eq(expenseDailyRollups.day, testDay),
        ),
      );
    expect(personalRollup).toBeDefined();
    expect(new Decimal(personalRollup.expense).toFixed(2)).toBe("350.00");
    expect(personalRollup.txnCount).toBe(3);
  });

  async function getLegacyMonthlyLedgerStats(
    userId: number,
    userType: string,
    calendarMonth: string,
    salaryDay?: number | null,
  ) {
    const { getFinancialMonthDayRange } = await import("../api/services/financial-month");
    const period = getFinancialMonthDayRange(calendarMonth, salaryDay);

    const rows = await db
      .select({
        amount: expenses.amount,
        type: expenses.type,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.userType, userType),
          sql`(${expenses.businessId} IS NULL OR ${expenses.businessId} = 0)`,
          sql`(${expenses.status} IS NULL OR ${expenses.status} = 'confirmed')`,
          gte(expenses.date, period.startUtc),
          lt(expenses.date, period.endUtc),
        ),
      );

    let totalExpense = new Decimal(0);
    let totalIncome = new Decimal(0);
    let count = 0;

    for (const row of rows) {
      const amt = new Decimal(row.amount || 0);
      if (row.type === "expense") totalExpense = totalExpense.plus(amt);
      if (row.type === "income") totalIncome = totalIncome.plus(amt);
      count++;
    }

    return {
      totalExpense: totalExpense.toNumber(),
      totalIncome: totalIncome.toNumber(),
      netFlow: totalIncome.minus(totalExpense).toNumber(),
      count,
    };
  }

  async function getLegacyYearlyLedgerStats(
    userId: number,
    userType: string,
    year: string,
  ) {
    const { startOfBusinessDay } = await import("../api/lib/app-time");
    const startUtc = startOfBusinessDay(new Date(Date.UTC(Number(year), 0, 1, 12)));
    const endUtc = startOfBusinessDay(new Date(Date.UTC(Number(year) + 1, 0, 1, 12)));

    const rows = await db
      .select({
        amount: expenses.amount,
        type: expenses.type,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.userType, userType),
          sql`(${expenses.businessId} IS NULL OR ${expenses.businessId} = 0)`,
          sql`(${expenses.status} IS NULL OR ${expenses.status} = 'confirmed')`,
          gte(expenses.date, startUtc),
          lt(expenses.date, endUtc),
        ),
      );

    let totalExpense = new Decimal(0);
    let totalIncome = new Decimal(0);
    let count = 0;

    for (const row of rows) {
      const amt = new Decimal(row.amount || 0);
      if (row.type === "expense") totalExpense = totalExpense.plus(amt);
      if (row.type === "income") totalIncome = totalIncome.plus(amt);
      count++;
    }

    return {
      totalExpense: totalExpense.toNumber(),
      totalIncome: totalIncome.toNumber(),
      netFlow: totalIncome.minus(totalExpense).toNumber(),
      count,
    };
  }

  it("5. verifies exact numerical parity between router procedures and raw ledger truth with custom salary day, Cairo boundary instant, updates, and deletes", async () => {
    // 1. Create expenses via router
    // Exp 1: Regular expense inside Sept 5 cycle
    const exp1 = await caller.create({
      amount: 150.75,
      type: "expense",
      category: "طعام",
      description: "غداء عمل",
      rawText: "غداء عمل 150.75",
      date: "2026-09-06",
    });

    // Exp 2: Second expense inside cycle
    const exp2 = await caller.create({
      amount: 320.25,
      type: "expense",
      category: "تسوق",
      description: "مشتريات سوبرماركت",
      rawText: "مشتريات سوبرماركت 320.25",
      date: "2026-09-10",
    });

    // Exp 3: Boundary instant transaction: 2026-09-04 22:30 UTC = 2026-09-05 01:30 AM Cairo time
    // Tests that late-night transactions properly fall on Sept 5 salary day in both rollups and ledger
    const expBoundary = await caller.create({
      amount: 95.50,
      type: "expense",
      category: "ترفيه",
      description: "سهرة ليلية",
      rawText: "سهرة 95.50",
      date: "2026-09-04T22:30:00.000Z",
    });

    // Inc 1: Salary income on Sept 5
    const inc1 = await caller.create({
      amount: 12000.00,
      type: "income",
      category: "راتب",
      description: "مرتب شهري",
      rawText: "مرتب شهري 12000",
      date: "2026-09-05",
    });

    // Exp 4: An expense outside the financial month cycle (before salaryDay 5, on 2026-09-02)
    await caller.create({
      amount: 50.00,
      type: "expense",
      category: "مواصلات",
      description: "أجرة تاكسي",
      rawText: "تاكسي 50",
      date: "2026-09-02",
    });

    // 2. Query router getMonthlyStats and getMonthSummary for salaryDay = 5
    const statsSalary5 = await caller.getMonthlyStats({
      month: "2026-09",
      salaryDay: 5,
    });
    const summarySalary5 = await caller.getMonthSummary({
      month: "2026-09",
      salaryDay: 5,
    });

    // Query ground-truth from raw ledger directly
    const groundTruthSalary5 = await getLegacyMonthlyLedgerStats(
      testUserId,
      testUserType,
      "2026-09",
      5,
    );

    // Assert 100% exact parity to the piastre
    expect(statsSalary5.totalExpense).toBe(groundTruthSalary5.totalExpense);
    expect(statsSalary5.totalIncome).toBe(groundTruthSalary5.totalIncome);
    expect(statsSalary5.netFlow).toBe(groundTruthSalary5.netFlow);
    expect(statsSalary5.totalTxnCount).toBe(groundTruthSalary5.count);

    expect(summarySalary5.totalExpense).toBe(groundTruthSalary5.totalExpense);
    expect(summarySalary5.totalIncome).toBe(groundTruthSalary5.totalIncome);
    expect(summarySalary5.count).toBe(groundTruthSalary5.count);
    expect(summarySalary5.netFlow).toBe(groundTruthSalary5.netFlow);

    // Verify category breakdown sum strictly equals ground-truth total
    const categorySum = statsSalary5.categoryBreakdown.reduce((s, c) => s + c.value, 0);
    expect(categorySum).toBe(groundTruthSalary5.totalExpense);

    // 3. Update expense via router (change amount from 150.75 to 200.00)
    await caller.update({
      id: exp1.id,
      amount: 200.00,
    });

    const statsAfterUpdate = await caller.getMonthlyStats({
      month: "2026-09",
      salaryDay: 5,
    });
    const groundTruthAfterUpdate = await getLegacyMonthlyLedgerStats(
      testUserId,
      testUserType,
      "2026-09",
      5,
    );
    expect(statsAfterUpdate.totalExpense).toBe(groundTruthAfterUpdate.totalExpense);
    expect(statsAfterUpdate.totalTxnCount).toBe(groundTruthAfterUpdate.count);

    // 4. Delete expense via router (delete exp2: 320.25)
    await caller.delete({
      id: exp2.id,
    });

    const statsAfterDelete = await caller.getMonthlyStats({
      month: "2026-09",
      salaryDay: 5,
    });
    const groundTruthAfterDelete = await getLegacyMonthlyLedgerStats(
      testUserId,
      testUserType,
      "2026-09",
      5,
    );
    expect(statsAfterDelete.totalExpense).toBe(groundTruthAfterDelete.totalExpense);
    expect(statsAfterDelete.totalTxnCount).toBe(groundTruthAfterDelete.count);

    // 5. Normal calendar month (salaryDay = 1)
    // Includes exp1 (200.00), expBoundary (95.50), inc1 (12000.00), and taxi (50.00)
    const statsCalendar = await caller.getMonthlyStats({
      month: "2026-09",
      salaryDay: 1,
    });
    const summaryCalendar = await caller.getMonthSummary({
      month: "2026-09",
      salaryDay: 1,
    });
    const groundTruthCalendar = await getLegacyMonthlyLedgerStats(
      testUserId,
      testUserType,
      "2026-09",
      1,
    );

    expect(statsCalendar.totalExpense).toBe(groundTruthCalendar.totalExpense);
    expect(statsCalendar.totalIncome).toBe(groundTruthCalendar.totalIncome);
    expect(statsCalendar.totalTxnCount).toBe(groundTruthCalendar.count);

    expect(summaryCalendar.totalExpense).toBe(groundTruthCalendar.totalExpense);
    expect(summaryCalendar.totalIncome).toBe(groundTruthCalendar.totalIncome);
    expect(summaryCalendar.count).toBe(groundTruthCalendar.count);

    // 6. Yearly stats parity
    const yearlyStats = await caller.getYearlyStats({
      year: "2026",
    });
    const groundTruthYearly = await getLegacyYearlyLedgerStats(
      testUserId,
      testUserType,
      "2026",
    );

    expect(yearlyStats.totalExpense).toBe(groundTruthYearly.totalExpense);
    expect(yearlyStats.totalIncome).toBe(groundTruthYearly.totalIncome);
    expect(yearlyStats.netFlow).toBe(groundTruthYearly.netFlow);
    expect(yearlyStats.count).toBe(groundTruthYearly.count);
  });

  it("6. detects and repairs real artificial drift: corrupted amounts, orphaned ghost rows, and zero-drift clean passes", async () => {
    const testDay = "2026-09-15";

    // 1. Seed legitimate expense: 300.00
    await caller.create({
      amount: 300.00,
      type: "expense",
      category: "ترفيه",
      rawText: "سينما 300",
      date: testDay,
    });

    // ─── Scenario A: Corrupted rollup amount ───
    await db.execute(sql`
      UPDATE expense_daily_rollups
      SET expense = '888888.88'
      WHERE user_id = ${testUserId}
        AND user_type = ${testUserType}
        AND day = ${testDay}
    `);

    // Run reconciliation
    const reconCorrupt = await reconcileRollupsForRange(
      testUserId,
      testUserType,
      testDay,
      testDay,
    );
    expect(reconCorrupt.driftDetected).toBe(true);
    expect(reconCorrupt.repairedDays).toBe(1);

    // Verify restored to exact ledger amount (300.00)
    const [repairedRow] = await db
      .select({ expense: expenseDailyRollups.expense })
      .from(expenseDailyRollups)
      .where(
        and(
          eq(expenseDailyRollups.userId, testUserId),
          eq(expenseDailyRollups.userType, testUserType),
          eq(expenseDailyRollups.day, testDay),
        ),
      );
    expect(new Decimal(repairedRow.expense).toFixed(2)).toBe("300.00");

    // ─── Scenario B: Orphaned ghost rollup row ───
    // A ghost rollup row claiming 750.00 on a day with 0 underlying expenses
    const ghostDay = "2026-09-20";
    await db.execute(sql`
      INSERT INTO expense_daily_rollups (
        user_id, user_type, business_id, day,
        income, expense, transfer, investment,
        automated_income, automated_expense, txn_count
      ) VALUES (
        ${testUserId}, ${testUserType}, 0, ${ghostDay},
        '0.00', '750.00', '0.00', '0.00', '0.00', '0.00', 3
      )
    `);

    // Reconcile across both days
    const reconGhost = await reconcileRollupsForRange(
      testUserId,
      testUserType,
      testDay,
      ghostDay,
    );
    expect(reconGhost.driftDetected).toBe(true);
    expect(reconGhost.repairedDays).toBe(1);

    // Ghost row MUST be purged from the database
    const ghostCheck = await db
      .select()
      .from(expenseDailyRollups)
      .where(
        and(
          eq(expenseDailyRollups.userId, testUserId),
          eq(expenseDailyRollups.userType, testUserType),
          eq(expenseDailyRollups.day, ghostDay),
        ),
      );
    expect(ghostCheck).toHaveLength(0);

    // ─── Scenario C: Clean state — zero drift detected ───
    const reconClean = await reconcileRollupsForRange(
      testUserId,
      testUserType,
      testDay,
      ghostDay,
    );
    expect(reconClean.driftDetected).toBe(false);
    expect(reconClean.repairedDays).toBe(0);
  });
});
