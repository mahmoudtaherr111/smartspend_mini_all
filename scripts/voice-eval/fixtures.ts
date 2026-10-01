/**
 * Synthetic users for the coach evaluation. Every row belongs to a fresh local user whose phone and name mark it as
 * fabricated; nothing here touches a real account, and the runner refuses a database whose name does not end in
 * `_eval`. Dates are relative to the Cairo day the run starts, with the salary day set so the cycle is half done.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import {
  cashflowSettlements,
  coachingPlans,
  coachingSteps,
  expenses,
  financialGoals,
  installmentPlans,
  localUsers,
  scheduledCashflows,
  userBudgets,
  userBusinesses,
  userContacts,
  userProfiles,
  userWallets,
} from "../../db/schema";
import { businessDateKey } from "../../api/lib/app-time";
import { db } from "../../api/queries/connection";

export const EVAL_MARKER = "VOICE_EVAL";

export interface EvalUser {
  id: number;
  userType: "local";
  /** The Cairo day keys the fixture was built around, for checks that name dates. */
  days: { today: string; cycleStart: string; salaryDay: number };
}

const DAY_MS = 86_400_000;

function cairoDay(offsetDays: number, from: Date): string {
  return businessDateKey(new Date(from.getTime() + offsetDays * DAY_MS));
}

/** Noon Cairo time of a day key, as a Date (Cairo is UTC+2 or +3; noon UTC+0 is inside the day either way). */
function at(dayKey: string, hour = 12): Date {
  return new Date(`${dayKey}T${String(hour - 2).padStart(2, "0")}:00:00Z`);
}

type Row = typeof expenses.$inferInsert;

export type FixtureName = "base" | "empty" | "tight";

/**
 * base: a salaried user half way through the cycle — salary, rent paid, food (much of it delivery), transport, bills,
 * a refund, a lent and a borrowed loan, three gam3eya payments, an installment plan, two wallets, a phone goal, a
 * food budget, and a carpentry workshop with 2,750 of its own spending this cycle; last cycle for comparisons.
 * tight: the same user with spending above income this cycle and a small cash balance.
 * empty: a new user with nothing recorded.
 */
