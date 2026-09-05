import { sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { expenseDailyRollups, expenses, expenseDetails } from "../../db/schema";
import { db } from "../queries/connection";
import { businessDateKey, startOfBusinessDay } from "../lib/app-time";

export type ExpenseRollupDelta = {
  userId: number;
  userType: string;
  businessId?: number | null;
  day: string; // "YYYY-MM-DD"
  incomeDelta?: number | Decimal | string;
  expenseDelta?: number | Decimal | string;
  transferDelta?: number | Decimal | string;
  investmentDelta?: number | Decimal | string;
  automatedIncomeDelta?: number | Decimal | string;
  automatedExpenseDelta?: number | Decimal | string;
  txnCountDelta?: number;
};

/**
 * Returns YYYY-MM-DD in Cairo business timezone.
 */
export function toDayString(date: Date | string): string {
  if (typeof date === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) {
      return businessDateKey(parsed);
    }
    return date.slice(0, 10);
  }
  return businessDateKey(date);
}

/**
 * Converts an expense row into a rollup delta.
 * Multiplier is +1 when adding an expense, or -1 when deleting or backing out the old state.
 * Only confirmed transactions contribute non-zero deltas.
 */
export function expenseToRollupDelta(
  expense: {
    userId: number;
    userType: string;
    businessId?: number | null;
    date: Date | string;
    type: string;
    amount: number | string | Decimal;
    source?: string | null;
    status?: string | null;
  },
  multiplier: 1 | -1 = 1,
): ExpenseRollupDelta {
  const day = toDayString(expense.date);
  const status = expense.status ?? "confirmed";
  const isConfirmed = status === "confirmed";
  const amount = isConfirmed
    ? new Decimal(expense.amount || 0).times(multiplier).toFixed(2)
    : "0.00";
  const isSms = expense.source === "sms";

  let incomeDelta = "0.00";
  let expenseDelta = "0.00";
  let transferDelta = "0.00";
  let investmentDelta = "0.00";
  let automatedIncomeDelta = "0.00";
  let automatedExpenseDelta = "0.00";

  if (isConfirmed) {
    switch (expense.type) {
      case "income":
        incomeDelta = amount;
        if (isSms) automatedIncomeDelta = amount;
        break;
      case "expense":
        expenseDelta = amount;
        if (isSms) automatedExpenseDelta = amount;
        break;
      case "transfer":
        transferDelta = amount;
        break;
      case "investment":
        investmentDelta = amount;
        break;
    }
  }

  return {
    userId: expense.userId,
    userType: expense.userType,
    businessId: expense.businessId ?? 0,
    day,
    incomeDelta,
    expenseDelta,
    transferDelta,
    investmentDelta,
    automatedIncomeDelta,
    automatedExpenseDelta,
    txnCountDelta: isConfirmed ? multiplier : 0,
  };
}

/**
 * Applies a rollup delta atomically inside any MySQL transaction or pool (§3.2).
 * GREATEST(0, ...) removed per specification so signed values and discrepancies
 * are preserved and alerted rather than silently swallowed.
 */
export async function applyExpenseRollupDelta(
  executor: any,
  delta: ExpenseRollupDelta,
): Promise<void> {
  const businessId = delta.businessId ?? 0;
  const inc = new Decimal(delta.incomeDelta || 0).toFixed(2);
  const exp = new Decimal(delta.expenseDelta || 0).toFixed(2);
  const trf = new Decimal(delta.transferDelta || 0).toFixed(2);
  const inv = new Decimal(delta.investmentDelta || 0).toFixed(2);
  const autoInc = new Decimal(delta.automatedIncomeDelta || 0).toFixed(2);
  const autoExp = new Decimal(delta.automatedExpenseDelta || 0).toFixed(2);
  const cnt = delta.txnCountDelta || 0;

  // Raw SQL query for guaranteed MySQL atomic ON DUPLICATE KEY UPDATE
  await executor.execute(sql`
    INSERT INTO expense_daily_rollups (
      user_id,
      user_type,
      business_id,
      day,
      income,
      expense,
      transfer,
      investment,
      automated_income,
      automated_expense,
      txn_count
    ) VALUES (
      ${delta.userId},
      ${delta.userType},
      ${businessId},
      ${delta.day},
      ${inc},
      ${exp},
      ${trf},
      ${inv},
      ${autoInc},
      ${autoExp},
      ${cnt}
    )
    ON DUPLICATE KEY UPDATE
      income = income + VALUES(income),
      expense = expense + VALUES(expense),
      transfer = transfer + VALUES(transfer),
      investment = investment + VALUES(investment),
      automated_income = automated_income + VALUES(automated_income),
      automated_expense = automated_expense + VALUES(automated_expense),
      txn_count = txn_count + VALUES(txn_count)
  `);

  // Detect negative amounts and log an alert rather than silently clamping
  try {
    const [checkRows] = await executor.execute(sql`
      SELECT income, expense, transfer, investment, automated_income, automated_expense, txn_count
      FROM expense_daily_rollups
      WHERE user_id = ${delta.userId}
        AND user_type = ${delta.userType}
        AND business_id = ${businessId}
        AND day = ${delta.day}
      LIMIT 1
    `);
    const r = (checkRows as any)?.[0];
    if (r) {
      const hasNegative =
        new Decimal(r.income || 0).isNegative() ||
        new Decimal(r.expense || 0).isNegative() ||
        new Decimal(r.transfer || 0).isNegative() ||
        new Decimal(r.investment || 0).isNegative() ||
        new Decimal(r.automated_income || 0).isNegative() ||
        new Decimal(r.automated_expense || 0).isNegative() ||
        Number(r.txn_count || 0) < 0;

      if (hasNegative) {
        console.warn(
          `[RollupAlert] Negative rollup detected for user ${delta.userType}:${delta.userId} on ${delta.day} (biz: ${businessId}):`,
          {
            income: r.income,
            expense: r.expense,
            transfer: r.transfer,
            investment: r.investment,
            automatedIncome: r.automated_income,
            automatedExpense: r.automated_expense,
            txnCount: r.txn_count,
          },
        );
      }
    }
  } catch {
    // Non-blocking alert check
  }
}

