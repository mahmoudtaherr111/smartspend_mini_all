import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../api/queries/connection";
import {
  cashflowSettlements, coachingPlans, coachingSteps, expenses, inAppNotifications, installmentPlans, scheduledCashflows, userContacts,
} from "../db/schema";
import { createCashflow, resolveCashflowContact, settle, updateCashflow, upcoming } from "../api/services/coach/cashflows";
import { acceptPlan, activePlan, cancelReminder, deliverDueReminders, setReminder } from "../api/services/coach/plans";
import { expenseRouter } from "../api/expense-router";
import { coachRouter } from "../api/coach-router";
import { profileRouter } from "../api/profile-router";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_931, userType: "local" };
/** The same numeric id as a Google account: another person. */
const other = { userId: 88_931, userType: "oauth" };
const context = {
  user: { id: user.userId, type: "local", role: "user", plan: "pro", name: "Coach Test", email: null },
} as never;
const caller = expenseRouter.createCaller(context);
const coach = coachRouter.createCaller(context);
const profile = profileRouter.createCaller(context);

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
    await db.delete(userContacts).where(scope(userContacts));
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

describe("dated debt links stay consistent with the ledger", () => {
  beforeEach(clean);
  afterAll(clean);
  const dueDay = "2026-11-15";
  async function person(name: string, who = user) {
    const [row] = await db.insert(userContacts).values({ ...who, name });
    return Number(row.insertId);
  }
  async function debt(contactId: number, direction: "in" | "out" = "out", amount = 800) {
    const row = await createCashflow(user, { kind: "debt", direction, title: "رد السلفة", contactId, amount, recurrence: "once", startDay: dueDay, certainty: "confirmed", source: "voice" });
    await db.update(scheduledCashflows).set({ createdAt: new Date("2026-09-01T10:00:00Z") }).where(eq(scheduledCashflows.id, row.id));
    return row.id;
  }
  async function loan(contactId: number, direction: "incoming" | "outgoing", amount = 800, patch: Partial<typeof expenses.$inferInsert> = {}) {
    const [row] = await db.insert(expenses).values({ ...user, type: "transfer", amount: amount.toFixed(2), category: "تحويل", subCategory: "دين/سلفة", contactId, parsedMetadata: { direction }, description: "رد السلفة", date: new Date(`${dueDay}T10:00:00Z`), ...patch });
    return Number(row.insertId);
  }

  itWithDatabase("resolves a whole owned name only and refuses duplicates, cross-account ids and mismatched id/name", async () => {
    const ahmed = await person("أحمد");
    await person("احمد علي"); await person("أحمد", other);
    expect(await resolveCashflowContact(user, { name: "احمد" })).toMatchObject({ contact: { id: ahmed, name: "أحمد" } });
    expect(await resolveCashflowContact(user, { name: "خالد" })).toEqual({ contact: null });
    expect(await resolveCashflowContact(other, { id: ahmed })).toHaveProperty("error");
    expect(await resolveCashflowContact(user, { id: ahmed, name: "خالد" })).toHaveProperty("error");
    await person("احمد");
    const ambiguous = await resolveCashflowContact(user, { name: "أحمد" });
    expect(ambiguous).toHaveProperty("error");
    expect(ambiguous.choices).toHaveLength(2);
    expect(await resolveCashflowContact(user, { id: ahmed, name: "احمد" })).toHaveProperty("contact.id", ahmed);
  });

  itWithDatabase("accepts repayments in either direction, refuses another person's, pending, business, missing-direction and unrelated transfers", async () => {
    const khaled = await person("خالد"); const ali = await person("علي");
    const out = await debt(khaled); const incoming = await debt(khaled, "in");
    for (const expenseId of [
      await loan(ali, "outgoing"), await loan(khaled, "incoming"),
      await loan(khaled, "outgoing", 800, { status: "pending" }),
      await loan(khaled, "outgoing", 800, { businessId: 88931 }),
      await loan(khaled, "outgoing", 800, { parsedMetadata: null }),
      await loan(khaled, "outgoing", 800, { subCategory: "جمعية" }),
      await loan(khaled, "outgoing", 800, { type: "expense", category: "سكن" }),
    ]) await expect(settle(user, { cashflowId: out, dueDay, expenseId })).rejects.toThrow("مناسبة للالتزام وصاحبه");
    const paidOut = await loan(khaled, "outgoing", 300);
    await settle(user, { cashflowId: out, dueDay, expenseId: paidOut });
    await settle(user, { cashflowId: incoming, dueDay, expenseId: await loan(khaled, "incoming") });
    const dues = await upcoming(user, dueDay, dueDay);
    expect(dues.find((o) => o.cashflowId === out)).toMatchObject({ contactId: khaled, contactName: "خالد", remaining: 500, status: "partial" });
    expect(dues.find((o) => o.cashflowId === incoming)).toMatchObject({ status: "paid" });
  });

  itWithDatabase("suggests only eligible unallocated money and finds the second schedule on the same date", async () => {
    const khaled = await person("خالد"); const ali = await person("علي");
    const first = await debt(ali); const second = await debt(khaled);
    const alreadyUsed = await loan(khaled, "outgoing"); const partial = await loan(khaled, "outgoing", 300);
    const wrongPerson = await loan(ali, "outgoing"); const wrongWay = await loan(khaled, "incoming");
    const another = await debt(khaled);
    await settle(user, { cashflowId: another, dueDay, expenseId: alreadyUsed });
    const suggestions = await coach.paymentSuggestions({ cashflowId: second, dueDay });
    expect(suggestions.map((row) => row.id)).toEqual([partial]);
    expect(suggestions[0]).toMatchObject({ available: 300 });
    expect(suggestions.map((row) => row.id)).not.toContain(wrongPerson);
    expect(suggestions.map((row) => row.id)).not.toContain(wrongWay);
    expect(first).not.toBe(second);
  });

  itWithDatabase("cannot allocate one repayment twice when two due dates are confirmed concurrently", async () => {
    const khaled = await person("خالد");
    const cashflowIds = [await debt(khaled), await debt(khaled)];
    const expenseId = await loan(khaled, "outgoing");
    const results = await Promise.allSettled(cashflowIds.map((cashflowId) => settle(user, { cashflowId, dueDay, expenseId })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const allocations = await db.select().from(cashflowSettlements).where(and(eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), eq(cashflowSettlements.expenseId, expenseId)));
    expect(allocations).toHaveLength(1);
    expect(Number(allocations[0].amount)).toBe(800);
  });

  itWithDatabase("releases links after contact, type or category edits even when the amount is unchanged", async () => {
    const khaled = await person("خالد"); const ali = await person("علي");
    const cashflowId = await debt(khaled);
    for (const patch of [{ contactId: ali }, { type: "income" as const }, { category: "تحويل", subCategory: "جمعية" }, { type: "expense" as const, refund: true }]) {
      const expenseId = await loan(khaled, "outgoing");
      await settle(user, { cashflowId, dueDay, expenseId });
      await caller.update({ id: expenseId, ...patch });
      expect((await upcoming(user, dueDay, dueDay))[0]).toMatchObject({ paid: 0, remaining: 800 });
    }
    const expenseId = await loan(khaled, "outgoing");
    await settle(user, { cashflowId, dueDay, expenseId });
    // An innocuous description edit must not release a valid link.
    await caller.update({ id: expenseId, description: "رد لخالد" });
    expect((await upcoming(user, dueDay, dueDay))[0].status).toBe("paid");
    await caller.delete({ id: expenseId });
    expect((await upcoming(user, dueDay, dueDay))[0].paid).toBe(0);
  });

  itWithDatabase("refuses incompatible schedule edits and never turns an off-record settlement into a loan", async () => {
    const khaled = await person("خالد"); const ali = await person("علي");
    await loan(khaled, "incoming"); // The user owes 800.
    const cashflowId = await debt(khaled);
    const before = await caller.getDebtBalances();
    await settle(user, { cashflowId, dueDay });
    expect(await caller.getDebtBalances()).toEqual(before);
    await expect(updateCashflow(user, cashflowId, { startDay: "2026-11-16" })).rejects.toThrow("فكّ ربطه");
    await expect(updateCashflow(user, cashflowId, { amount: 700 })).rejects.toThrow("أقل من السداد");
    const linkedId = await debt(khaled);
    const expenseId = await loan(khaled, "outgoing");
    const linked = await settle(user, { cashflowId: linkedId, dueDay, expenseId });
    await expect(updateCashflow(user, linkedId, { contactId: ali })).rejects.toThrow("مش متوافق");
    await expect(updateCashflow(user, linkedId, { direction: "in" })).rejects.toThrow("مش متوافق");
    const balanceBeforeUnlink = await caller.getDebtBalances();
    await coach.unsettle({ settlementId: linked.id });
    expect((await upcoming(user, dueDay, dueDay)).find((row) => row.cashflowId === linkedId)?.paid).toBe(0);
    expect(await caller.getById({ id: expenseId })).not.toBeNull();
    expect(await caller.getDebtBalances()).toEqual(balanceBeforeUnlink);
  });

  itWithDatabase("moves schedule links on a contact merge and clears them on deletion, with account types isolated", async () => {
    const primaryId = await person("خالد"); const secondaryId = await person("خالد القديم");
    const foreignId = await person("خالد", other);
    const mine = await debt(secondaryId);
    const foreign = await createCashflow(other, { kind: "debt", direction: "out", title: "خالد", contactId: foreignId, amount: 800, recurrence: "once", startDay: dueDay, certainty: "confirmed", source: "user" });
    await profile.mergeContacts({ primaryId, secondaryId });
    expect((await upcoming(user, dueDay, dueDay)).find((row) => row.cashflowId === mine)).toMatchObject({ contactId: primaryId, contactName: "خالد" });
    await profile.deleteContact({ id: primaryId });
    expect((await upcoming(user, dueDay, dueDay)).find((row) => row.cashflowId === mine)).toMatchObject({ contactId: null, contactName: null });
    expect((await db.select().from(scheduledCashflows).where(eq(scheduledCashflows.id, foreign.id)))[0].contactId).toBe(foreignId);
  });

  itWithDatabase("keeps business loans and gam3eya payments out of the personal debt standing", async () => {
    const khaled = await person("خالد");
    await loan(khaled, "incoming");
    await loan(khaled, "incoming", 3000, { businessId: 88931 });
    await loan(khaled, "outgoing", 2000, { businessId: 88931, subCategory: "جمعية" });
    const standing = await caller.getDebtBalances();
    expect(standing.youOwe).toBe(800);
    expect(standing.gam3eya).toMatchObject({ paid: 0, installments: 0 });
  });

  itWithDatabase("refuses impossible dates at the service and router boundaries", async () => {
    const input = { kind: "debt" as const, direction: "out" as const, title: "خالد", amount: 800, recurrence: "once" as const, startDay: "2026-02-30", certainty: "confirmed" as const };
    await expect(createCashflow(user, { ...input, source: "voice" })).rejects.toThrow("مش صحيح");
    await expect(coach.addCashflow(input)).rejects.toThrow("اختار يوم موجود");
  });
});
