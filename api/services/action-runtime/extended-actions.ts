import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import {
  aiActionMemory,
  expenses,
  financialGoals,
  userBudgets,
  userWallets,
} from "../../../db/schema";
import { db } from "../../queries/connection";
import { invalidateUserMemory } from "../../lib/muscle-memory";
import { arabicDisplayName, normalizeCategoryFromUserText } from "../../lib/category-registry";
import { invalidateFinanceUserCache } from "../finance-semantic-layer";
import { getSmartProfile, saveSmartProfile } from "../user-profile-service";
import type {
  ActionRuntimeContext,
  BudgetCreatePayload,
  ExpenseCreatePayload,
  ExpenseRecategorizePayload,
  GoalCreatePayload,
  GoalStopPayload,
  GoalUpdatePayload,
  ProfileUpdatePayload,
  RuntimeActionName,
  RuntimeActionPayload,
  UndoPayload,
  WalletCreatePayload,
  WalletUpdatePayload,
} from "./types";

const budgetCreatePayloadSchema = z.object({
  title: z.string().min(2).max(200),
  category: z.string().min(2).max(100).optional(),
  monthlyLimit: z.number().positive(),
  linkedGoalId: z.number().int().positive().optional(),
});

const goalUpdatePayloadSchema = z
  .object({
    goalId: z.number().int().positive(),
    title: z.string().min(2).max(200).optional(),
    description: z.string().max(1000).optional(),
    targetAmount: z.number().positive().optional(),
    targetDate: z.string().optional(),
    status: z.enum(["active", "completed", "cancelled"]).optional(),
  })
  .refine(
    (payload) =>
      payload.title !== undefined ||
      payload.description !== undefined ||
      payload.targetAmount !== undefined ||
      payload.targetDate !== undefined ||
      payload.status !== undefined,
    "goal.update requires at least one field",
  );

const goalStopPayloadSchema = z.object({
  goalId: z.number().int().positive(),
  reason: z.string().max(500).optional(),
});

const expenseCreatePayloadSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(["income", "expense", "transfer", "investment"]).default("expense"),
  category: z.string().min(1).max(100),
  subCategory: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  rawText: z.string().min(1).max(1000),
  date: z.string().optional(),
  placeHint: z.string().max(150).optional(),
});

const expenseRecategorizePayloadSchema = z.object({
  expenseId: z.number().int().positive(),
  category: z.string().min(1).max(100),
  subCategory: z.string().min(1).max(100).optional(),
  reason: z.string().max(500).optional(),
});

const profileUpdatePayloadSchema = z.object({
  section: z.enum(["basicInfo", "financialInfo", "lifestyleInfo", "preferences"]),
  patch: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0, "empty patch"),
});

const walletCreatePayloadSchema = z.object({
  name: z.string().min(2).max(100),
  provider: z.string().min(2).max(50),
  lastFourDigits: z.string().regex(/^\d{4}$/).optional(),
  balance: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
});

const walletUpdatePayloadSchema = z
  .object({
    walletId: z.number().int().positive(),
    name: z.string().min(2).max(100).optional(),
    provider: z.string().min(2).max(50).optional(),
    lastFourDigits: z.string().regex(/^\d{4}$/).optional(),
    balance: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  })
  .refine(
    (payload) =>
      payload.name !== undefined ||
      payload.provider !== undefined ||
      payload.lastFourDigits !== undefined ||
      payload.balance !== undefined,
    "wallet.update requires at least one field",
  );

const undoPayloadSchema = z.object({
  targetActionMemoryId: z.number().int().positive().optional(),
  targetActionName: z
    .enum([
      "goal.create",
      "goal.update",
      "goal.stop",
      "expense.create",
      "expense.recategorize",
      "budget.create",
      "profile.update",
      "wallet.create",
      "wallet.update",
      "action.undo",
    ])
    .optional(),
});

function normalizeDigits(value: string): string {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const eastern = "۰۱۲۳۴۵۶۷۸۹";
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = arabic.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    const easternIndex = eastern.indexOf(digit);
    return easternIndex >= 0 ? String(easternIndex) : digit;
  });
}

function extractAmount(message: string): number | undefined {
  const normalized = normalizeDigits(message.toLowerCase());
  const match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(الف|ألف|k|مليون|million)?/i);
  if (!match) return undefined;
  const base = Number(match[1].replace(",", "."));
  if (!Number.isFinite(base) || base <= 0) return undefined;
  const unit = match[2] ?? "";
  if (unit === "مليون" || unit === "million") return Math.round(base * 1_000_000);
  if (unit === "الف" || unit === "ألف" || unit.toLowerCase() === "k") return Math.round(base * 1_000);
  return Math.round(base);
}

