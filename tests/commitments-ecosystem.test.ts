import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../api/queries/connection";
import {
  cashflowSettlements, commitmentHints, commitmentOverrides, commitmentQuestions, commitmentReminders, commitmentScheduleItems,
  expenseDailyRollups, expenses, inAppNotifications, installmentPlans, localUsers, scheduledCashflows, subscriptionCatalog, userContacts,
} from "../db/schema";
import { commitmentsRouter } from "../api/commitments-router";
import { expenseRouter } from "../api/expense-router";
import { addDays } from "../api/services/coach/schedule";
import { businessDateKey } from "../api/lib/app-time";
import { deliverCommitmentReminders } from "../api/services/coach/reminders";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_951, userType: "local" };
const context = { user: { id: user.userId, type: "local", role: "user", plan: "free", name: "Commitments Test", email: null } } as never;
const commitments = commitmentsRouter.createCaller(context);
const ledger = expenseRouter.createCaller(context);
const today = businessDateKey();

async function clean() {
  if (process.env.RUN_DB_INTEGRATION !== "1") return;
  const scope = <T extends { userId: typeof expenses.userId; userType: typeof expenses.userType }>(table: T) =>
    and(eq(table.userId, user.userId), eq(table.userType, user.userType));
  for (const table of [cashflowSettlements, commitmentHints, commitmentOverrides, commitmentQuestions, commitmentReminders, commitmentScheduleItems,
    scheduledCashflows, installmentPlans, inAppNotifications, expenses, userContacts, expenseDailyRollups] as const) {
    await db.delete(table).where(scope(table as never));
  }
  await db.delete(localUsers).where(eq(localUsers.id, user.userId));
}

beforeEach(async () => {
  await clean();
  if (process.env.RUN_DB_INTEGRATION !== "1") return;
  await db.insert(localUsers).values({ id: user.userId, phone: "syn-commit", name: "Synthetic", password: "synthetic" });
  const [netflix] = await db.select().from(subscriptionCatalog).where(eq(subscriptionCatalog.slug, "netflix")).limit(1);
  if (!netflix) {
    await db.insert(subscriptionCatalog).values({
      slug: "netflix", name: "Netflix", nameAr: "نتفليكس", matchTokens: ["netflix.com", "netflix"], categoryId: "subscriptions",
      subCategoryId: "streaming", cycle: "monthly", origin: "seed",
    });
  }
});
afterAll(clean);

const spend = (description: string, amount: number, category: string, subCategory = "عام") =>
  ledger.create({ description, rawText: description, amount, category, subCategory, type: "expense", source: "voice" });

