import "dotenv/config";

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { and, eq, like, sql } from "drizzle-orm";
import {
  aiMemoryEmbeddings,
  aiMemoryItems,
  chatConversations,
  chatMessages,
  expenses,
  financialGoals,
  localUsers,
  systemSettings,
  userProfiles,
  userWallets,
} from "../../db/schema";
import { db } from "../queries/connection";
import { hashPassword } from "../local-auth-utils";
import { backfillMemoryEmbeddings, writeConversationMemory } from "../services/ai-memory";
import { invalidateFinanceUserCache } from "../services/finance-semantic-layer";
import { DEFAULT_EMBEDDING_BASE_URL, DEFAULT_EMBEDDING_MODEL } from "../services/ai-memory/embedding-settings";
import type { MemoryMessage } from "../services/ai-memory";

export const AI_CENTER_QA_MARKER = "QA_SEED_AI_CENTER_V1";
export const AI_CENTER_QA_PHONE = "01055501999";
export const AI_CENTER_QA_PASSWORD = "SmartSpendQA!2026";
export const AI_CENTER_QA_USER_TYPE = "local";
export const AI_CENTER_QA_PLAN = "ultra";

export interface AICenterQASeedResult {
  user: {
    id: number;
    name: string;
    phone: string;
    userType: string;
    plan: string;
  };
  seeded: {
    expenses: number;
    wallets: number;
    goals: number;
    memoryMessages: number;
    activeMemories: number;
    embeddings: number;
  };
  embeddingBackfill: Awaited<ReturnType<typeof backfillMemoryEmbeddings>>;
}

function directRun(): boolean {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function atToday(hour: number, minute = 0): Date {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

function atCurrentMonthDay(day: number, hour = 12): Date {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), Math.min(day, now.getDate()), hour, 0, 0, 0);
  return date;
}

function atMonthOffset(offset: number, day = 6, hour = 12): Date {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1, hour, 0, 0, 0);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({
      set: { value },
    });
}

async function countRows(table: typeof aiMemoryItems | typeof aiMemoryEmbeddings, userId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(table)
    .where(and(eq(table.userId, userId), eq(table.userType, AI_CENTER_QA_USER_TYPE)));
  return Number(row?.count ?? 0);
}

async function ensureEmbeddingSettings(): Promise<void> {
  await Promise.all([
    upsertSetting("ai_memory_embedding_enabled", "true"),
    upsertSetting("ai_embedding_provider", "fireworks"),
    upsertSetting("ai_embedding_base_url", DEFAULT_EMBEDDING_BASE_URL),
    upsertSetting("ai_embedding_model", DEFAULT_EMBEDDING_MODEL),
    upsertSetting("ai_embedding_dimensions_short", "256"),
    upsertSetting("ai_embedding_dimensions_memory", "768"),
    upsertSetting("ai_embedding_dimensions_deep", "1024"),
  ]);
}

async function ensureQaUser(): Promise<AICenterQASeedResult["user"]> {
  const password = await hashPassword(AI_CENTER_QA_PASSWORD);

  await db
    .insert(localUsers)
    .values({
      name: "AI Center QA Seed",
      phone: AI_CENTER_QA_PHONE,
      password,
      role: "admin",
      plan: AI_CENTER_QA_PLAN,
      referralCode: "SSQA01",
    })
    .onDuplicateKeyUpdate({
      set: {
        name: "AI Center QA Seed",
        password,
        role: "admin",
        plan: AI_CENTER_QA_PLAN,
      },
    });

  const [user] = await db
    .select({
      id: localUsers.id,
      name: localUsers.name,
      phone: localUsers.phone,
      plan: localUsers.plan,
    })
    .from(localUsers)
    .where(eq(localUsers.phone, AI_CENTER_QA_PHONE))
    .limit(1);

  if (!user?.id) {
    throw new Error("Failed to create or load AI Center QA user");
  }

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    userType: AI_CENTER_QA_USER_TYPE,
    plan: user.plan || AI_CENTER_QA_PLAN,
  };
}

async function seedProfile(userId: number): Promise<void> {
  await db
    .insert(userProfiles)
    .values({
      userId,
      userType: AI_CENTER_QA_USER_TYPE,
      monthlyIncome: "18000.00",
      financialGoal: "saving",
      financialPersonality: "balanced",
      basicInfo: {
        nickname: "QA Tester",
        city: "Cairo",
      },
      financialInfo: {
        salaryDay: 1,
        primaryCurrency: "EGP",
        monthlyIncome: 18000,
      },
      lifestyleInfo: {
        coffeeHabit: "daily",
        sleepGoal: "7 hours",
      },
      preferences: {
        language: "egyptian_arabic",
        wantsEvidenceRows: true,
      },
      profileCompleted: true,
    })
    .onDuplicateKeyUpdate({
      set: {
        monthlyIncome: "18000.00",
        financialGoal: "saving",
        financialPersonality: "balanced",
        financialInfo: {
          salaryDay: 1,
          primaryCurrency: "EGP",
          monthlyIncome: 18000,
        },
        lifestyleInfo: {
          coffeeHabit: "daily",
          sleepGoal: "7 hours",
        },
        preferences: {
          language: "egyptian_arabic",
          wantsEvidenceRows: true,
        },
        profileCompleted: true,
      },
    });
}