/**
 * Transfers all daily rollup aggregates from a business to personal (businessId = 0)
 * and purges the business rollup rows. Used when a business is deleted.
 */
export async function transferBusinessRollupsToPersonal(
  executor: any,
  userId: number,
  userType: string,
  businessId: number,
): Promise<void> {
  const [businessRollups] = await executor.execute(sql`
    SELECT day, income, expense, transfer, investment, automated_income, automated_expense, txn_count
    FROM expense_daily_rollups
    WHERE user_id = ${userId}
      AND user_type = ${userType}
      AND business_id = ${businessId}
  `);

  const rows = (businessRollups as unknown as Array<{
    day: string | Date;
    income: string | number;
    expense: string | number;
    transfer: string | number;
    investment: string | number;
    automated_income: string | number;
    automated_expense: string | number;
    txn_count: number;
  }>) || [];

  for (const row of rows) {
    const dayStr = toDayString(row.day);
    await executor.execute(sql`
      INSERT INTO expense_daily_rollups (
        user_id, user_type, business_id, day,
        income, expense, transfer, investment,
        automated_income, automated_expense, txn_count
      ) VALUES (
        ${userId}, ${userType}, 0, ${dayStr},
        ${row.income}, ${row.expense}, ${row.transfer}, ${row.investment},
        ${row.automated_income}, ${row.automated_expense}, ${row.txn_count}
      )
      ON DUPLICATE KEY UPDATE
        income = income + VALUES(income),
        expense = expense + VALUES(expense),
        transfer = transfer + VALUES(transfer),
        investment = investment + VALUES(investment),
        automated_income = automated_income + VALUES(automated_income),
        automated_expense = automated_expense + VALUES(automated_expense),
        txn_count = txn_count + VALUES(txn_count)
    `);
  }

  await executor.execute(sql`
    DELETE FROM expense_daily_rollups
    WHERE user_id = ${userId}
      AND user_type = ${userType}
      AND business_id = ${businessId}
  `);
}

/**
 * Dual-writes side-table expense_details on expense creation / update (§3.9).
 * Supports single expense or batch array of expenses.
 */
export async function syncExpenseDetails(
  executor: any,
  expenseIdOrList: number | Array<{ id: number; rawText?: string | null; parsedMetadata?: any }>,
  rawText?: string | null,
  parsedMetadata?: any,
): Promise<void> {
  if (Array.isArray(expenseIdOrList)) {
    const valid = expenseIdOrList.filter(
      (item) => item.id && (item.rawText !== undefined || item.parsedMetadata !== undefined),
    );
    if (valid.length === 0) return;
    for (const item of valid) {
      const metadataJson =
        item.parsedMetadata !== undefined ? JSON.stringify(item.parsedMetadata) : null;
      await executor.execute(sql`
        INSERT INTO expense_details (expense_id, raw_text, parsed_metadata)
        VALUES (${item.id}, ${item.rawText ?? null}, ${metadataJson})
        ON DUPLICATE KEY UPDATE
          raw_text = COALESCE(VALUES(raw_text), raw_text),
          parsed_metadata = COALESCE(VALUES(parsed_metadata), parsed_metadata)
      `);
    }
    return;
  }

  const expenseId = expenseIdOrList;
  if (rawText === undefined && parsedMetadata === undefined) return;

  const metadataJson =
    parsedMetadata !== undefined ? JSON.stringify(parsedMetadata) : null;

  await executor.execute(sql`
    INSERT INTO expense_details (expense_id, raw_text, parsed_metadata)
    VALUES (${expenseId}, ${rawText ?? null}, ${metadataJson})
    ON DUPLICATE KEY UPDATE
      raw_text = COALESCE(VALUES(raw_text), raw_text),
      parsed_metadata = COALESCE(VALUES(parsed_metadata), parsed_metadata)
  `);
}

