import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../api/queries/connection";
import {
  cashflowSettlements, classificationLogs, commitmentHints, commitmentOverrides, commitmentQuestions, commitmentReminders,
  commitmentScheduleItems, expenseDailyRollups, expenses, inAppNotifications, installmentPlans, localUsers, scheduledCashflows,
  systemSettings, userContacts,
} from "../db/schema";
import { commitmentsRouter } from "../api/commitments-router";
import { expenseRouter } from "../api/expense-router";
import { addDays } from "../api/services/coach/schedule";
import { businessDateKey } from "../api/lib/app-time";
import { invalidateSettingsCache } from "../api/lib/settings-cache";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_952, userType: "local" };
const context = { user: { id: user.userId, type: "local", role: "user", plan: "free", name: "Reading Test", email: null } } as never;
const commitments = commitmentsRouter.createCaller(context);
const ledger = expenseRouter.createCaller(context);
const today = businessDateKey();

async function setEngine(value: "rules" | "understanding") {
  await db.insert(systemSettings).values({ key: "recording_engine", value }).onDuplicateKeyUpdate({ set: { value } });
  invalidateSettingsCache();
}

async function clean() {
  if (process.env.RUN_DB_INTEGRATION !== "1") return;
  const scope = <T extends { userId: typeof expenses.userId; userType: typeof expenses.userType }>(table: T) =>
    and(eq(table.userId, user.userId), eq(table.userType, user.userType));
  for (const table of [cashflowSettlements, commitmentHints, commitmentOverrides, commitmentQuestions, commitmentReminders, commitmentScheduleItems,
    scheduledCashflows, installmentPlans, inAppNotifications, expenses, userContacts, expenseDailyRollups, classificationLogs] as const) {
    await db.delete(table).where(scope(table as never));
  }
  await db.delete(localUsers).where(eq(localUsers.id, user.userId));
  await db.delete(systemSettings).where(eq(systemSettings.key, "recording_engine"));
  invalidateSettingsCache();
}

beforeEach(async () => {
  await clean();
  if (process.env.RUN_DB_INTEGRATION !== "1") return;
  await db.insert(localUsers).values({ id: user.userId, phone: "syn-reading", name: "Synthetic", password: "synthetic" });
});
afterAll(clean);

/** A reading log row as the recording service writes it: the items, each with its reading. */
async function readingLog(text: string, items: Array<Record<string, unknown>>): Promise<number> {
  const [row] = await db.insert(classificationLogs).values({
    userId: user.userId, userType: user.userType, originalText: text, parsedBy: "ai", finalResult: items, decision: "auto_save", confidence: 100,
  });
  return Number(row.insertId);
}

const schoolReading = (commitmentId: number | null) => ({
  amount: 5000, category: "تعليم", subCategory: "مدرسة", type: "expense", description: "مصاريف يوسف",
  reading: { category: "education", sub: "school_fees", kind: "spending", flow: "out", commitmentId, commitmentDueDay: null, installments: 1, walletId: null, flags: [] },
});

const school = () => commitments.create({ shape: "fixed", kind: "school", title: "مدرسة الأولاد", amount: 5000, remainingCount: 3, startDay: addDays(today, 2) });

const savedRow = async (id: number) => (await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, user.userId), eq(expenses.userType, user.userType))))[0];

describe("saving what a reading read (docs/decisions/0052-understanding-engine.md)", () => {
  itWithDatabase("links a payment to the commitment its reading named, though the words name none, and keeps the v2 answer on the row", async () => {
    await setEngine("understanding");
    const { id: cashflowId } = await school();
    const classificationLogId = await readingLog("دفعت مصاريف يوسف 5000", [schoolReading(cashflowId)]);

    const saved = await ledger.batchCreate([
      { description: "مصاريف يوسف", rawText: "دفعت مصاريف يوسف 5000", amount: 5000, category: "تعليم", subCategory: "مدرسة", type: "expense", source: "ai_parsed", classificationLogId },
    ]);

    expect(saved.commitmentLinks?.[0]).toMatchObject({ status: "linked", cashflowId });
    const row = await savedRow(saved.ids![0]);
    expect((row.parsedMetadata as { reading?: unknown }).reading).toMatchObject({ category: "education", sub: "school_fees", kind: "spending", flow: "out" });
  });

  itWithDatabase("does not link the same payment without a reading, and ignores a reading the client sends", async () => {
    await setEngine("understanding");
    const { id: cashflowId } = await school();

    const saved = await ledger.create({
      description: "مصاريف يوسف", rawText: "دفعت مصاريف يوسف 5000", amount: 5000, category: "تعليم", subCategory: "مدرسة", type: "expense", source: "ai_parsed",
      parsedMetadata: { reading: { category: "education", sub: "school_fees", kind: "spending", flow: "out", commitmentId: cashflowId } },
    });

    expect(saved.commitmentLinks?.[0]?.status).not.toBe("linked");
    const row = await savedRow(saved.id);
    expect((row.parsedMetadata as { reading?: unknown } | null)?.reading).toBeUndefined();
  });

  itWithDatabase("leaves the reading out when the person changed the category before saving", async () => {
    await setEngine("understanding");
    const { id: cashflowId } = await school();
    const classificationLogId = await readingLog("دفعت مصاريف يوسف 5000", [schoolReading(cashflowId)]);

    const saved = await ledger.create({
      description: "مصاريف يوسف", rawText: "دفعت مصاريف يوسف 5000", amount: 5000, category: "أطفال", subCategory: "عام", type: "expense", source: "ai_parsed", classificationLogId,
    });

    const row = await savedRow(saved.id);
    expect((row.parsedMetadata as { reading?: unknown } | null)?.reading).toBeUndefined();
  });

  itWithDatabase("changes nothing under the rules engine", async () => {
    await setEngine("rules");
    const { id: cashflowId } = await school();
    const classificationLogId = await readingLog("دفعت مصاريف يوسف 5000", [schoolReading(cashflowId)]);

    const saved = await ledger.create({
      description: "مصاريف يوسف", rawText: "دفعت مصاريف يوسف 5000", amount: 5000, category: "تعليم", subCategory: "مدرسة", type: "expense", source: "ai_parsed", classificationLogId,
    });

    expect(saved.commitmentLinks?.[0]?.status).not.toBe("linked");
    const row = await savedRow(saved.id);
    expect((row.parsedMetadata as { reading?: unknown } | null)?.reading).toBeUndefined();
  });
});