async function seedExpenses(userId: number): Promise<number> {
  await db
    .delete(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        eq(expenses.userType, AI_CENTER_QA_USER_TYPE),
        like(expenses.rawText, `%${AI_CENTER_QA_MARKER}%`),
      ),
    );

  const rows: Array<typeof expenses.$inferInsert> = [
    {
      userId,
      userType: AI_CENTER_QA_USER_TYPE,
      type: "income",
      amount: "18000.00",
      category: "income",
      subCategory: "salary",
      description: "QA monthly salary",
      rawText: `${AI_CENTER_QA_MARKER} income salary`,
      source: "manual",
      paymentMethod: "bank",
      date: atCurrentMonthDay(1, 9),
      status: "confirmed",
    },
    {
      userId,
      userType: AI_CENTER_QA_USER_TYPE,
      type: "expense",
      amount: "55.50",
      category: "food",
      subCategory: "coffee",
      description: "Morning coffee",
      rawText: `${AI_CENTER_QA_MARKER} food coffee today`,
      source: "manual",
      paymentMethod: "wallet",
      placeHint: "Costa QA",
      date: atToday(8, 30),
      status: "confirmed",
    },
    {
      userId,
      userType: AI_CENTER_QA_USER_TYPE,
      type: "expense",
      amount: "120.00",
      category: "food",
      subCategory: "restaurant",
      description: "Lunch",
      rawText: `${AI_CENTER_QA_MARKER} food lunch today`,
      source: "manual",
      paymentMethod: "card",
      placeHint: "Koshary QA",
      date: atToday(14),
      status: "confirmed",
    },
    {
      userId,
      userType: AI_CENTER_QA_USER_TYPE,
      type: "expense",
      amount: "40.00",
      category: "transport",
      subCategory: "ride_hailing",
      description: "Ride home",
      rawText: `${AI_CENTER_QA_MARKER} transport ride today`,
      source: "manual",
      paymentMethod: "card",
      placeHint: "Uber QA",
      date: atToday(18),
      status: "confirmed",
    },
    {
      userId,
      userType: AI_CENTER_QA_USER_TYPE,
      type: "expense",
      amount: "350.00",
      category: "bills",
      subCategory: "internet",
      description: "Internet bill",
      rawText: `${AI_CENTER_QA_MARKER} bill internet current month`,
      source: "manual",
      paymentMethod: "card",
      placeHint: "Telecom QA",
      date: atCurrentMonthDay(10, 13),
      status: "confirmed",
    },
    {
      userId,
      userType: AI_CENTER_QA_USER_TYPE,
      type: "expense",
      amount: "375.75",
      category: "food",
      subCategory: "supermarket",
      description: "Groceries",
      rawText: `${AI_CENTER_QA_MARKER} food groceries current month`,
      source: "manual",
      paymentMethod: "card",
      placeHint: "Carrefour QA",
      date: atCurrentMonthDay(5, 17),
      status: "confirmed",
    },
    ...[
      { offset: -1, amount: "470.00", label: "previous month food" },
      { offset: -2, amount: "520.00", label: "two months ago food" },
      { offset: -3, amount: "390.00", label: "three months ago food" },
      { offset: -4, amount: "610.00", label: "four months ago food" },
      { offset: -5, amount: "455.00", label: "five months ago food" },
    ].map((item) => ({
      userId,
      userType: AI_CENTER_QA_USER_TYPE,
      type: "expense",
      amount: item.amount,
      category: "food",
      subCategory: "monthly_food_baseline",
      description: `QA ${item.label}`,
      rawText: `${AI_CENTER_QA_MARKER} ${item.label}`,
      source: "manual",
      paymentMethod: "card",
      placeHint: "QA Month Baseline",
      date: atMonthOffset(item.offset),
      status: "confirmed",
    })),
  ];

  await db.insert(expenses).values(rows);
  await invalidateFinanceUserCache(userId, AI_CENTER_QA_USER_TYPE);
  return rows.length;
}