function categoryFromMessage(message: string): string | undefined {
  const normalized = message.toLowerCase();
  if (/(اكل|أكل|مطاعم|قهوة|قهوه|عصير|مشروب|مشروبات|كافيه|كافيهات|juice|drink|food|restaurant|جبت غدا|جبت فطار|جبت عشا|اتغديت|اتعشيت|فطرت|بقاله|بقالة|جبت اكل|كارفور|خضار|لحمة|groceries)/i.test(normalized)) return "food";
  if (/(مواصلات|بنزين|اوبر|أوبر|transport|gas|تاكسي|مترو|اتوبيس|أتوبيس|تفويله|تفويلة)/i.test(normalized)) return "transport";
  if (/(تسوق|ملابس|shopping|اشتريت|هدوم|لبس|جزمة|محل)/i.test(normalized)) return "shopping";
  if (/(ادخار|إدخار|تحويش|saving)/i.test(normalized)) return "saving";
  if (/(صحة|صحه|دكتور|دوا|دواء|صيدلية|صيدليه|علاج)/i.test(normalized)) return "health";
  if (/(فواتير|فاتوره|فاتورة|قسط|اقساط|أقساط|كهربا|غاز|مياه|انترنت|إنترنت|نت|شحن)/i.test(normalized)) return "bills";
  if (/(مرتب|راتب|دخل|قبض|salary)/i.test(normalized)) return "salary";

  const compact = message.trim();
  const looksLikeBareCategory =
    compact.length <= 30 &&
    !/\d/.test(compact) &&
    compact.split(/\s+/).length <= 4 &&
    !/(حط|سجل|ضيف|اضف|أضف|اعمل|غير|صحح|خليه|ميزانية|مصروف)/i.test(compact);
  if (looksLikeBareCategory) {
    const canonical = normalizeCategoryFromUserText(compact);
    if (canonical !== "uncategorized") return canonical;
  }
  return undefined;
}

function isExpenseCaptureMessage(message: string): boolean {
  const normalized = normalizeDigits(message.toLowerCase());
  if (!extractAmount(message)) return false;
  if (/(كام|كم|قد ايه|اجمالي|مجموع|ملخص|تقرير)/i.test(normalized)) return false;
  return /(سجل|احفظ|اضف|ضيف|اشتريت|دفعت|صرفت|مصروف|expense|add)/i.test(normalized);
}

