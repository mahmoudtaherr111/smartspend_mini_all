import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../api/queries/connection";
import {
  cashflowSettlements, coachingPlans, coachingSteps, expenses, inAppNotifications, installmentPlans, scheduledCashflows,
} from "../db/schema";
import { createCashflow, settle, upcoming } from "../api/services/coach/cashflows";
import { acceptPlan, activePlan, cancelReminder, deliverDueReminders, setReminder } from "../api/services/coach/plans";
import { expenseRouter } from "../api/expense-router";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_931, userType: "local" };
/** The same numeric id as a Google account: another person. */
const other = { userId: 88_931, userType: "oauth" };
const caller = expenseRouter.createCaller({
  user: { id: user.userId, type: "local", role: "user", plan: "pro", name: "Coach Test", email: null },
} as never);

async function clean() {
  if (process.env.RUN_DB_INTEGRATION !== "1") return;
  for (const who of [user, other]) {
    const scope = <T extends { userId: typeof expenses.userId; userType: typeof expenses.userType }>(table: T) =>
      and(eq(table.userId, who.userId), eq(table.userType, who.userType));
    await db.delete(cashflowSettlements).where(scope(cashflowSettlements));
    await db.delete(scheduledCashflows).where(scope(scheduledCashflows));
    await db.delete(coachingSteps).where(scope(coachingSteps));
    await db.delete(coachingPlans).where(scope(coachingPlans));
    await db.delete(inAppNotifications).where(scope(inAppNotifications));
    await db.delete(installmentPlans).where(scope(installmentPlans));
    await db.delete(expenses).where(scope(expenses));
  }
}

async function spend(who: typeof user, amount: number, day: string, type = "expense"): Promise<number> {
  const [row] = await db.insert(expenses).values({
    userId: who.userId, userType: who.userType, type, amount: amount.toFixed(2), category: "سكن", subCategory: "إيجار",
    description: "test", rawText: "test", source: "manual", date: new Date(`${day}T10:00:00Z`),
  });
  return Number(row.insertId);
}