async function seedWallets(userId: number): Promise<number> {
  await db
    .delete(userWallets)
    .where(
      and(
        eq(userWallets.userId, userId),
        eq(userWallets.userType, AI_CENTER_QA_USER_TYPE),
        like(userWallets.name, `${AI_CENTER_QA_MARKER}%`),
      ),
    );

  await db.insert(userWallets).values({
    userId,
    userType: AI_CENTER_QA_USER_TYPE,
    name: `${AI_CENTER_QA_MARKER} Main Wallet`,
    provider: "Visa",
    lastFourDigits: "2026",
    balance: "12450.00",
  });

  return 1;
}

async function seedGoal(userId: number): Promise<number> {
  await db
    .delete(financialGoals)
    .where(
      and(
        eq(financialGoals.userId, userId),
        eq(financialGoals.userType, AI_CENTER_QA_USER_TYPE),
        like(financialGoals.title, `${AI_CENTER_QA_MARKER}%`),
      ),
    );

  await db.insert(financialGoals).values({
    userId,
    userType: AI_CENTER_QA_USER_TYPE,
    title: `${AI_CENTER_QA_MARKER} Car Goal`,
    description: "Seeded goal for AI Center action/progress QA",
    targetAmount: "100000.00",
    targetDate: atMonthOffset(12),
    status: "active",
    aiPlan: {
      monthlySuggestedSaving: 5000,
      source: AI_CENTER_QA_MARKER,
    },
  });

  await invalidateFinanceUserCache(userId, AI_CENTER_QA_USER_TYPE);
  return 1;
}

async function ensureMemoryConversation(userId: number): Promise<number> {
  const [existing] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.userId, userId),
        eq(chatConversations.userType, AI_CENTER_QA_USER_TYPE),
        eq(chatConversations.title, `${AI_CENTER_QA_MARKER} Semantic Memory`),
      ),
    )
    .limit(1);

  if (existing?.id) return existing.id;

  const [inserted] = await db.insert(chatConversations).values({
    userId,
    userType: AI_CENTER_QA_USER_TYPE,
    title: `${AI_CENTER_QA_MARKER} Semantic Memory`,
    messageCount: 0,
    totalTokens: 0,
    lastMessageAt: new Date(),
  });

  return Number((inserted as { insertId?: number })?.insertId || 0);
}

async function seedMemory(userId: number): Promise<{ conversationId: number; messageCount: number }> {
  const conversationId = await ensureMemoryConversation(userId);
  if (!conversationId) throw new Error("Failed to create QA memory conversation");

  const messages: MemoryMessage[] = [
    {
      role: "user",
      content:
        "اتفقنا على coffee plan: أقلل القهوة من 5 مرات يوميا إلى مرتين فقط، وأحول الفرق لهدف العربية.",
    },
    {
      role: "assistant",
      content: "تمام، هنعتبر القهوة عادة محتاجة متابعة يومية ونربطها بهدف العربية.",
    },
    {
      role: "user",
      content:
        "مهم تفتكر sleep plan: عايز أنام قبل 12 بالليل عشان مصاريف الدليفري آخر الليل بتزيد.",
    },
    {
      role: "assistant",
      content: "حاضر، النوم قبل 12 جزء من الخطة لتقليل طلبات آخر الليل.",
    },
  ];

  await db.delete(chatMessages).where(eq(chatMessages.conversationId, conversationId));
  await db.insert(chatMessages).values(
    messages.map((message) => ({
      conversationId,
      role: message.role,
      content: message.content,
      tokensUsed: 0,
      model: "qa-seed",
    })),
  );
  await db
    .update(chatConversations)
    .set({
      messageCount: messages.length,
      lastMessageAt: new Date(),
    })
    .where(eq(chatConversations.id, conversationId));

  await writeConversationMemory({
    userId,
    userType: AI_CENTER_QA_USER_TYPE,
    conversationId,
    messages,
    source: "chat",
  });

  return { conversationId, messageCount: messages.length };
}

export async function seedAICenterQA(): Promise<AICenterQASeedResult> {
  await ensureEmbeddingSettings();
  const user = await ensureQaUser();

  await seedProfile(user.id);
  const expensesCount = await seedExpenses(user.id);
  const walletCount = await seedWallets(user.id);
  const goalCount = await seedGoal(user.id);
  const memory = await seedMemory(user.id);
  const embeddingBackfill = await backfillMemoryEmbeddings({
    userId: user.id,
    userType: AI_CENTER_QA_USER_TYPE,
    forceEnabled: true,
    allowFallbackVectors: false,
    limit: 50,
  });

  return {
    user,
    seeded: {
      expenses: expensesCount,
      wallets: walletCount,
      goals: goalCount,
      memoryMessages: memory.messageCount,
      activeMemories: await countRows(aiMemoryItems, user.id),
      embeddings: await countRows(aiMemoryEmbeddings, user.id),
    },
    embeddingBackfill,
  };
}

if (directRun()) {
  seedAICenterQA()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : error);
      process.exit(1);
    });
}