/**
 * Deletes side-table details on expense deletion.
 */
export async function deleteExpenseDetails(
  executor: any,
  expenseId: number,
): Promise<void> {
  await executor.execute(sql`
    DELETE FROM expense_details WHERE expense_id = ${expenseId}
  `);
}

/**
 * Nightly reconciliation job for daily rollups (§3.2 / P3 Gate).
 * Detects any discrepancy between raw ledger (expenses) and rollups in Cairo business timezone,
 * cleans orphaned/ghost rollup rows, and restores true sums.
 */
export async function reconcileRollupsForRange(
  userId: number,
  userType: string,
  startDate: string, // "YYYY-MM-DD"
  endDate: string,   // "YYYY-MM-DD"
): Promise<{ repairedDays: number; driftDetected: boolean }> {
  // 1. Compute Cairo business day start and end bounds in UTC for ledger query
  const [sY, sM, sD] = startDate.split("-").map(Number);
  const startUtc = startOfBusinessDay(new Date(Date.UTC(sY, sM - 1, sD, 12)));

  const [eY, eM, eD] = endDate.split("-").map(Number);
  const nextDayNoon = new Date(Date.UTC(eY, eM - 1, eD + 1, 12));
  const endUtc = startOfBusinessDay(nextDayNoon);

  // 2. Fetch raw ledger expenses in the range (only confirmed status matches rollups)
  const [rawExpenses] = await db.execute(sql`
    SELECT
      id,
      COALESCE(business_id, 0) AS business_id,
      date,
      type,
      amount,
      source,
      status
    FROM expenses
    WHERE user_id = ${userId}
      AND user_type = ${userType}
      AND (status IS NULL OR status = 'confirmed')
      AND date >= ${startUtc}
      AND date < ${endUtc}
  `);

  type ExpenseRecord = {
    id: number;
    business_id: number | string;
    date: Date | string;
    type: string;
    amount: string | number;
    source?: string | null;
    status?: string | null;
  };

  const expensesList = (rawExpenses as unknown as ExpenseRecord[]) || [];

  // Group raw expenses by `${day}_${businessId}` in Cairo timezone
  type DayTruth = {
    day: string;
    businessId: number;
    income: Decimal;
    expense: Decimal;
    transfer: Decimal;
    investment: Decimal;
    automatedIncome: Decimal;
    automatedExpense: Decimal;
    txnCount: number;
  };

  const truthMap = new Map<string, DayTruth>();

  for (const exp of expensesList) {
    const dayStr = toDayString(exp.date);
    if (dayStr < startDate || dayStr > endDate) continue;

    const busId = Number(exp.business_id) || 0;
    const key = `${dayStr}_${busId}`;

    let item = truthMap.get(key);
    if (!item) {
      item = {
        day: dayStr,
        businessId: busId,
        income: new Decimal(0),
        expense: new Decimal(0),
        transfer: new Decimal(0),
        investment: new Decimal(0),
        automatedIncome: new Decimal(0),
        automatedExpense: new Decimal(0),
        txnCount: 0,
      };
      truthMap.set(key, item);
    }

    const amt = new Decimal(exp.amount || 0);
    const isSms = exp.source === "sms";

    switch (exp.type) {
      case "income":
        item.income = item.income.plus(amt);
        if (isSms) item.automatedIncome = item.automatedIncome.plus(amt);
        break;
      case "expense":
        item.expense = item.expense.plus(amt);
        if (isSms) item.automatedExpense = item.automatedExpense.plus(amt);
        break;
      case "transfer":
        item.transfer = item.transfer.plus(amt);
        break;
      case "investment":
        item.investment = item.investment.plus(amt);
        break;
    }
    item.txnCount++;
  }

  // 3. Query existing rollup rows in this range
  const [existingRows] = await db.execute(sql`
    SELECT
      day,
      COALESCE(business_id, 0) AS business_id,
      income,
      expense,
      transfer,
      investment,
      automated_income,
      automated_expense,
      txn_count
    FROM expense_daily_rollups
    WHERE user_id = ${userId}
      AND user_type = ${userType}
      AND day >= ${startDate}
      AND day <= ${endDate}
  `);

  type ExistingRollup = {
    day: string | Date;
    business_id: number | string;
    income: string | number;
    expense: string | number;
    transfer: string | number;
    investment: string | number;
    automated_income: string | number;
    automated_expense: string | number;
    txn_count: number;
  };

  const rollupsList = (existingRows as unknown as ExistingRollup[]) || [];
  const existingMap = new Map<string, ExistingRollup>();

  for (const r of rollupsList) {
    const dayStr = toDayString(r.day);
    const busId = Number(r.business_id) || 0;
    const key = `${dayStr}_${busId}`;
    existingMap.set(key, r);
  }

  let repairedDays = 0;
  let driftDetected = false;

  // 4. Reconcile union of keys
  const allKeys = new Set([...truthMap.keys(), ...existingMap.keys()]);

  for (const key of allKeys) {
    const truth = truthMap.get(key);
    const existing = existingMap.get(key);
    const [dayStr, busIdStr] = key.split("_");
    const busId = Number(busIdStr);

    if (!truth) {
      // Key exists in rollups, but has 0 records in raw ledger (ghost / orphaned row)
      const hasExistingValues =
        Number(existing?.txn_count || 0) !== 0 ||
        !new Decimal(existing?.income || 0).isZero() ||
        !new Decimal(existing?.expense || 0).isZero() ||
        !new Decimal(existing?.transfer || 0).isZero() ||
        !new Decimal(existing?.investment || 0).isZero() ||
        !new Decimal(existing?.automated_income || 0).isZero() ||
        !new Decimal(existing?.automated_expense || 0).isZero();

      if (hasExistingValues) {
        driftDetected = true;
        repairedDays++;
      }
      // Purge orphaned/ghost row from daily rollups
      await db.execute(sql`
        DELETE FROM expense_daily_rollups
        WHERE user_id = ${userId}
          AND user_type = ${userType}
          AND business_id = ${busId}
          AND day = ${dayStr}
      `);
    } else if (!existing) {
      // Missing rollup row for days that have expenses
      driftDetected = true;
      repairedDays++;
      await db.execute(sql`
        INSERT INTO expense_daily_rollups (
          user_id, user_type, business_id, day,
          income, expense, transfer, investment,
          automated_income, automated_expense, txn_count
        ) VALUES (
          ${userId}, ${userType}, ${busId}, ${dayStr},
          ${truth.income.toFixed(2)}, ${truth.expense.toFixed(2)},
          ${truth.transfer.toFixed(2)}, ${truth.investment.toFixed(2)},
          ${truth.automatedIncome.toFixed(2)}, ${truth.automatedExpense.toFixed(2)},
          ${truth.txnCount}
        )
      `);
    } else {
      // Both exist: check if values match to the piastre
      const hasDiscrepancy =
        !new Decimal(existing.income || 0).equals(truth.income) ||
        !new Decimal(existing.expense || 0).equals(truth.expense) ||
        !new Decimal(existing.transfer || 0).equals(truth.transfer) ||
        !new Decimal(existing.investment || 0).equals(truth.investment) ||
        !new Decimal(existing.automated_income || 0).equals(truth.automatedIncome) ||
        !new Decimal(existing.automated_expense || 0).equals(truth.automatedExpense) ||
        Number(existing.txn_count) !== truth.txnCount;

      if (hasDiscrepancy) {
        driftDetected = true;
        repairedDays++;
        await db.execute(sql`
          UPDATE expense_daily_rollups
          SET
            income = ${truth.income.toFixed(2)},
            expense = ${truth.expense.toFixed(2)},
            transfer = ${truth.transfer.toFixed(2)},
            investment = ${truth.investment.toFixed(2)},
            automated_income = ${truth.automatedIncome.toFixed(2)},
            automated_expense = ${truth.automatedExpense.toFixed(2)},
            txn_count = ${truth.txnCount}
          WHERE user_id = ${userId}
            AND user_type = ${userType}
            AND business_id = ${busId}
            AND day = ${dayStr}
        `);
      }
    }
  }

  // Invalidate consumer caches if any drift was detected and repaired
  if (driftDetected) {
    try {
      const { cacheIncr } = await import("../lib/redis-client");
      const { CacheKeys } = await import("../lib/cache-keys");
      const { invalidateFinanceUserCache } = await import("./finance-semantic-layer");
      await cacheIncr(CacheKeys.cacheGen(userType, userId));
      await invalidateFinanceUserCache(userId, userType);
    } catch {
      // Non-blocking cache invalidation
    }
  }

  return { repairedDays, driftDetected };
}