export async function createEvalUser(name: FixtureName, now = new Date()): Promise<EvalUser> {
  const today = businessDateKey(now);
  const cycleStart = cairoDay(-15, now);
  const salaryDay = Number(cycleStart.slice(8, 10));
  const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1_000).toString().padStart(3, "0")}`;
  const [inserted] = await db.insert(localUsers).values({
    name: `منى (${EVAL_MARKER})`,
    phone: `0100${suffix}`.slice(0, 11),
    password: "not-a-real-password-hash",
    role: "user",
    plan: "ultra",
  });
  const id = Number(inserted.insertId);
  const user = { userId: id, userType: "local" as const };

  await db.insert(userProfiles).values({
    ...user,
    monthlyIncome: name === "empty" ? null : "14000.00",
    basicInfo: { name: "منى", profession: null },
    financialInfo: name === "empty" ? {} : { salaryDay, averageMonthlyIncome: 14_000 },
    onboardingAnswers: {},
    // Profile questions are not the point of the evaluation: asked recently, none is offered.
    lastAskedAt: now,
  });

  if (name === "empty") return { id, userType: "local", days: { today, cycleStart, salaryDay } };

  const [ahmed] = await db.insert(userContacts).values({ ...user, name: "أحمد", relation: "صديق" });
  const [khaled] = await db.insert(userContacts).values({ ...user, name: "خالد", relation: "زميل" });
  const ahmedId = Number(ahmed.insertId);
  const khaledId = Number(khaled.insertId);

  const day = (offset: number) => cairoDay(offset, new Date(`${cycleStart}T10:00:00Z`));
  const lastCycle = (offset: number) => cairoDay(offset - 30, new Date(`${cycleStart}T10:00:00Z`));
  const row = (dayKey: string, type: string, amount: number, category: string, subCategory: string, description: string, extra: Partial<Row> = {}): Row => ({
    ...user,
    type,
    amount: amount.toFixed(2),
    category,
    subCategory,
    description,
    rawText: `${EVAL_MARKER} ${description}`,
    source: "manual",
    date: at(dayKey),
    ...extra,
  });

  const tight = name === "tight";
  const rows: Row[] = [
    row(day(0), "income", 14_000, "مرتب", "مرتب أساسي", "مرتب الشهر"),
    row(day(1), "expense", tight ? 6_500 : 4_000, "سكن", "إيجار", "إيجار الشقة"),
    row(day(1), "expense", 350, "فواتير", "إنترنت", "باقة النت"),
    row(day(2), "expense", 850, "أكل وشرب", "بقالة", "سوبر ماركت", { placeHint: "كارفور" }),
    row(day(3), "expense", 240, "أكل وشرب", "وجبات سريعة", "طلبات", { placeHint: "طلبات" }),
    row(day(4), "expense", 85, "مواصلات", "أوبر/كريم", "أوبر للشغل", { placeHint: "أوبر" }),
    row(day(5), "expense", 180, "أكل وشرب", "وجبات سريعة", "طلبات", { placeHint: "طلبات" }),
    row(day(6), "expense", 60, "أكل وشرب", "وجبات سريعة", "كشري"),
    row(day(7), "expense", 600, "تسوق", "ملابس", "قميص"),
    row(day(8), "expense", 300, "تسوق", "ملابس", "رجعت القميص", { amount: "-300.00", parsedMetadata: { direction: "incoming" } }),
    row(day(8), "expense", 120, "مواصلات", "أوبر/كريم", "أوبر", { placeHint: "أوبر" }),
    row(day(9), "expense", 220, "أكل وشرب", "وجبات سريعة", "طلبات", { placeHint: "طلبات" }),
    row(day(10), "expense", 800, "أقساط وفوايد", "أقساط", "قسط فاليو الموبايل"),
    row(day(10), "expense", 90, "أكل وشرب", "قهوة وكافيه", "قهوة"),
    row(day(11), "expense", 200, "اشتراكات", "منصات مشاهدة", "نتفليكس"),
    row(day(12), "transfer", 1_000, "تحويل", "جمعية", "قسط الجمعية", { parsedMetadata: { direction: "outgoing" } }),
    row(day(13), "expense", 30, "مواصلات", "مترو", "مترو"),
    row(day(14), "expense", 30, "مواصلات", "مترو", "مترو"),
    ...(tight ? [row(day(12), "expense", 5_200, "صحة", "مستشفى", "عملية")] : []),
    // Loans: lent Ahmed 1,500 before; borrowed 800 from Khaled.
    row(lastCycle(20), "transfer", 1_500, "تحويل", "دين/سلفة", "سلفت أحمد", { contactId: ahmedId, parsedMetadata: { direction: "outgoing" } }),
    row(day(5), "transfer", 800, "تحويل", "دين/سلفة", "اتسلفت من خالد", { contactId: khaledId, parsedMetadata: { direction: "incoming" } }),
    // Last cycle, for comparisons: two gam3eya payments, less delivery, more transport.
    row(lastCycle(0), "income", 14_000, "مرتب", "مرتب أساسي", "مرتب الشهر اللي فات"),
    row(lastCycle(1), "expense", 4_000, "سكن", "إيجار", "إيجار الشقة"),
    row(lastCycle(2), "expense", 700, "أكل وشرب", "بقالة", "سوبر ماركت"),
    row(lastCycle(4), "expense", 200, "أكل وشرب", "وجبات سريعة", "طلبات", { placeHint: "طلبات" }),
    row(lastCycle(6), "expense", 300, "مواصلات", "تاكسي", "تاكسي"),
    row(lastCycle(9), "expense", 150, "مواصلات", "أوبر/كريم", "أوبر", { placeHint: "أوبر" }),
    row(lastCycle(10), "expense", 800, "أقساط وفوايد", "أقساط", "قسط فاليو الموبايل"),
    row(lastCycle(11), "expense", 200, "اشتراكات", "منصات مشاهدة", "نتفليكس"),
    row(lastCycle(12), "transfer", 1_000, "تحويل", "جمعية", "قسط الجمعية", { parsedMetadata: { direction: "outgoing" } }),
    row(lastCycle(-18), "transfer", 1_000, "تحويل", "جمعية", "قسط الجمعية", { parsedMetadata: { direction: "outgoing" } }),
  ];
  await db.insert(expenses).values(rows);

  // The user's business, with its own ledger: never part of the personal figures above.
  const [workshop] = await db.insert(userBusinesses).values({ ...user, name: "ورشة النجارة", type: "workshop", isActive: true });
  const businessId = Number(workshop.insertId);
  await db.insert(expenses).values([
    row(day(2), "expense", 2_000, "خامات", "خشب", "خشب للورشة", { businessId }),
    row(day(6), "expense", 450, "نقل", "نقل بضاعة", "نقل الخشب", { businessId }),
    row(day(9), "expense", 300, "فواتير", "كهربا", "كهربا الورشة", { businessId }),
  ]);

  await db.insert(userWallets).values([
    { ...user, name: "الكاش", provider: "cash", balance: tight ? "450.00" : "1800.00", createdAt: at(day(-10)) },
    { ...user, name: "حساب البنك", provider: "BankTransfer", balance: tight ? "600.00" : "6500.00", createdAt: at(day(-10)) },
  ]);
  await db.insert(financialGoals).values({ ...user, title: "موبايل جديد", targetAmount: "30000.00", status: "active" });
  await db.insert(userBudgets).values({ ...user, title: "الأكل", category: "أكل وشرب", monthlyLimit: "2000.00", periodStartDay: salaryDay, status: "active" });
  await db.insert(installmentPlans).values({
    ...user, title: "قسط الموبايل", keyword: "فاليو", monthlyAmount: "800.00", totalInstallments: 12, paidBefore: 3,
    createdAt: at(lastCycle(-2)),
  });
  return { id, userType: "local", days: { today, cycleStart, salaryDay } };
}

/** Every row of the evaluation's users, gone. Only users marked as fabricated are touched. */
export async function removeEvalUsers(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const marked = await db
    .select({ id: localUsers.id })
    .from(localUsers)
    .where(and(inArray(localUsers.id, ids), like(localUsers.name, `%${EVAL_MARKER}%`)));
  const safe = marked.map((row) => row.id);
  if (!safe.length) return;
  const scope = (table: { userId: typeof expenses.userId; userType: typeof expenses.userType }) =>
    and(inArray(table.userId, safe), eq(table.userType, "local"));
  for (const table of [
    expenses, userWallets, financialGoals, userBudgets, installmentPlans, userContacts, userProfiles, userBusinesses,
    cashflowSettlements, scheduledCashflows, coachingSteps, coachingPlans,
  ]) {
    await db.delete(table).where(scope(table as never));
  }
  await db.delete(localUsers).where(inArray(localUsers.id, safe));
}