describe("scheduled cashflows and their payments", () => {
  itWithDatabase("installment progress counts paid due dates separately, excludes business payments and reports overlapping names as ambiguous", async () => {
    const [plan] = await db.insert(installmentPlans).values({ ...user, title: "موبايل", keyword: "فاليو", monthlyAmount: "800.00", totalInstallments: 12, paidBefore: 3, createdAt: new Date("2026-09-01T00:00:00Z") });
    const planId = Number(plan.insertId);
    await db.insert(expenses).values([
      { ...user, amount: "400.00", type: "expense", category: "أقساط وفوايد", description: "فاليو", date: new Date("2026-09-10T10:00:00Z") },
      { ...user, businessId: 88931, amount: "1600.00", type: "expense", category: "أقساط وفوايد", description: "فاليو", date: new Date("2026-09-10T10:00:00Z") },
    ]);
    expect((await caller.listInstallmentPlans())[0]).toMatchObject({ paid: 3, remainingAmount: 6800, countedBy: "keyword" });
    await db.insert(installmentPlans).values({ ...user, title: "جهاز تاني", keyword: "قسط فاليو", monthlyAmount: "400.00", totalInstallments: 6 });
    expect((await caller.listInstallmentPlans()).every((row) => row.countedBy === "ambiguous")).toBe(true);
    const [schedule] = await db.insert(scheduledCashflows).values({ ...user, kind: "installment", direction: "out", title: "موبايل", amount: "800.00", recurrence: "monthly", startDay: "2026-09-05", installmentPlanId: planId });
    await db.insert(cashflowSettlements).values([
      { ...user, cashflowId: Number(schedule.insertId), dueDay: "2026-09-05", amount: "400.00", source: "declared" },
      { ...user, cashflowId: Number(schedule.insertId), dueDay: "2026-10-05", amount: "400.00", source: "declared" },
    ]);
    expect((await caller.listInstallmentPlans()).find((row) => row.id === planId)).toMatchObject({ paid: 3, remaining: 9, remainingAmount: 6400, countedBy: "linked" });
  });
  beforeEach(clean);
  afterAll(clean);

  itWithDatabase("links payments to a due date, part by part, never beyond what is owed or what a payment holds", async () => {
    const { id } = await createCashflow(user, {
      kind: "installment", direction: "out", title: "قسط الموبايل", amount: 800, recurrence: "monthly",
      startDay: "2026-09-05", certainty: "confirmed", source: "user",
    });
    const first = await spend(user, 300, "2026-09-05");
    const second = await spend(user, 900, "2026-09-06");
    await settle(user, { cashflowId: id, dueDay: "2026-09-05", expenseId: first });
    let [due] = await upcoming(user, "2026-09-01", "2026-09-30", "2026-09-10");
    expect(due).toMatchObject({ status: "partial", paid: 300, remaining: 500 });

    // The second payment is larger than what is left: only 500 of it goes here.
    expect(await settle(user, { cashflowId: id, dueDay: "2026-09-05", expenseId: second })).toMatchObject({ amount: 500 });
    [due] = await upcoming(user, "2026-09-01", "2026-09-30", "2026-09-10");
    expect(due).toMatchObject({ status: "paid", remaining: 0 });
    await expect(settle(user, { cashflowId: id, dueDay: "2026-09-05", amount: 100 })).rejects.toThrow("متسدد بالفعل");
    // Its remaining 400 may pay next month, but not more.
    await expect(settle(user, { cashflowId: id, dueDay: "2026-10-05", expenseId: second, amount: 500 })).rejects.toThrow("أكبر من اللي فاضل");
    expect(await settle(user, { cashflowId: id, dueDay: "2026-10-05", expenseId: second })).toMatchObject({ amount: 400 });
    // A day that is not one of its due dates is refused.
    await expect(settle(user, { cashflowId: id, dueDay: "2026-10-06", amount: 100 })).rejects.toThrow("مش من مواعيد");
  });

  itWithDatabase("frees a due date when the payment is deleted or shrunk below what it paid", async () => {
    const { id } = await createCashflow(user, {
      kind: "rent", direction: "out", title: "إيجار", amount: 4000, recurrence: "monthly", startDay: "2026-09-01", certainty: "confirmed", source: "user",
    });
    // This scenario starts tracking on 10 September. The database's real clock
    // changes which previous monthly due date is visible after 1 October.
    await db.update(scheduledCashflows).set({ createdAt: new Date("2026-09-10T10:00:00Z") }).where(and(
      eq(scheduledCashflows.id, id), eq(scheduledCashflows.userId, user.userId), eq(scheduledCashflows.userType, user.userType),
    ));
    const rent = await spend(user, 4000, "2026-09-01");
    await settle(user, { cashflowId: id, dueDay: "2026-09-01", expenseId: rent });
    await caller.update({ id: rent, amount: 3500 });
    // The schedule was added after 1 September: without the payment, whether it was paid is unknown again.
    let [due] = await upcoming(user, "2026-09-01", "2026-09-01", "2026-09-10");
    expect(due.status).toBe("unconfirmed");

    await settle(user, { cashflowId: id, dueDay: "2026-09-01", expenseId: rent, amount: 3500 });
    await caller.delete({ id: rent });
    [due] = await upcoming(user, "2026-09-01", "2026-09-01", "2026-09-10");
    expect(due).toMatchObject({ status: "unconfirmed", paid: 0 });
  });

  itWithDatabase("refuses another person's schedule or payment, the same numeric id of another account type included", async () => {
    const mine = await createCashflow(user, {
      kind: "rent", direction: "out", title: "إيجار", amount: 4000, recurrence: "monthly", startDay: "2026-09-01", certainty: "confirmed", source: "user",
    });
    const theirs = await spend(other, 4000, "2026-09-01");
    await expect(settle(user, { cashflowId: mine.id, dueDay: "2026-09-01", expenseId: theirs })).rejects.toThrow("مش موجودة");
    await expect(settle(other, { cashflowId: mine.id, dueDay: "2026-09-01", amount: 4000 })).rejects.toThrow("مش موجود");
    // A refund is not a payment.
    const refund = await spend(user, -300, "2026-09-02");
    await expect(settle(user, { cashflowId: mine.id, dueDay: "2026-09-01", expenseId: refund })).rejects.toThrow("مش فلوس خارجة");
  });

  itWithDatabase("gives an installment plan one schedule only", async () => {
    const [plan] = await db.insert(installmentPlans).values({
      userId: user.userId, userType: user.userType, title: "موبايل", keyword: "فاليو", monthlyAmount: "800.00", totalInstallments: 12,
    });
    const input = {
      kind: "installment" as const, direction: "out" as const, title: "قسط", amount: 800, recurrence: "monthly" as const,
      startDay: "2026-09-05", certainty: "confirmed" as const, source: "user" as const, installmentPlanId: Number(plan.insertId),
    };
    await createCashflow(user, input);
    await expect(createCashflow(user, input)).rejects.toThrow("متسجل بالفعل");
  });
});