function extractPlaceHint(message: string): string | undefined {
  const normalized = message.trim();
  const match = normalized.match(/(?:من|في|عند)\s+([^،,.؟\n]{2,80})/i);
  return match?.[1]
    ?.replace(/(النهارده|اليوم|today|امبارح|yesterday)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractExpenseDate(message: string): string | undefined {
  const normalized = message.toLowerCase();
  const date = new Date();
  if (/(امبارح|yesterday)/i.test(normalized)) {
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  if (/(النهارده|اليوم|today)/i.test(normalized)) {
    return date.toISOString().slice(0, 10);
  }
  return undefined;
}

export function createExpensePayloadFromMessage(message: string): ExpenseCreatePayload | null {
  if (!isExpenseCaptureMessage(message)) return null;
  const amount = extractAmount(message);
  if (!amount) return null;
  const category = categoryFromMessage(message) ?? "uncategorized";
  const placeHint = extractPlaceHint(message);

  return {
    amount,
    type: "expense",
    category,
    subCategory: category === "uncategorized" ? "عام" : undefined,
    description: placeHint ? `مصروف من ${placeHint}` : message.trim().slice(0, 160),
    rawText: message.trim(),
    date: extractExpenseDate(message),
    placeHint,
  };
}

export function createBudgetPayloadFromMessage(message: string): BudgetCreatePayload | null {
  const normalized = message.toLowerCase();
  if (!/(ميزانية|حد شهري|budget|limit)/i.test(normalized)) return null;
  const amount = extractAmount(message);
  if (!amount) return null;
  const category = categoryFromMessage(message);
  return {
    title: category ? `ميزانية ${arabicDisplayName(category)}` : "ميزانية شهرية جديدة",
    category,
    monthlyLimit: amount,
  };
}

export function createProfileUpdatePayloadFromMessage(message: string): ProfileUpdatePayload | null {
  const normalized = message.toLowerCase();
  const amount = extractAmount(message);
  if (amount && /(دخلي|مرتبي|راتبي|income|salary)/i.test(normalized)) {
    return {
      section: "financialInfo",
      patch: { averageMonthlyIncome: amount },
    };
  }

  const profession = normalized.match(/(?:وظيفتي|شغلي|profession)\s*(?:هي|:)?\s*([\p{L}\s]{2,40})/iu);
  if (profession?.[1]) {
    return {
      section: "basicInfo",
      patch: { profession: profession[1].trim() },
    };
  }

  return null;
}

function providerFromMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (/cib/.test(normalized)) return "CIB";
  if (/vodafone|فودافون/.test(normalized)) return "VodafoneCash";
  if (/instapay|انستاباي/.test(normalized)) return "InstaPay";
  if (/visa|فيزا/.test(normalized)) return "Visa";
  if (/mastercard|ماستر/.test(normalized)) return "Mastercard";
  return "Card";
}

export function createWalletPayloadFromMessage(message: string): WalletCreatePayload | null {
  const normalized = message.toLowerCase();
  if (!/(محفظة|كارت|فيزا|wallet|card)/i.test(normalized)) return null;
  if (/(ازاي|كيف|شرح|طريقة|خطوات|how to|what is|\?|\u061f)/i.test(normalized)) return null;
  if (!/(ضيف|اضف|اربط|سجل|add|create|link)/i.test(normalized)) return null;

  const provider = providerFromMessage(message);
  const lastFour = normalizeDigits(message).match(/(?:اخر|آخر|ending|last)?\s*(\d{4})(?!\d)/i)?.[1];
  const balanceMatch = normalizeDigits(message).match(/(?:رصيد|balance)\s*(\d+(?:[.,]\d+)?)/i);
  const balance = balanceMatch ? Number(balanceMatch[1].replace(",", ".")) : undefined;

  return {
    name: provider === "Card" ? "كارت جديد" : provider,
    provider,
    lastFourDigits: lastFour,
    balance: balance && Number.isFinite(balance) ? String(Math.round(balance)) : undefined,
  };
}

function extractEntityId(message: string, labels: string[]): number | undefined {
  const normalized = normalizeDigits(message.toLowerCase());
  for (const label of labels) {
    const match = normalized.match(new RegExp(`${label}\\s*#?\\s*(\\d+)`, "i"));
    if (match?.[1]) {
      const id = Number(match[1]);
      if (Number.isInteger(id) && id > 0) return id;
    }
  }
  const generic = normalized.match(/#\s*(\d+)/);
  if (generic?.[1]) {
    const id = Number(generic[1]);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return undefined;
}

export function createGoalUpdatePayloadFromMessage(message: string): GoalUpdatePayload | null {
  const normalized = message.toLowerCase();
  if (!/(goal|target)/i.test(normalized) || !/(update|edit|change|modify)/i.test(normalized)) return null;
  const goalId = extractEntityId(message, ["goal", "target"]);
  if (!goalId) return null;

  const amountMatch = normalizeDigits(message).match(/(?:targetAmount|target amount|amount)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(",", ".")) : undefined;
  const titleMatch = message.match(/(?:title|name)\s*[:=]\s*([^,\n]{2,120})/i);
  const statusMatch = normalized.match(/\b(active|completed|cancelled)\b/i);
  const payload: GoalUpdatePayload = {
    goalId,
    title: titleMatch?.[1]?.trim(),
    targetAmount: amount,
    status: statusMatch?.[1] as GoalUpdatePayload["status"] | undefined,
  };
  return goalUpdatePayloadSchema.safeParse(payload).success ? payload : null;
}

export function createGoalStopPayloadFromMessage(message: string): GoalStopPayload | null {
  const normalized = message.toLowerCase();
  if (!/(goal|target)/i.test(normalized) || !/(stop|pause|cancel|delete|archive)/i.test(normalized)) return null;
  const goalId = extractEntityId(message, ["goal", "target"]);
  if (!goalId) return null;
  return { goalId, reason: message.trim().slice(0, 500) };
}

export function createExpenseRecategorizePayloadFromMessage(message: string): ExpenseRecategorizePayload | null {
  const normalized = message.toLowerCase();
  if (!/(expense|transaction)/i.test(normalized) || !/(category|recategorize|classify|change)/i.test(normalized)) return null;
  const expenseId = extractEntityId(message, ["expense", "transaction"]);
  if (!expenseId) return null;
  const category =
    normalized.match(/category\s*(?:to|:|=)?\s*([a-z_]{2,40})/i)?.[1] ??
    normalized.match(/\bto\s+([a-z_]{2,40})/i)?.[1] ??
    categoryFromMessage(message);
  if (!category) return null;
  return {
    expenseId,
    category,
    reason: message.trim().slice(0, 500),
  };
}

export function createWalletUpdatePayloadFromMessage(message: string): WalletUpdatePayload | null {
  const normalized = message.toLowerCase();
  if (!/(wallet|card)/i.test(normalized) || !/(update|edit|change|modify)/i.test(normalized)) return null;
  const walletId = extractEntityId(message, ["wallet", "card"]);
  if (!walletId) return null;
  const provider = providerFromMessage(message);
  const balanceMatch = normalizeDigits(message).match(/(?:balance)\s*(\d+(?:[.,]\d+)?)/i);
  const lastFour = normalizeDigits(message).match(/(?:last|ending)\s*(\d{4})(?!\d)/i)?.[1];
  const nameMatch = message.match(/(?:name|title)\s*[:=]\s*([^,\n]{2,100})/i);
  const payload: WalletUpdatePayload = {
    walletId,
    name: nameMatch?.[1]?.trim(),
    provider: provider === "Card" ? undefined : provider,
    lastFourDigits: lastFour,
    balance: balanceMatch ? Number(balanceMatch[1].replace(",", ".")).toFixed(2) : undefined,
  };
  return walletUpdatePayloadSchema.safeParse(payload).success ? payload : null;
}

export function createUndoPayloadFromMessage(message: string): UndoPayload | null {
  const normalized = message.toLowerCase();
  if (!/(تراجع|ارجع|رجع|الغاء اخر|إلغاء آخر|undo|revert)/i.test(normalized)) return null;
  return {};
}

export function createPhase8PayloadFromMessage(message: string): {
  actionName: RuntimeActionName;
  payload: RuntimeActionPayload;
} | null {
  const undo = createUndoPayloadFromMessage(message);
  if (undo) return { actionName: "action.undo", payload: undo };

  const goalStop = createGoalStopPayloadFromMessage(message);
  if (goalStop) return { actionName: "goal.stop", payload: goalStop };

  const goalUpdate = createGoalUpdatePayloadFromMessage(message);
  if (goalUpdate) return { actionName: "goal.update", payload: goalUpdate };

  const walletUpdate = createWalletUpdatePayloadFromMessage(message);
  if (walletUpdate) return { actionName: "wallet.update", payload: walletUpdate };

  const expenseRecategorize = createExpenseRecategorizePayloadFromMessage(message);
  if (expenseRecategorize) return { actionName: "expense.recategorize", payload: expenseRecategorize };

  const expense = createExpensePayloadFromMessage(message);
  if (expense) return { actionName: "expense.create", payload: expense };

  const wallet = createWalletPayloadFromMessage(message);
  if (wallet) return { actionName: "wallet.create", payload: wallet };

  const profile = createProfileUpdatePayloadFromMessage(message);
  if (profile) return { actionName: "profile.update", payload: profile };

  const budget = createBudgetPayloadFromMessage(message);
  if (budget) return { actionName: "budget.create", payload: budget };

  return null;
}

export function createBudgetSuggestionFromGoal(
  goal: GoalCreatePayload,
  goalId?: number,
): BudgetCreatePayload | null {
  if (!goal.targetAmount) return null;
  const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;
  const months =
    targetDate && Number.isFinite(targetDate.getTime())
      ? Math.max(1, Math.ceil((targetDate.getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000)))
      : 12;

  return {
    title: `ميزانية ادخار: ${goal.title}`,
    category: "saving",
    monthlyLimit: Math.ceil(goal.targetAmount / months),
    linkedGoalId: goalId,
  };
}

export async function validateRuntimeAction(
  _ctx: ActionRuntimeContext,
  actionName: RuntimeActionName,
  payload: RuntimeActionPayload,
): Promise<RuntimeActionPayload> {
  if (actionName === "goal.update") return goalUpdatePayloadSchema.parse(payload);
  if (actionName === "goal.stop") return goalStopPayloadSchema.parse(payload);
  if (actionName === "expense.create") {
    const parsed = expenseCreatePayloadSchema.parse(payload);
    return { ...parsed, category: normalizeCategoryFromUserText(parsed.category) };
  }
  if (actionName === "expense.recategorize") {
    const parsed = expenseRecategorizePayloadSchema.parse(payload);
    return { ...parsed, category: normalizeCategoryFromUserText(parsed.category) };
  }
  if (actionName === "budget.create") {
    const parsed = budgetCreatePayloadSchema.parse(payload);
    return parsed.category ? { ...parsed, category: normalizeCategoryFromUserText(parsed.category) } : parsed;
  }
  if (actionName === "profile.update") return profileUpdatePayloadSchema.parse(payload);
  if (actionName === "wallet.create") return walletCreatePayloadSchema.parse(payload);
  if (actionName === "wallet.update") return walletUpdatePayloadSchema.parse(payload);
  if (actionName === "action.undo") return undoPayloadSchema.parse(payload);
  return payload;
}

async function executeExpenseCreate(
  ctx: ActionRuntimeContext,
  payload: ExpenseCreatePayload,
): Promise<Record<string, unknown>> {
  const expense = expenseCreatePayloadSchema.parse(payload);
  const expenseDate = expense.date ? new Date(expense.date) : new Date();
  const [inserted] = await db.insert(expenses).values({
    userId: ctx.userId,
    userType: ctx.userType,
    type: expense.type ?? "expense",
    amount: expense.amount.toString(),
    category: expense.category,
    subCategory: expense.subCategory || "عام",
    description: expense.description || "",
    rawText: expense.rawText,
    source: "ai_parsed",
    placeHint: expense.placeHint || null,
    date: Number.isNaN(expenseDate.getTime()) ? new Date() : expenseDate,
  });
  invalidateUserMemory(ctx.userId, ctx.userType);
  await invalidateFinanceUserCache(ctx.userId, ctx.userType);

  return {
    expenseId: Number((inserted as any)?.insertId || 0),
    amount: expense.amount,
    category: expense.category,
    description: expense.description || "",
    date: (Number.isNaN(expenseDate.getTime()) ? new Date() : expenseDate).toISOString().slice(0, 10),
  };
}

async function executeGoalUpdate(
  ctx: ActionRuntimeContext,
  payload: GoalUpdatePayload,
): Promise<Record<string, unknown>> {
  const goal = goalUpdatePayloadSchema.parse(payload);
  const [existing] = await db
    .select()
    .from(financialGoals)
    .where(
      and(
        eq(financialGoals.id, goal.goalId),
        eq(financialGoals.userId, ctx.userId),
        eq(financialGoals.userType, ctx.userType),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Goal not found");

  const update: Record<string, unknown> = {};
  if (goal.title !== undefined) update.title = goal.title;
  if (goal.description !== undefined) update.description = goal.description || null;
  if (goal.targetAmount !== undefined) update.targetAmount = goal.targetAmount.toString();
  if (goal.targetDate !== undefined) {
    const parsedDate = goal.targetDate ? new Date(goal.targetDate) : null;
    if (parsedDate && Number.isNaN(parsedDate.getTime())) throw new Error("Invalid targetDate");
    update.targetDate = parsedDate;
  }
  if (goal.status !== undefined) update.status = goal.status;

  await db
    .update(financialGoals)
    .set(update)
    .where(
      and(
        eq(financialGoals.id, goal.goalId),
        eq(financialGoals.userId, ctx.userId),
        eq(financialGoals.userType, ctx.userType),
      ),
    );
  await invalidateFinanceUserCache(ctx.userId, ctx.userType);
  invalidateUserMemory(ctx.userId, ctx.userType);

  return {
    goalId: goal.goalId,
    previous: {
      title: existing.title,
      description: existing.description,
      targetAmount: existing.targetAmount,
      targetDate: existing.targetDate,
      status: existing.status,
    },
    updated: goal,
  };
}

async function executeGoalStop(
  ctx: ActionRuntimeContext,
  payload: GoalStopPayload,
): Promise<Record<string, unknown>> {
  const goal = goalStopPayloadSchema.parse(payload);
  const [existing] = await db
    .select()
    .from(financialGoals)
    .where(
      and(
        eq(financialGoals.id, goal.goalId),
        eq(financialGoals.userId, ctx.userId),
        eq(financialGoals.userType, ctx.userType),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Goal not found");

  await db
    .update(financialGoals)
    .set({
      status: "cancelled",
      aiAlerts: {
        stoppedBy: "ai_action",
        reason: goal.reason || null,
        stoppedAt: new Date().toISOString(),
      },
    })
    .where(
      and(
        eq(financialGoals.id, goal.goalId),
        eq(financialGoals.userId, ctx.userId),
        eq(financialGoals.userType, ctx.userType),
      ),
    );
  await invalidateFinanceUserCache(ctx.userId, ctx.userType);
  invalidateUserMemory(ctx.userId, ctx.userType);

  return {
    goalId: goal.goalId,
    previousStatus: existing.status,
    status: "cancelled",
    reason: goal.reason,
  };
}

async function executeExpenseRecategorize(
  ctx: ActionRuntimeContext,
  payload: ExpenseRecategorizePayload,
): Promise<Record<string, unknown>> {
  const recategorize = expenseRecategorizePayloadSchema.parse(payload);
  const [existing] = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.id, recategorize.expenseId),
        eq(expenses.userId, ctx.userId),
        eq(expenses.userType, ctx.userType),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Expense not found");

  const previous = {
    category: existing.category,
    subCategory: existing.subCategory,
    parsedMetadata: existing.parsedMetadata,
  };
  await db
    .update(expenses)
    .set({
      category: recategorize.category,
      subCategory: recategorize.subCategory || existing.subCategory || "عام",
      parsedMetadata: {
        ...(existing.parsedMetadata && typeof existing.parsedMetadata === "object"
          ? (existing.parsedMetadata as Record<string, unknown>)
          : {}),
        aiRecategorizedAt: new Date().toISOString(),
        aiRecategorizeReason: recategorize.reason || null,
        previousCategory: existing.category,
        previousSubCategory: existing.subCategory,
      },
    })
    .where(
      and(
        eq(expenses.id, recategorize.expenseId),
        eq(expenses.userId, ctx.userId),
        eq(expenses.userType, ctx.userType),
      ),
    );
  invalidateUserMemory(ctx.userId, ctx.userType);
  await invalidateFinanceUserCache(ctx.userId, ctx.userType);

  return {
    expenseId: recategorize.expenseId,
    previous,
    category: recategorize.category,
    subCategory: recategorize.subCategory || existing.subCategory || "عام",
  };
}

function pickPreviousValues(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    previous[key] = base[key];
  }
  return previous;
}

async function executeProfileUpdate(
  ctx: ActionRuntimeContext,
  payload: ProfileUpdatePayload,
): Promise<Record<string, unknown>> {
  const profile = await getSmartProfile(ctx.userId, ctx.userType);
  const previous = pickPreviousValues(profile[payload.section], payload.patch);
  const nextProfile = {
    ...profile,
    [payload.section]: {
      ...profile[payload.section],
      ...payload.patch,
    },
    lastAiRefreshAt: new Date(),
  };
  await saveSmartProfile(ctx.userId, ctx.userType, nextProfile);
  return {
    section: payload.section,
    patch: payload.patch,
    previous,
  };
}

async function executeWalletCreate(
  ctx: ActionRuntimeContext,
  payload: WalletCreatePayload,
): Promise<Record<string, unknown>> {
  const [inserted] = await db.insert(userWallets).values({
    userId: ctx.userId,
    userType: ctx.userType,
    name: payload.name,
    provider: payload.provider,
    lastFourDigits: payload.lastFourDigits || null,
    balance: payload.balance || "0.00",
  });
  await invalidateFinanceUserCache(ctx.userId, ctx.userType);

  return {
    walletId: Number((inserted as any)?.insertId || 0),
    ...payload,
  };
}

async function executeWalletUpdate(
  ctx: ActionRuntimeContext,
  payload: WalletUpdatePayload,
): Promise<Record<string, unknown>> {
  const wallet = walletUpdatePayloadSchema.parse(payload);
  const [existing] = await db
    .select()
    .from(userWallets)
    .where(
      and(
        eq(userWallets.id, wallet.walletId),
        eq(userWallets.userId, ctx.userId),
        eq(userWallets.userType, ctx.userType),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Wallet not found");

  const update: Record<string, unknown> = {};
  if (wallet.name !== undefined) update.name = wallet.name;
  if (wallet.provider !== undefined) update.provider = wallet.provider;
  if (wallet.lastFourDigits !== undefined) update.lastFourDigits = wallet.lastFourDigits || null;
  if (wallet.balance !== undefined) update.balance = wallet.balance;

  await db
    .update(userWallets)
    .set(update)
    .where(
      and(
        eq(userWallets.id, wallet.walletId),
        eq(userWallets.userId, ctx.userId),
        eq(userWallets.userType, ctx.userType),
      ),
    );
  invalidateUserMemory(ctx.userId, ctx.userType);
  await invalidateFinanceUserCache(ctx.userId, ctx.userType);

  return {
    walletId: wallet.walletId,
    previous: {
      name: existing.name,
      provider: existing.provider,
      lastFourDigits: existing.lastFourDigits,
      balance: existing.balance,
    },
    updated: wallet,
  };
}

async function findUndoTarget(ctx: ActionRuntimeContext, payload: UndoPayload) {
  let rows;
  if (payload.targetActionMemoryId) {
    rows = await db
      .select()
      .from(aiActionMemory)
      .where(
        and(
          eq(aiActionMemory.id, payload.targetActionMemoryId),
          eq(aiActionMemory.userId, ctx.userId),
          eq(aiActionMemory.userType, ctx.userType),
          eq(aiActionMemory.status, "executed"),
        ),
      )
      .limit(1);
  } else {
    rows = await db
      .select()
      .from(aiActionMemory)
      .where(
        and(
          eq(aiActionMemory.userId, ctx.userId),
          eq(aiActionMemory.userType, ctx.userType),
          eq(aiActionMemory.status, "executed"),
        ),
      )
      .orderBy(desc(aiActionMemory.updatedAt))
      .limit(5);
  }

  return (rows || []).find((row) => {
    if (row.actionName === "action.undo" || row.status !== "executed") return false;
    if (payload.targetActionName && row.actionName !== payload.targetActionName) return false;
    return [
      "goal.create",
      "goal.update",
      "goal.stop",
      "expense.recategorize",
      "wallet.create",
      "wallet.update",
      "profile.update",
    ].includes(row.actionName);
  });
}

async function executeUndo(
  ctx: ActionRuntimeContext,
  payload: UndoPayload,
): Promise<Record<string, unknown>> {
  const target = await findUndoTarget(ctx, payload);
  if (!target) throw new Error("No reversible action found");

  const targetPayload = (target.payload || {}) as Record<string, unknown>;
  if (target.actionName === "goal.create") {
    const goalId = Number(targetPayload.goalId);
    if (!goalId) throw new Error("Goal action has no goalId to undo");
    await db
      .update(financialGoals)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(financialGoals.id, goalId),
          eq(financialGoals.userId, ctx.userId),
          eq(financialGoals.userType, ctx.userType),
        ),
      );
    await invalidateFinanceUserCache(ctx.userId, ctx.userType);
    return { undoneActionMemoryId: target.id, undoneActionName: target.actionName, goalId };
  }

  if (target.actionName === "wallet.create") {
    const walletId = Number(targetPayload.walletId);
    if (!walletId) throw new Error("Wallet action has no walletId to undo");
    await db
      .delete(userWallets)
      .where(
        and(
          eq(userWallets.id, walletId),
          eq(userWallets.userId, ctx.userId),
          eq(userWallets.userType, ctx.userType),
        ),
      );
    return { undoneActionMemoryId: target.id, undoneActionName: target.actionName, walletId };
  }

  if (target.actionName === "goal.update") {
    const goalId = Number(targetPayload.goalId);
    const previous = targetPayload.previous as Record<string, unknown> | undefined;
    if (!goalId || !previous) throw new Error("Goal update action has no previous state to undo");
    await db
      .update(financialGoals)
      .set({
        title: typeof previous.title === "string" ? previous.title : undefined,
        description: typeof previous.description === "string" ? previous.description : null,
        targetAmount:
          previous.targetAmount !== undefined && previous.targetAmount !== null
            ? String(previous.targetAmount)
            : null,
        targetDate: previous.targetDate ? new Date(String(previous.targetDate)) : null,
        status: typeof previous.status === "string" ? previous.status : "active",
      })
      .where(
        and(
          eq(financialGoals.id, goalId),
          eq(financialGoals.userId, ctx.userId),
          eq(financialGoals.userType, ctx.userType),
        ),
      );
    await invalidateFinanceUserCache(ctx.userId, ctx.userType);
    invalidateUserMemory(ctx.userId, ctx.userType);
    return { undoneActionMemoryId: target.id, undoneActionName: target.actionName, goalId };
  }

  if (target.actionName === "goal.stop") {
    const goalId = Number(targetPayload.goalId);
    const previousStatus = typeof targetPayload.previousStatus === "string" ? targetPayload.previousStatus : "active";
    if (!goalId) throw new Error("Goal stop action has no goalId to undo");
    await db
      .update(financialGoals)
      .set({ status: previousStatus })
      .where(
        and(
          eq(financialGoals.id, goalId),
          eq(financialGoals.userId, ctx.userId),
          eq(financialGoals.userType, ctx.userType),
        ),
      );
    await invalidateFinanceUserCache(ctx.userId, ctx.userType);
    invalidateUserMemory(ctx.userId, ctx.userType);
    return { undoneActionMemoryId: target.id, undoneActionName: target.actionName, goalId };
  }

  if (target.actionName === "expense.recategorize") {
    const expenseId = Number(targetPayload.expenseId);
    const previous = targetPayload.previous as Record<string, unknown> | undefined;
    if (!expenseId || !previous) throw new Error("Expense recategorize action has no previous state to undo");
    await db
      .update(expenses)
      .set({
        category: String(previous.category || "uncategorized"),
        subCategory: previous.subCategory ? String(previous.subCategory) : null,
        parsedMetadata: previous.parsedMetadata ?? null,
      })
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.userId, ctx.userId),
          eq(expenses.userType, ctx.userType),
        ),
      );
    invalidateUserMemory(ctx.userId, ctx.userType);
    await invalidateFinanceUserCache(ctx.userId, ctx.userType);
    return { undoneActionMemoryId: target.id, undoneActionName: target.actionName, expenseId };
  }

  if (target.actionName === "wallet.update") {
    const walletId = Number(targetPayload.walletId);
    const previous = targetPayload.previous as Record<string, unknown> | undefined;
    if (!walletId || !previous) throw new Error("Wallet update action has no previous state to undo");
    await db
      .update(userWallets)
      .set({
        name: String(previous.name || "Wallet"),
        provider: String(previous.provider || "Card"),
        lastFourDigits: previous.lastFourDigits ? String(previous.lastFourDigits) : null,
        balance: previous.balance !== undefined && previous.balance !== null ? String(previous.balance) : "0.00",
      })
      .where(
        and(
          eq(userWallets.id, walletId),
          eq(userWallets.userId, ctx.userId),
          eq(userWallets.userType, ctx.userType),
        ),
      );
    invalidateUserMemory(ctx.userId, ctx.userType);
    await invalidateFinanceUserCache(ctx.userId, ctx.userType);
    return { undoneActionMemoryId: target.id, undoneActionName: target.actionName, walletId };
  }

  if (target.actionName === "profile.update") {
    const section = targetPayload.section as ProfileUpdatePayload["section"];
    const previous = targetPayload.previous as Record<string, unknown> | undefined;
    if (!section || !previous) throw new Error("Profile action has no previous state to undo");
    await executeProfileUpdate(ctx, { section, patch: previous });
    return { undoneActionMemoryId: target.id, undoneActionName: target.actionName, section };
  }

  if (target.actionName === "budget.create") {
    const budgetId = Number(targetPayload.budgetId);
    if (!budgetId) throw new Error("Budget action has no budgetId to undo");
    await db
      .delete(userBudgets)
      .where(
        and(
          eq(userBudgets.id, budgetId),
          eq(userBudgets.userId, ctx.userId),
          eq(userBudgets.userType, ctx.userType),
        ),
      );
    await invalidateFinanceUserCache(ctx.userId, ctx.userType);
    return { undoneActionMemoryId: target.id, undoneActionName: target.actionName, budgetId };
  }

  if (target.actionName === "expense.create") {
    const expenseId = Number(targetPayload.expenseId);
    if (!expenseId) throw new Error("Expense action has no expenseId to undo");
    await db
      .delete(expenses)
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.userId, ctx.userId),
          eq(expenses.userType, ctx.userType),
        ),
      );
    invalidateUserMemory(ctx.userId, ctx.userType);
    await invalidateFinanceUserCache(ctx.userId, ctx.userType);
    return { undoneActionMemoryId: target.id, undoneActionName: target.actionName, expenseId };
  }

  throw new Error(`Action ${target.actionName} is not reversible`);
}