describe("the commitments ecosystem (docs/decisions/0051-commitments-ecosystem.md)", () => {
  itWithDatabase("links «دفعت قسط التلاجة» to the installment on its own and counts it, and an undo teaches", async () => {
    const { id } = await commitments.create({ shape: "fixed", kind: "installment", title: "قسط التلاجة", provider: "فاليو", amount: 1500, remainingCount: 3, paidBeforeCount: 9, startDay: addDays(today, 2) });
    const saved = await spend("دفعت قسط التلاجة", 1500, "أقساط وفوايد", "أقساط");
    expect(saved.commitmentLinks?.[0]).toMatchObject({ status: "linked", cashflowId: id, number: 10, total: 12, remainingAmount: 3000 });
    const overview = await commitments.overview();
    expect(overview.items.find((item) => item.id === id)?.progress).toMatchObject({ paidCount: 10, totalCount: 12, remainingAmount: 3000 });
    const settlementId = saved.commitmentLinks![0].settlementIds![0];
    await commitments.unlink({ settlementId });
    const [hint] = await db.select().from(commitmentHints).where(and(eq(commitmentHints.cashflowId, id), eq(commitmentHints.kind, "phrase")));
    expect(hint.weight).toBeLessThan(1);
  });

  itWithDatabase("knows «دفعت نتفلكس» as the Netflix subscription, spelled either way", async () => {
    const { id } = await commitments.create({ shape: "recurring", kind: "subscription", title: "نتفليكس", catalogSlug: "netflix", amount: 240, startDay: today });
    const saved = await spend("دفعت نتفلكس", 240, "اشتراكات", "منصات مشاهدة");
    expect(saved.commitmentLinks?.[0]).toMatchObject({ status: "linked", cashflowId: id });
    const month = await commitments.month({ month: today.slice(0, 7) });
    expect(month.find((item) => item.cashflowId === id)).toMatchObject({ catalogSlug: "netflix", status: "paid" });
    expect(await commitments.forSentence({ text: "دفعت netflix" })).toBeNull(); // paid already: nothing open to offer
  });

  itWithDatabase("never takes «دهان الشقة» for the flat's installment, and asks nothing", async () => {
    await commitments.create({ shape: "fixed", kind: "property", title: "قسط الشقة", amount: 30000, remainingCount: 20, startDay: addDays(today, 3), intervalCount: 3 });
    const saved = await spend("دهان الشقة", 3000, "سكن", "صيانة");
    expect(saved.commitmentLinks?.[0]?.status).toBe("none");
    expect((await commitments.questions()).links).toEqual([]);
  });

  itWithDatabase("files «دفعت 5000 مصاريف مدرسة محمد ابني» under education, and asks which child when it is unclear", async () => {
    const mohamed = await commitments.create({
      shape: "schedule", kind: "school", title: "مدرسة محمد", beneficiaryName: "محمد", beneficiaryRelation: "ابن",
      items: [{ dueDay: addDays(today, -1), amount: 5000, label: "القسط الأول" }, { dueDay: addDays(today, 90), amount: 4000, label: "القسط التاني" }],
    });
    await commitments.create({
      shape: "schedule", kind: "school", title: "مدرسة ملك", beneficiaryName: "ملك", beneficiaryRelation: "بنت",
      items: [{ dueDay: addDays(today, -1), amount: 4000 }],
    });
    const saved = await spend("دفعت 5000 مصاريف مدرسة محمد ابني", 5000, "تعليم", "مدرسة");
    expect(saved.commitmentLinks?.[0]).toMatchObject({ status: "linked", cashflowId: mohamed.id, number: 1, total: 2 });
    const asked = await spend("دفعت قسط المدرسة", 4000, "تعليم", "مدرسة");
    expect(asked.commitmentLinks?.[0]?.status).toBe("ask");
    const { links } = await commitments.questions();
    expect(links).toHaveLength(1);
    const malak = links[0].candidates.find((candidate) => candidate.title === "مدرسة ملك")!;
    await commitments.answer({ key: links[0].key, answer: `${malak.cashflowId}:${malak.dueDay}` });
    expect((await commitments.questions()).links).toEqual([]);
  });

  itWithDatabase("keeps a debt with Farida: her repayment links by the person, what is left shows", async () => {
    const { id } = await commitments.create({ shape: "balance", kind: "debt", direction: "in", contactName: "فريدة", contactRelation: "أخت", totalAmount: 1000, repayment: "flexible" });
    const [debt] = await db.select().from(scheduledCashflows).where(eq(scheduledCashflows.id, id));
    const back = await ledger.create({
      description: "فريدة رجعتلي", rawText: "فريدة رجعتلي 500", amount: 500, category: "تحويل", subCategory: "دين/سلفة",
      type: "transfer", direction: "incoming", movementKind: "loan", contactId: debt.contactId!, source: "voice",
    });
    expect(back.commitmentLinks?.[0]).toMatchObject({ status: "linked", cashflowId: id, remainingAmount: 500 });
  });

  itWithDatabase("adds a debt already partly repaid: what was repaid counts, what is left shows", async () => {
    const { id } = await commitments.create({ shape: "balance", kind: "debt", direction: "out", contactName: "خالد", contactRelation: "صاحبي", totalAmount: 3000, paidSoFar: 1000, repayment: "flexible" });
    const { items } = await commitments.overview();
    expect(items.find((item) => item.id === id)?.progress.remainingAmount).toBe(2000);
    await expect(commitments.create({ shape: "balance", kind: "debt", contactName: "خالد", totalAmount: 500, paidSoFar: 500, repayment: "flexible" })).rejects.toThrow();
  });

  itWithDatabase("asks «اتدفع؟» for a due date without a payment; «لسه» keeps it unpaid and stops asking; «دفعته» records it", async () => {
    const rent = await commitments.create({ shape: "recurring", kind: "rent", title: "إيجار الشقة", amount: 4000, startDay: today });
    const gym = await commitments.create({ shape: "recurring", kind: "subscription", title: "الجيم", amount: 500, startDay: today });
    const { dueChecks } = await commitments.questions();
    expect(dueChecks.map((item) => item.cashflowId).sort()).toEqual([rent.id, gym.id].sort());
    await commitments.answer({ key: `due:${rent.id}:${today}`, answer: "not_yet" });
    const paid = await commitments.answer({ key: `due:${gym.id}:${today}`, answer: "paid" });
    expect(paid).toMatchObject({ status: "recorded" });
    const [row] = await db.select().from(expenses).where(eq(expenses.id, paid.expenseId!));
    expect([row.category, row.subCategory, Math.abs(Number(row.amount))]).toEqual(["اشتراكات", "عام", 500]);
    expect((await commitments.questions()).dueChecks).toEqual([]);
    const overview = await commitments.overview();
    expect(overview.due.find((item) => item.cashflowId === rent.id)?.status).toBe("due");
  });

  itWithDatabase("sets up a gam3eya with its payout on the user's turn", async () => {
    const { id, payoutId } = await commitments.create({ shape: "gam3eya", kind: "gam3eya", title: "جمعية الشغل", amount: 1000, occurrenceCount: 10, gam3eyaTurn: 6, startDay: "2026-01-05" });
    const [payout] = await db.select().from(scheduledCashflows).where(eq(scheduledCashflows.id, payoutId!));
    expect([payout.parentId, payout.direction, payout.startDay, Number(payout.amount)]).toEqual([id, "in", "2026-06-05", 10000]);
  });

  itWithDatabase("reminds once per stage, however many times the job runs", async () => {
    await commitments.create({ shape: "recurring", kind: "bill", title: "النت", amount: 450, startDay: addDays(today, 3), remindHour: 0 });
    const first = await deliverCommitmentReminders();
    const second = await deliverCommitmentReminders();
    const bell = await db.select().from(inAppNotifications).where(and(eq(inAppNotifications.userId, user.userId), eq(inAppNotifications.userType, user.userType)));
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(second.sent).toBe(0);
    expect(bell.map((item) => item.title)).toEqual(["النت قرّب"]);
  });

  itWithDatabase("moves an old installment plan into a commitment once, keeping its word", async () => {
    const [plan] = await db.insert(installmentPlans).values({ userId: user.userId, userType: user.userType, title: "قسط الموبايل", keyword: "فاليو", monthlyAmount: "800.00", totalInstallments: 12, paidBefore: 4 });
    await commitments.overview();
    await commitments.overview();
    const moved = await db.select().from(scheduledCashflows).where(and(eq(scheduledCashflows.userId, user.userId), eq(scheduledCashflows.installmentPlanId, Number(plan.insertId))));
    expect(moved).toHaveLength(1);
    expect([moved[0].shape, moved[0].occurrenceCount, moved[0].paidBeforeCount]).toEqual(["fixed", 12, 4]);
  });
});