describe("coaching plans and reminders", () => {
  beforeEach(clean);
  afterAll(clean);

  const plan = (title: string) => ({
    title, goal: "أوصل للمرتب من غير سلف", source: "voice" as const,
    steps: [{ title: "الأكل برّه ميتين في اليوم", kind: "spending_limit" as const, target: { amountPerDay: 200, category: "أكل وشرب" } }],
  });

  itWithDatabase("keeps one active plan: a newer accepted one replaces it and stops its reminders", async () => {
    const first = await acceptPlan(user, plan("الخطة الأولى"));
    const step = (await activePlan(user))!.steps[0];
    await setReminder(user, step.id, new Date(Date.now() + 3_600_000));
    const second = await acceptPlan(user, plan("الخطة التانية"));
    expect(second.replaced).toBe(first.id);
    expect((await activePlan(user))!.title).toBe("الخطة التانية");
    const [old] = await db.select().from(coachingSteps).where(eq(coachingSteps.id, step.id));
    expect(old.reminderStatus).toBe("cancelled");
  });

  itWithDatabase("delivers a reminder once, whatever runs it twice, and never an old or cancelled one", async () => {
    await acceptPlan(user, plan("خطة"));
    const step = (await activePlan(user))!.steps[0];
    await setReminder(user, step.id, new Date(Date.now() + 1_000));
    const later = new Date(Date.now() + 60_000);
    // Two servers at once: one notification.
    await Promise.all([deliverDueReminders(later), deliverDueReminders(later)]);
    const notes = () => db.select().from(inAppNotifications).where(and(eq(inAppNotifications.userId, user.userId), eq(inAppNotifications.userType, user.userType)));
    expect(await notes()).toHaveLength(1);
    expect((await notes())[0].body).not.toMatch(/\d/);
    await deliverDueReminders(later);
    expect(await notes()).toHaveLength(1);

    // Moved: a new revision fires once more. Cancelled: nothing.
    await setReminder(user, step.id, new Date(Date.now() + 2_000));
    await deliverDueReminders(later);
    expect(await notes()).toHaveLength(2);
    await setReminder(user, step.id, new Date(Date.now() + 3_000));
    await cancelReminder(user, step.id);
    await deliverDueReminders(later);
    expect(await notes()).toHaveLength(2);
    const ids = (await notes()).map((note) => note.id);
    await db.delete(inAppNotifications).where(inArray(inAppNotifications.id, ids));
  });
});

describe("installment progress from linked payments", () => {
  beforeEach(clean);
  afterAll(clean);

  itWithDatabase("counts a partial payment by its amount, and keeps two plans with the same word apart", async () => {
    const plan = async (title: string) => {
      const [row] = await db.insert(installmentPlans).values({
        userId: user.userId, userType: user.userType, title, keyword: "فاليو", monthlyAmount: "800.00", totalInstallments: 12, paidBefore: 3,
      });
      return Number(row.insertId);
    };
    const phone = await plan("الموبايل");
    const fridge = await plan("التلاجة");
    const { id } = await createCashflow(user, {
      kind: "installment", direction: "out", title: "قسط الموبايل", amount: 800, recurrence: "monthly",
      startDay: "2026-09-05", certainty: "confirmed", source: "user", installmentPlanId: phone,
    });
    // One payment whose words name both plans: by keyword it counts for each.
    const partial = await spend(user, 500, "2026-09-05");
    await db.update(expenses).set({ category: "أقساط وفوايد", description: "قسط فاليو" }).where(eq(expenses.id, partial));
    await settle(user, { cashflowId: id, dueDay: "2026-09-05", expenseId: partial });

    const plans = await caller.listInstallmentPlans();
    const byId = new Map(plans.map((p) => [p.id, p]));
    // Linked: 500 of 800 paid, so no whole installment more, and exactly 9 × 800 − 500 left.
    expect(byId.get(phone)).toMatchObject({ paid: 3, remaining: 9, remainingAmount: 6_700, countedBy: "linked" });
    // Payments naming the same word cannot safely be attributed to the other plan.
    expect(byId.get(fridge)).toMatchObject({ countedBy: "ambiguous" });
  });
});