async function executeBudgetCreate(
  ctx: ActionRuntimeContext,
  payload: BudgetCreatePayload,
): Promise<Record<string, unknown>> {
  const budget = budgetCreatePayloadSchema.parse(payload);
  const [inserted] = await db.insert(userBudgets).values({
    userId: ctx.userId,
    userType: ctx.userType,
    title: budget.title.trim(),
    category: budget.category?.trim() || null,
    monthlyLimit: String(budget.monthlyLimit),
    linkedGoalId: budget.linkedGoalId || null,
    status: "active",
  });
  await invalidateFinanceUserCache(ctx.userId, ctx.userType);

  return {
    budgetId: Number((inserted as any)?.insertId || 0),
    ...budget,
  };
}

export async function executeRuntimeAction(
  ctx: ActionRuntimeContext,
  actionName: RuntimeActionName,
  payload: RuntimeActionPayload,
): Promise<Record<string, unknown>> {
  if (actionName === "goal.update") {
    return executeGoalUpdate(ctx, goalUpdatePayloadSchema.parse(payload));
  }
  if (actionName === "goal.stop") {
    return executeGoalStop(ctx, goalStopPayloadSchema.parse(payload));
  }
  if (actionName === "expense.create") {
    return executeExpenseCreate(ctx, expenseCreatePayloadSchema.parse(payload));
  }
  if (actionName === "expense.recategorize") {
    return executeExpenseRecategorize(ctx, expenseRecategorizePayloadSchema.parse(payload));
  }
  if (actionName === "budget.create") {
    return executeBudgetCreate(ctx, budgetCreatePayloadSchema.parse(payload));
  }
  if (actionName === "profile.update") {
    return executeProfileUpdate(ctx, profileUpdatePayloadSchema.parse(payload));
  }
  if (actionName === "wallet.create") {
    return executeWalletCreate(ctx, walletCreatePayloadSchema.parse(payload));
  }
  if (actionName === "wallet.update") {
    return executeWalletUpdate(ctx, walletUpdatePayloadSchema.parse(payload));
  }
  if (actionName === "action.undo") {
    return executeUndo(ctx, undoPayloadSchema.parse(payload));
  }
  throw new Error(`Unsupported phase 8 action ${actionName}`);
}
