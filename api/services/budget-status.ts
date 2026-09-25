/**
 * Where each of a user's budgets stands in its current cycle, and the alerts it owes.
 *
 * A budget is a monthly limit, optionally for one category, whose cycle starts on its own
 * day of the month in Cairo business time. Spending is expense rows only, as on Home.
 * Each budget warns once per cycle when it reaches its alert threshold and once when it
 * passes its limit; the cycles already warned are kept in the budget's metadata.
 */
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../queries/connection";
import { expenses, userBudgets } from "../../db/schema";
import { businessDateKey, startOfBusinessDay } from "../lib/app-time";

/** The cycle of a budget that contains `reference`, in Cairo business days. */
export function budgetCycle(reference: Date, periodStartDay: number): { startDate: Date; endDate: Date } {
  const [year, month] = businessDateKey(reference).split("-").map(Number);
  const currentDay = Number(businessDateKey(reference).slice(-2));
  let startYear = year;
  let startMonthIndex = month - 1;
  if (currentDay < periodStartDay) {
    startMonthIndex -= 1;
    if (startMonthIndex < 0) {
      startMonthIndex = 11;
      startYear -= 1;
    }
  }
  const startDay = Math.min(periodStartDay, new Date(Date.UTC(startYear, startMonthIndex + 1, 0)).getUTCDate());
  let endYear = startYear;
  let endMonthIndex = startMonthIndex + 1;
  if (endMonthIndex > 11) {
    endMonthIndex = 0;
    endYear += 1;
  }
  const endDay = Math.min(periodStartDay, new Date(Date.UTC(endYear, endMonthIndex + 1, 0)).getUTCDate());
  return {
    startDate: startOfBusinessDay(new Date(Date.UTC(startYear, startMonthIndex, startDay, 12))),
    endDate: startOfBusinessDay(new Date(Date.UTC(endYear, endMonthIndex, endDay, 12))),
  };
}

export type BudgetRow = typeof userBudgets.$inferSelect;

export interface BudgetStatus extends BudgetRow {
  currentSpent: number;
  percentage: number;
  isExceeded: boolean;
  isNearLimit: boolean;
  cycleStart: Date;
  cycleEnd: Date;
}

/** Pure: a budget's standing given the expense rows of its cycle. */
export function budgetStanding(
  budget: BudgetRow,
  rows: Array<{ category: string; amount: string | number; date: Date }>,
  cycle: { startDate: Date; endDate: Date },
): BudgetStatus {
  const spent = rows
    .filter((row) => row.date >= cycle.startDate && row.date < cycle.endDate)
    .filter((row) => !budget.category || row.category === budget.category)
    .reduce((total, row) => total + Number(row.amount), 0);
  const limit = Number(budget.monthlyLimit) || 1;
  const percentage = Math.round((spent / limit) * 100);
  return {
    ...budget,
    currentSpent: spent,
    percentage,
    isExceeded: spent > limit,
    isNearLimit: percentage >= (budget.alertThresholdPercent ?? 80),
    cycleStart: cycle.startDate,
    cycleEnd: cycle.endDate,
  };
}

/** Every budget of the user with what was spent in its current cycle. */
export async function listBudgetStatuses(userId: number, userType: string, now = new Date()): Promise<BudgetStatus[]> {
  const budgets = await db
    .select()
    .from(userBudgets)
    .where(and(eq(userBudgets.userId, userId), eq(userBudgets.userType, userType)));
  if (budgets.length === 0) return [];

  const cycles = new Map(budgets.map((budget) => [budget.id, budgetCycle(now, budget.periodStartDay || 1)]));
  const starts = [...cycles.values()].map((cycle) => cycle.startDate.getTime());
  const ends = [...cycles.values()].map((cycle) => cycle.endDate.getTime());
  const rows = await db
    .select({ category: expenses.category, amount: expenses.amount, date: expenses.date })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        eq(expenses.userType, userType),
        eq(expenses.type, "expense"),
        gte(expenses.date, new Date(Math.min(...starts))),
        lt(expenses.date, new Date(Math.max(...ends))),
      ),
    );

  return budgets
    .map((budget) => budgetStanding(budget, rows, cycles.get(budget.id)!))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export type BudgetAlert = "near_limit" | "exceeded";

/**
 * The alerts a budget owes now, given the ones already sent this cycle: exceeded once,
 * and near-limit once unless the budget went straight past its limit.
 */
export function dueBudgetAlerts(status: BudgetStatus, sent: BudgetAlert[]): BudgetAlert[] {
  if (status.status && status.status !== "active") return [];
  if (status.isExceeded) return sent.includes("exceeded") ? [] : ["exceeded"];
  if (status.isNearLimit && !sent.includes("near_limit")) return ["near_limit"];
  return [];
}

/** The key under which a cycle's sent alerts are kept in the budget's metadata. */
export function cycleKey(status: Pick<BudgetStatus, "cycleStart">): string {
  return businessDateKey(status.cycleStart);
}

/**
 * Sends the alerts each active budget owes and records them, so each is sent once per
 * cycle. Returns how many were sent. Never throws.
 */
export async function checkBudgetAlerts(
  userId: number,
  userType: string,
  notify: (alert: BudgetAlert, status: BudgetStatus) => Promise<void>,
): Promise<number> {
  let sentCount = 0;
  for (const status of await listBudgetStatuses(userId, userType)) {
    const metadata = (status.metadata ?? {}) as { alerts?: Record<string, BudgetAlert[]> } & Record<string, unknown>;
    const key = cycleKey(status);
    const sent = metadata.alerts?.[key] ?? [];
    const due = dueBudgetAlerts(status, sent);
    if (due.length === 0) continue;
    for (const alert of due) await notify(alert, status);
    // Only the current cycle is kept: older ones can never be sent again.
    await db
      .update(userBudgets)
      .set({ metadata: { ...metadata, alerts: { [key]: [...sent, ...due] } } })
      .where(and(eq(userBudgets.id, status.id), eq(userBudgets.userId, userId), eq(userBudgets.userType, userType)));
    sentCount += due.length;
  }
  return sentCount;
}
