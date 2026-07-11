import type { InferSelectModel } from "drizzle-orm";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { classificationLogs, financialGoals, expenses, userContacts, userProfiles, userWallets } from "../../../db/schema";
import { db } from "../../queries/connection";
import type { Artifact, DataNeed, DataNeedKind, ResolvedFact } from "../ai-kernel/types";
import { collectFinanceCacheTrace, financeCacheKey, financeCacheTtl, withFinanceCache } from "./cache";
import { canonicalCategoryForRow, getCategoryAliases, displayFinanceCategory } from "./category-matcher";
import { createFinanceChartArtifact } from "./chart-artifacts";
import {
  aggregateFinanceSummary,
  amountOf,
  buildBreakdown,
  buildChartData,
  buildMultiCategoryChartData,
} from "./row-aggregators";
import { resolveFinancePeriod } from "./period-resolver";
import type {
  FinanceBreakdown,
  FinanceCategoryTotal,
  FinanceChartData,
  FinanceClassificationTrace,
  FinanceContext,
  FinanceGranularity,
  FinanceGoalProgress,
  FinancePersonTotal,
  FinancePeriodComparison,
  FinancePeriodInput,
  FinanceProfileSnapshot,
  FinanceResolverResult,
  FinanceSummary,
  FinanceComparisonDriver,
  FinanceBusinessCashflow,
  FinanceCategoryInclusion,
  FinanceGoalFeasibility,
  FinanceTransactionFact,
  FinanceTransactionsResult,
  FinanceWalletSummary,
  ResolvedFinancePeriod,
} from "./types";

type ExpenseRow = InferSelectModel<typeof expenses>;
type GoalRow = InferSelectModel<typeof financialGoals>;
type WalletRow = InferSelectModel<typeof userWallets>;

function uniqueList(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dateString(value: unknown): string {
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function rowCanonicalCategory(row: {
  category?: string | null;
  subCategory?: string | null;
  description?: string | null;
  rawText?: string | null;
  placeHint?: string | null;
}): string {
  return canonicalCategoryForRow(row.category, row.subCategory, row.description, row.rawText, row.placeHint);
}

function rowMatchesCategory(row: {
  category?: string | null;
  subCategory?: string | null;
  description?: string | null;
  rawText?: string | null;
  placeHint?: string | null;
}, category: string): boolean {
  return rowCanonicalCategory(row) === category;
}

function rowMatchesAnyCategory(row: {
  category?: string | null;
  subCategory?: string | null;
  description?: string | null;
  rawText?: string | null;
  placeHint?: string | null;
}, categories: string[]): boolean {
  return categories.some((category) => rowMatchesCategory(row, category));
}

function sourceOf(kind: DataNeedKind): DataNeedKind {
  return kind;
}

function makeFact(
  dataNeedId: string,
  source: DataNeedKind,
  label: string,
  value: string | number | boolean | null,
  confidence = 1,
  evidence?: ResolvedFact["evidence"],
): ResolvedFact {
  return {
    id: `${dataNeedId}:${label}`,
    dataNeedId,
    source: sourceOf(source),
    label,
    value,
    confidence,
    evidence,
  };
}

async function loadRowsForPeriod(
  ctx: FinanceContext,
  period: ResolvedFinancePeriod,
): Promise<ExpenseRow[]> {
  return db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, ctx.userId),
        eq(expenses.userType, ctx.userType),
        gte(expenses.date, period.startDate),
        lte(expenses.date, period.endDate),
      ),
    )
    .orderBy(desc(expenses.date));
}

function resolveInputFromNeed(need: DataNeed): FinancePeriodInput {
  return {
    period: need.scope?.period,
    comparePeriod: need.scope?.comparePeriod,
    startDate: need.scope?.startDate,
    endDate: need.scope?.endDate,
  };
}

function normalizePersonLookup(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getFinanceSummary(
  ctx: FinanceContext,
  input: FinancePeriodInput = {},
): Promise<FinanceSummary> {
  const period = resolveFinancePeriod(input, ctx);
  const key = financeCacheKey(ctx.userId, ctx.userType, "summary", period.key);

  return withFinanceCache(key, financeCacheTtl(period.key), async () => {
    const rows = await loadRowsForPeriod(ctx, period);
    return aggregateFinanceSummary(rows, period);
  });
}

function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

export async function getFinancePeriodComparison(
  ctx: FinanceContext,
  input: FinancePeriodInput = {},
): Promise<FinancePeriodComparison> {
  const currentInput: FinancePeriodInput = {
    period: input.period ?? "current_month",
    comparePeriod: input.comparePeriod,
    startDate: input.startDate,
    endDate: input.endDate,
  };
  const key = financeCacheKey(
    ctx.userId,
    ctx.userType,
    "period_comparison",
    currentInput.period ?? "current_month",
    currentInput.comparePeriod ?? "previous_month",
    input.startDate ? String(input.startDate) : "",
    input.endDate ? String(input.endDate) : "",
  );

  return withFinanceCache(key, financeCacheTtl(currentInput.period ?? "current_month"), async () => {
    const [current, previous] = await Promise.all([
      getFinanceSummary(ctx, currentInput),
      getFinanceSummary(ctx, { period: currentInput.comparePeriod ?? "previous_month" }),
    ]);

    return {
      current,
      previous,
      expenseDifference: current.totalExpense - previous.totalExpense,
      expenseChangePercent: percentChange(current.totalExpense, previous.totalExpense),
      incomeDifference: current.totalIncome - previous.totalIncome,
      incomeChangePercent: percentChange(current.totalIncome, previous.totalIncome),
      netFlowDifference: current.netFlow - previous.netFlow,
    };
  });
}

export async function getWalletSummary(ctx: FinanceContext): Promise<FinanceWalletSummary> {
  const key = financeCacheKey(ctx.userId, ctx.userType, "wallet_summary");

  return withFinanceCache(key, 60, async () => {
    const wallets = (await db
      .select()
      .from(userWallets)
      .where(and(eq(userWallets.userId, ctx.userId), eq(userWallets.userType, ctx.userType)))
      .orderBy(userWallets.createdAt)) as WalletRow[];

    const normalized = wallets.map((wallet) => ({
      id: wallet.id,
      name: wallet.name,
      provider: wallet.provider,
      balance: numeric(wallet.balance),
      lastFourDigits: wallet.lastFourDigits,
    }));

    return {
      totalBalance: normalized.reduce((sum, wallet) => sum + wallet.balance, 0),
      walletCount: normalized.length,
      wallets: normalized,
    };
  });
}

export async function getCategoryTotal(
  ctx: FinanceContext,
  category: string,
  input: FinancePeriodInput = {},
): Promise<FinanceCategoryTotal> {
  const period = resolveFinancePeriod(input, ctx);
  const aliases = getCategoryAliases(category);
  const key = financeCacheKey(ctx.userId, ctx.userType, "category_total", period.key, category);

  return withFinanceCache(key, financeCacheTtl(period.key), async () => {
    const rows = (await loadRowsForPeriod(ctx, period)).filter((row) => rowMatchesCategory(row, category));
    const subCategories = new Map<string, { amount: number; count: number }>();
    let totalExpense = 0;
    let totalIncome = 0;

    for (const row of rows) {
      const amount = amountOf(row);
      if (row.type === "income") {
        totalIncome += amount;
      } else {
        totalExpense += amount;
        const name = row.subCategory || "general";
        const existing = subCategories.get(name) ?? { amount: 0, count: 0 };
        existing.amount += amount;
        existing.count += 1;
        subCategories.set(name, existing);
      }
    }

    return {
      period,
      category,
      aliases,
      totalExpense,
      totalIncome,
      transactionCount: rows.length,
      topSubCategories: [...subCategories.entries()]
        .map(([name, item]) => ({ name, amount: item.amount, count: item.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    };
  });
}

/**
 * Finds a named contact from the user's message, then aggregates only expenses
 * linked to that canonical contact id. We deliberately do not fall back to raw
 * text matching: that would reintroduce the ambiguity this relation removes.
 */
export async function getPersonTotal(
  ctx: FinanceContext,
  personQuery: string,
  input: FinancePeriodInput = {},
): Promise<FinancePersonTotal | null> {
  const period = resolveFinancePeriod(input, ctx);
  const normalizedQuery = normalizePersonLookup(personQuery);
  if (!normalizedQuery) return null;

  const contacts = await db
    .select({ id: userContacts.id, name: userContacts.name, relation: userContacts.relation })
    .from(userContacts)
    .where(and(
      eq(userContacts.userId, ctx.userId),
      eq(userContacts.userType, ctx.userType),
      eq(userContacts.isSilenced, false),
    ));

  const contact = contacts
    .map((item) => ({ ...item, normalizedName: normalizePersonLookup(item.name) }))
    .filter((item) => item.normalizedName.length >= 2 && normalizedQuery.includes(item.normalizedName))
    .sort((left, right) => right.normalizedName.length - left.normalizedName.length)[0];
  if (!contact) return null;

  const key = financeCacheKey(ctx.userId, ctx.userType, "person_total", period.key, contact.id);
  return withFinanceCache(key, financeCacheTtl(period.key), async () => {
    const rows = (await loadRowsForPeriod(ctx, period)).filter(
      (row) => row.contactId === contact.id && row.type === "expense",
    );
    return {
      period,
      contactId: contact.id,
      name: contact.name,
      relation: contact.relation,
      totalExpense: rows.reduce((sum, row) => sum + amountOf(row), 0),
      transactionCount: rows.length,
    };
  });
}

export async function getFinanceBreakdown(
  ctx: FinanceContext,
  input: FinancePeriodInput & {
    category?: string;
    granularity?: FinanceGranularity;
    limit?: number;
  } = {},
): Promise<FinanceBreakdown> {
  const period = resolveFinancePeriod(input, ctx);
  const granularity = input.granularity ?? "category";
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 30);
  const key = financeCacheKey(
    ctx.userId,
    ctx.userType,
    "breakdown",
    period.key,
    input.category ?? "all",
    granularity,
    limit,
  );

  return withFinanceCache(key, financeCacheTtl(period.key), async () => {
    let rows = await loadRowsForPeriod(ctx, period);
    if (input.category) {
      rows = rows.filter((row) => rowMatchesCategory(row, input.category!));
    }
    return buildBreakdown(rows, period, granularity, limit);
  });
}

export async function getFinanceTransactions(
  ctx: FinanceContext,
  input: FinancePeriodInput & {
    category?: string;
    categories?: string[];
    transactionTypes?: string[];
    limit?: number;
  } = {},
): Promise<FinanceTransactionsResult> {
  const period = resolveFinancePeriod(input, ctx);
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 30);
  const transactionTypes = uniqueList(input.transactionTypes ?? ["expense"]);
  const categories = uniqueList([...(input.categories ?? []), input.category]);
  const categoryKey = categories.length > 0 ? [...categories].sort().join("+") : "all";
  const key = financeCacheKey(
    ctx.userId,
    ctx.userType,
    "transactions",
    period.key,
    categoryKey,
    transactionTypes.join("+"),
    limit,
  );

  return withFinanceCache(key, Math.min(financeCacheTtl(period.key), 5 * 60), async () => {
    let rows = await loadRowsForPeriod(ctx, period);
    if (transactionTypes.length > 0) {
      rows = rows.filter((row) => transactionTypes.includes(row.type));
    }
    if (categories.length > 0) {
      rows = rows.filter((row) => rowMatchesAnyCategory(row, categories));
    }

    const transactions: FinanceTransactionFact[] = rows.slice(0, limit).map((row) => ({
      id: row.id,
      type: row.type,
      amount: numeric(row.amount),
      category: canonicalCategoryForRow(row.category, row.subCategory, row.description, row.rawText, row.placeHint),
      subCategory: row.subCategory,
      description: row.description,
      paymentMethod: row.paymentMethod,
      placeHint: row.placeHint,
      date: dateString(row.date),
    }));

    return {
      period,
      totalMatched: rows.length,
      returned: transactions.length,
      transactions,
    };
  });
}

async function loadGoals(ctx: FinanceContext): Promise<GoalRow[]> {
  return db
    .select()
    .from(financialGoals)
    .where(
      and(
        eq(financialGoals.userId, ctx.userId),
        eq(financialGoals.userType, ctx.userType),
        eq(financialGoals.status, "active"),
      ),
    )
    .orderBy(desc(financialGoals.createdAt))
    .limit(10);
}

export async function getGoalProgress(ctx: FinanceContext): Promise<FinanceGoalProgress> {
  const key = financeCacheKey(ctx.userId, ctx.userType, "goals_active");

  return withFinanceCache(key, 5 * 60, async () => {
    const [goals, summary] = await Promise.all([
      loadGoals(ctx),
      getFinanceSummary(ctx, { period: "current_month" }),
    ]);
    const capacity = Math.max(0, summary.netFlow);

    return {
      goals: goals.map((goal) => {
        const targetAmount = numeric(goal.targetAmount);
        return {
          id: goal.id,
          title: goal.title,
          status: goal.status,
          targetAmount,
          targetDate: goal.targetDate ? dateString(goal.targetDate) : null,
          estimatedMonthlyCapacity: capacity,
          estimatedMonthsNeeded: capacity > 0 && targetAmount > 0 ? Math.ceil(targetAmount / capacity) : null,
        };
      }),
    };
  });
}

export async function getChartData(
  ctx: FinanceContext,
  input: FinancePeriodInput & {
    category?: string;
    categories?: string[];
    granularity?: FinanceGranularity;
    limit?: number;
  } = {},
): Promise<FinanceChartData> {
  const period = resolveFinancePeriod(input, ctx);
  const granularity = input.granularity ?? "category";
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 60);
  const categories = uniqueList([...(input.categories ?? []), input.category]);
  const categoryKey = categories.length > 0 ? [...categories].sort().join("+") : "all";
  const key = financeCacheKey(ctx.userId, ctx.userType, "chart_data", period.key, categoryKey, granularity, limit);

  return withFinanceCache(key, financeCacheTtl(period.key), async () => {
    let rows = await loadRowsForPeriod(ctx, period);
    if (categories.length > 1) {
      return buildMultiCategoryChartData(rows, period, categories, granularity, limit);
    }
    if (categories[0]) {
      rows = rows.filter((row) => rowMatchesCategory(row, categories[0]));
    }
    return buildChartData(rows, period, granularity, limit);
  });
}

export async function getProfileSnapshot(ctx: FinanceContext): Promise<FinanceProfileSnapshot> {
  const key = financeCacheKey(ctx.userId, ctx.userType, "profile_snapshot");

  return withFinanceCache(key, 5 * 60, async () => {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, ctx.userId), eq(userProfiles.userType, ctx.userType)))
      .limit(1);

    const financialInfo = jsonRecord(profile?.financialInfo);
    const salaryDay = numeric(financialInfo.salaryDay, ctx.salaryDay ?? 1);

    return {
      monthlyIncome: profile?.monthlyIncome == null ? null : numeric(profile.monthlyIncome),
      financialGoal: profile?.financialGoal ?? null,
      financialPersonality: profile?.financialPersonality ?? null,
      salaryDay: Math.max(1, Math.min(31, Math.floor(salaryDay || 1))),
    };
  });
}

function summaryFacts(need: DataNeed, summary: FinanceSummary): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "period", summary.period.label),
    makeFact(need.id, need.kind, "total_income", summary.totalIncome),
    makeFact(need.id, need.kind, "total_expense", summary.totalExpense),
    makeFact(need.id, need.kind, "net_flow", summary.netFlow),
    makeFact(need.id, need.kind, "transaction_count", summary.transactionCount),
    makeFact(need.id, need.kind, "expense_count", summary.expenseCount),
    makeFact(need.id, need.kind, "income_count", summary.incomeCount),
    makeFact(need.id, need.kind, "daily_average_expense", summary.dailyAverageExpense),
  ];
}

function comparisonFacts(need: DataNeed, comparison: FinancePeriodComparison): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "current_period", comparison.current.period.label),
    makeFact(need.id, need.kind, "previous_period", comparison.previous.period.label),
    makeFact(need.id, need.kind, "current_total_income", comparison.current.totalIncome),
    makeFact(need.id, need.kind, "previous_total_income", comparison.previous.totalIncome),
    makeFact(need.id, need.kind, "current_total_expense", comparison.current.totalExpense),
    makeFact(need.id, need.kind, "previous_total_expense", comparison.previous.totalExpense),
    makeFact(need.id, need.kind, "expense_difference", comparison.expenseDifference),
    makeFact(need.id, need.kind, "expense_change_percent", comparison.expenseChangePercent),
    makeFact(need.id, need.kind, "current_net_flow", comparison.current.netFlow),
    makeFact(need.id, need.kind, "previous_net_flow", comparison.previous.netFlow),
    makeFact(need.id, need.kind, "net_flow_difference", comparison.netFlowDifference),
    makeFact(need.id, need.kind, "current_transaction_count", comparison.current.transactionCount),
    makeFact(need.id, need.kind, "previous_transaction_count", comparison.previous.transactionCount),
  ];
}

function categoryFacts(need: DataNeed, category: FinanceCategoryTotal): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "category", category.category),
    makeFact(need.id, need.kind, "period", category.period.label),
    makeFact(need.id, need.kind, "category_total_expense", category.totalExpense),
    makeFact(need.id, need.kind, "category_total_income", category.totalIncome),
    makeFact(need.id, need.kind, "transaction_count", category.transactionCount),
  ];
}

function personTotalFacts(need: DataNeed, total: FinancePersonTotal | null): ResolvedFact[] {
  if (!total) return [];
  return [
    makeFact(need.id, need.kind, "person_name", total.name),
    makeFact(need.id, need.kind, "person_relation", total.relation ?? null),
    makeFact(need.id, need.kind, "period", total.period.label),
    makeFact(need.id, need.kind, "person_total_expense", total.totalExpense),
    makeFact(need.id, need.kind, "transaction_count", total.transactionCount),
  ];
}

function breakdownFacts(need: DataNeed, breakdown: FinanceBreakdown): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "period", breakdown.period.label),
    makeFact(need.id, need.kind, "granularity", breakdown.granularity),
    makeFact(need.id, need.kind, "total_expense", breakdown.totalExpense),
    ...breakdown.items.slice(0, 8).map((item, index) =>
      makeFact(
        need.id,
        need.kind,
        `top_${index + 1}_${item.name}`,
        item.amount,
        1,
        [{ id: item.name, label: item.name, value: item.count }],
      ),
    ),
  ];
}

function transactionFacts(need: DataNeed, result: FinanceTransactionsResult): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "period", result.period.label),
    makeFact(need.id, need.kind, "total_matched", result.totalMatched),
    makeFact(need.id, need.kind, "returned", result.returned),
    ...result.transactions.slice(0, 12).map((row, index) =>
      makeFact(
        need.id,
        need.kind,
        `transaction_${index + 1}`,
        `${row.date} ${row.category} ${row.amount}`,
        1,
        [{ id: row.id, label: row.description || row.category, value: row.amount }],
      ),
    ),
  ];
}

function walletFacts(need: DataNeed, summary: FinanceWalletSummary): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "wallet_count", summary.walletCount),
    makeFact(need.id, need.kind, "total_balance", summary.totalBalance),
    ...summary.wallets.slice(0, 8).map((wallet, index) =>
      makeFact(
        need.id,
        need.kind,
        `wallet_${index + 1}`,
        `${wallet.name} (${wallet.provider}) balance=${wallet.balance}`,
        1,
        [
          {
            id: wallet.id,
            label: wallet.lastFourDigits ? `${wallet.name} ending ${wallet.lastFourDigits}` : wallet.name,
            value: wallet.balance,
          },
        ],
      ),
    ),
  ];
}

function goalFacts(need: DataNeed, result: FinanceGoalProgress): ResolvedFact[] {
  const facts: ResolvedFact[] = [makeFact(need.id, need.kind, "active_goal_count", result.goals.length)];

  for (const [index, goal] of result.goals.slice(0, 8).entries()) {
    const key = `goal_${index + 1}`;
    facts.push(
      makeFact(
        need.id,
        need.kind,
        key,
        `${goal.title}: target=${goal.targetAmount}; months_needed=${goal.estimatedMonthsNeeded ?? "unknown"}`,
        0.9,
        [{ id: goal.id, label: goal.title, value: goal.targetAmount }],
      ),
      makeFact(need.id, need.kind, `${key}_title`, goal.title, 1, [
        { id: goal.id, label: "goal_id", value: goal.id },
      ]),
      makeFact(need.id, need.kind, `${key}_target_amount`, goal.targetAmount),
      makeFact(need.id, need.kind, `${key}_target_date`, goal.targetDate ?? null),
      makeFact(need.id, need.kind, `${key}_estimated_monthly_capacity`, goal.estimatedMonthlyCapacity),
      makeFact(need.id, need.kind, `${key}_estimated_months_needed`, goal.estimatedMonthsNeeded ?? null),
      makeFact(need.id, need.kind, `${key}_tracked_saved_amount`, null, 0.6),
    );
  }

  return facts;
}

function normalizeLookupText(text: string): string {
  return text.toLowerCase().replace(/[\u0600-\u06FF]/g, (c) => c === "أ" || c === "إ" || c === "آ" ? "ا" : c === "ة" ? "ه" : c);
}

function transactionLookupTokens(query: string): string[] {
  return normalizeLookupText(query).split(/\s+/).filter(Boolean);
}

function profileFacts(need: DataNeed, profile: FinanceProfileSnapshot): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "monthly_income", profile.monthlyIncome),
    makeFact(need.id, need.kind, "financial_goal", profile.financialGoal),
    makeFact(need.id, need.kind, "financial_personality", profile.financialPersonality),
    makeFact(need.id, need.kind, "salary_day", profile.salaryDay),
  ];
}

export async function getComparisonDrivers(
  ctx: FinanceContext,
  input: FinancePeriodInput = {},
): Promise<FinanceComparisonDriver[]> {
  const [currentBreakdownCat, previousBreakdownCat, currentBreakdownMerchant, previousBreakdownMerchant] = await Promise.all([
    getFinanceBreakdown(ctx, { period: input.period ?? "current_month", granularity: "category", limit: 10 }),
    getFinanceBreakdown(ctx, { period: input.comparePeriod ?? "previous_month", granularity: "category", limit: 10 }),
    getFinanceBreakdown(ctx, { period: input.period ?? "current_month", granularity: "merchant", limit: 10 }),
    getFinanceBreakdown(ctx, { period: input.comparePeriod ?? "previous_month", granularity: "merchant", limit: 10 }),
  ]);

  const previousByCategory = new Map<string, number>();
  for (const item of previousBreakdownCat.items) {
    previousByCategory.set(item.name, item.amount);
  }
  for (const item of previousBreakdownMerchant.items) {
    previousByCategory.set(item.name, item.amount);
  }

  const drivers: FinanceComparisonDriver[] = [];
  const addDrivers = (items: typeof currentBreakdownCat.items, type: "category" | "merchant") => {
    for (const item of items) {
      const prevAmount = previousByCategory.get(item.name) ?? 0;
      drivers.push({
        category: item.name,
        type,
        currentAmount: item.amount,
        previousAmount: prevAmount,
        difference: item.amount - prevAmount,
        changePercent: prevAmount > 0 ? ((item.amount - prevAmount) / prevAmount) * 100 : null,
        direction: item.amount > prevAmount ? "up" : item.amount < prevAmount ? "down" : "stable",
      });
    }
  };

  addDrivers(currentBreakdownCat.items, "category");
  addDrivers(currentBreakdownMerchant.items, "merchant");

  return drivers
    .filter((driver) => Math.abs(driver.difference) >= 1)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 8);
}

function comparisonDriverFacts(need: DataNeed, drivers: FinanceComparisonDriver[]): ResolvedFact[] {
  const facts: ResolvedFact[] = [];
  for (const [index, driver] of drivers.slice(0, 8).entries()) {
    const key = `driver_${index + 1}_${driver.type === "merchant" ? "merchant_" : ""}${driver.category.replace(/\s+/g, "_")}`;
    facts.push(
      makeFact(
        need.id,
        need.kind,
        key,
        driver.currentAmount,
        0.9,
        [
          { id: `prev_${driver.category}`, label: `${driver.category}_previous`, value: driver.previousAmount },
          { id: `diff_${driver.category}`, label: `${driver.category}_difference`, value: driver.difference },
        ],
      ),
      makeFact(need.id, need.kind, `${key}_category`, driver.category),
      makeFact(need.id, need.kind, `${key}_category_display`, displayFinanceCategory(driver.category)),
      makeFact(need.id, need.kind, `${key}_previous_amount`, driver.previousAmount),
      makeFact(need.id, need.kind, `${key}_difference`, driver.difference),
      makeFact(need.id, need.kind, `${key}_direction`, driver.direction),
    );
  }
  return facts;
}

export async function getBusinessCashflow(
  ctx: FinanceContext,
  input: FinancePeriodInput = {},
): Promise<FinanceBusinessCashflow> {
  const summary = await getFinanceSummary(ctx, { period: input.period ?? "current_month" });

  const incomeCategories: Array<{ category: string; amount: number }> = [];
  const expenseCategories: Array<{ category: string; amount: number }> = [];

  const allRows = await loadRowsForPeriod(ctx, summary.period);
  const incomeByCategory = new Map<string, number>();
  const expenseByCategory = new Map<string, number>();
  for (const row of allRows) {
    const amount = amountOf(row);
    const cat = canonicalCategoryForRow(row.category, row.subCategory, row.description, row.rawText, row.placeHint);
    if (row.type === "income") {
      incomeByCategory.set(cat, (incomeByCategory.get(cat) ?? 0) + amount);
    } else {
      expenseByCategory.set(cat, (expenseByCategory.get(cat) ?? 0) + amount);
    }
  }

  for (const [category, amount] of [...incomeByCategory].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    incomeCategories.push({ category, amount });
  }
  for (const [category, amount] of [...expenseByCategory].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    expenseCategories.push({ category, amount });
  }

  const projectedMonthEnd = summary.dailyAverageExpense * summary.period.daysTotal;
  const remainingDays = summary.period.daysTotal - summary.period.daysElapsed;
  const suggestedWeeklyPlan: string[] = [
    remainingDays > 0
      ? `معاك ${Math.max(0, summary.netFlow - (projectedMonthEnd - summary.totalExpense)).toLocaleString("ar-EG")} جنيه متبقي تقديري لتغطية ${remainingDays} يوم.`
      : "الشهر في آخره. راجع المصاريف والتزم بالصافي الحالي.",
    expenseCategories.length > 0
      ? `أكبر بند: ${expenseCategories[0].category} (${expenseCategories[0].amount.toLocaleString("ar-EG")} جنيه).`
      : "",
    `الدخل: ${summary.totalIncome.toLocaleString("ar-EG")} جنيه.`,
    summary.netFlow > 0
      ? `الصافي إيجابي (+${summary.netFlow.toLocaleString("ar-EG")} جنيه).`
      : `الصافي سلبي (${summary.netFlow.toLocaleString("ar-EG")} جنيه). راجع وقلل.`,
  ].filter(Boolean);

  return {
    period: summary.period.label,
    totalIncome: summary.totalIncome,
    totalExpense: summary.totalExpense,
    netFlow: summary.netFlow,
    topExpenseCategories: expenseCategories,
    topIncomeCategories: incomeCategories,
    dailyAverageExpense: summary.dailyAverageExpense,
    projectedMonthEnd,
    suggestedWeeklyPlan,
  };
}

function businessCashflowFacts(need: DataNeed, cashflow: FinanceBusinessCashflow): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "period", cashflow.period),
    makeFact(need.id, need.kind, "total_income", cashflow.totalIncome),
    makeFact(need.id, need.kind, "total_expense", cashflow.totalExpense),
    makeFact(need.id, need.kind, "net_flow", cashflow.netFlow),
    makeFact(need.id, need.kind, "daily_average_expense", cashflow.dailyAverageExpense),
    makeFact(need.id, need.kind, "projected_month_end", cashflow.projectedMonthEnd),
    ...cashflow.suggestedWeeklyPlan.slice(0, 4).map((plan, index) =>
      makeFact(need.id, need.kind, `weekly_plan_${index + 1}`, plan),
    ),
    ...cashflow.topExpenseCategories.slice(0, 5).map((item, index) =>
      makeFact(need.id, need.kind, `top_expense_${index + 1}_${item.category}`, item.amount),
    ),
    ...cashflow.topIncomeCategories.slice(0, 3).map((item, index) =>
      makeFact(need.id, need.kind, `top_income_${index + 1}_${item.category}`, item.amount),
    ),
  ];
}

export async function getCategoryInclusion(
  ctx: FinanceContext,
  category: string,
  input: FinancePeriodInput = {},
): Promise<FinanceCategoryInclusion> {
  const period = resolveFinancePeriod(input, ctx);
  const rows = await loadRowsForPeriod(ctx, period);
  const matched = rows.filter((row) => rowMatchesCategory(row, category));
  const aliases = getCategoryAliases(category);
  const merchants = new Set<string>();

  for (const row of matched) {
    const desc = String(row.description ?? row.rawText ?? "");
    if (desc) merchants.add(desc.slice(0, 40));
  }

  return {
    category,
    merchants: [...merchants].slice(0, 10),
    sampleTransactions: matched.slice(0, 5).map((row) => ({
      description: String(row.description ?? row.rawText ?? row.category ?? ""),
      amount: amountOf(row),
      date: dateString(row.date),
    })),
    ruleExplanation: `كل العمليات اللي فيها: ${aliases.slice(0, 8).join("، ")} بتتصنف تحت ${displayFinanceCategory(category)}.`,
    totalMatched: matched.length,
  };
}

function categoryInclusionFacts(need: DataNeed, inclusion: FinanceCategoryInclusion): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "category", inclusion.category),
    makeFact(need.id, need.kind, "category_display", displayFinanceCategory(inclusion.category)),
    makeFact(need.id, need.kind, "total_matched", inclusion.totalMatched),
    makeFact(need.id, need.kind, "rule_explanation", inclusion.ruleExplanation),
    makeFact(need.id, need.kind, "merchants", inclusion.merchants.join("، ")),
    ...inclusion.sampleTransactions.slice(0, 4).map((row, index) =>
      makeFact(
        need.id,
        need.kind,
        `transaction_${index + 1}`,
        `${row.date} ${row.description} ${row.amount}`,
        1,
        [{ id: index + 1, label: row.description, value: row.amount }],
      ),
    ),
  ];
}

export async function getGoalFeasibility(
  ctx: FinanceContext,
  input: FinancePeriodInput & { targetAmount?: number } = {},
): Promise<FinanceGoalFeasibility> {
  const [summary, breakdown, goals] = await Promise.all([
    getFinanceSummary(ctx, { period: input.period ?? "current_month" }),
    getFinanceBreakdown(ctx, { period: input.period ?? "current_month", granularity: "category", limit: 8 }),
    getGoalProgress(ctx),
  ]);

  const capacity = Math.max(0, summary.netFlow);
  const activeGoal = goals.goals[0];
  const targetAmount = input.targetAmount ?? activeGoal?.targetAmount ?? 0;
  const estimatedMonths = capacity > 0 && targetAmount > 0 ? Math.ceil(targetAmount / capacity) : null;

  const levers = breakdown.items.slice(0, 4).map((item) => ({
    category: item.name,
    amount: item.amount,
    potentialSavings: Math.round(item.amount * 0.15),
  }));

  let feasibilityRating: FinanceGoalFeasibility["feasibilityRating"] = "moderate";
  if (estimatedMonths && estimatedMonths <= 6) feasibilityRating = "easy";
  if (estimatedMonths && estimatedMonths >= 18) feasibilityRating = "challenging";

  return {
    monthlyCapacity: capacity,
    targetAmount,
    estimatedMonths,
    topExpenseLevers: levers,
    feasibilityRating,
  };
}

function goalFeasibilityFacts(need: DataNeed, feasibility: FinanceGoalFeasibility): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "monthly_capacity", feasibility.monthlyCapacity),
    makeFact(need.id, need.kind, "target_amount", feasibility.targetAmount),
    makeFact(need.id, need.kind, "estimated_months", feasibility.estimatedMonths ?? null),
    makeFact(need.id, need.kind, "feasibility_rating", feasibility.feasibilityRating),
    ...feasibility.topExpenseLevers.slice(0, 4).map((lever, index) =>
      makeFact(need.id, need.kind, `lever_${index + 1}_${lever.category}`, lever.potentialSavings, 0.8, [
        { id: lever.category, label: `${lever.category}_current`, value: lever.amount },
      ]),
    ),
  ];
}

export async function getTransactionLookup(
  ctx: FinanceContext,
  query: string,
  category?: string,
  transactionTypes?: string[],
  input: FinancePeriodInput = {},
): Promise<FinanceTransactionFact | null> {
  const rows = await loadRowsForPeriod(ctx, resolveFinancePeriod(input, ctx));
  const allowedTypes = new Set((transactionTypes ?? []).filter(Boolean));
  const tokens = transactionLookupTokens(query);
  const normalizedQuery = normalizeLookupText(String(query ?? ""));
  const candidates = rows.filter((row) => {
    if (allowedTypes.size > 0 && !allowedTypes.has(String(row.type))) return false;
    if (category && !rowMatchesCategory(row, category)) return false;
    return true;
  });

  const scored = candidates
    .map((row, index) => {
      const haystack = normalizeLookupText(
        [
          row.description,
          row.rawText,
          row.category,
          row.subCategory,
          row.placeHint,
        ]
          .filter(Boolean)
          .join(" "),
      );
      const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
      const phraseScore = normalizedQuery && haystack.includes(normalizedQuery) ? 3 : 0;
      return { row, index, score: tokenScore + phraseScore };
    })
    .filter((item) => tokens.length === 0 || item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const latest = scored[0]?.row ?? (tokens.length === 0 ? candidates[0] : undefined);
  if (latest) {
    return {
      id: latest.id,
      type: latest.type,
      amount: amountOf(latest),
      category: latest.category ?? "uncategorized",
      subCategory: latest.subCategory,
      description: latest.description,
      placeHint: latest.placeHint,
      date: dateString(latest.date),
    };
  }

  return null;
}

/**
 * Looks up the saved transaction first, then its immutable classification log.
 * The log may be absent for legacy rows; callers receive that fact explicitly
 * instead of a fabricated explanation.
 */
export async function getClassificationTrace(
  ctx: FinanceContext,
  query: string,
  input: FinancePeriodInput = {},
): Promise<FinanceClassificationTrace | null> {
  const transaction = await getTransactionLookup(ctx, query, undefined, ["expense"], input);
  if (!transaction) return null;

  const [expense] = await db
    .select({ classificationLogId: expenses.classificationLogId })
    .from(expenses)
    .where(and(
      eq(expenses.id, transaction.id),
      eq(expenses.userId, ctx.userId),
      eq(expenses.userType, ctx.userType),
    ))
    .limit(1);

  if (!expense?.classificationLogId) return { transaction, classificationLogId: null };

  const [log] = await db
    .select({
      id: classificationLogs.id,
      parsedBy: classificationLogs.parsedBy,
      decision: classificationLogs.decision,
      confidence: classificationLogs.confidence,
      modelUsed: classificationLogs.modelUsed,
    })
    .from(classificationLogs)
    .where(and(
      eq(classificationLogs.id, expense.classificationLogId),
      eq(classificationLogs.userId, ctx.userId),
      eq(classificationLogs.userType, ctx.userType),
    ))
    .limit(1);

  return {
    transaction,
    classificationLogId: expense.classificationLogId,
    parsedBy: log?.parsedBy ?? null,
    decision: log?.decision ?? null,
    confidence: log?.confidence == null ? null : numeric(log.confidence),
    modelUsed: log?.modelUsed ?? null,
  };
}

function transactionLookupFacts(need: DataNeed, transaction: FinanceTransactionFact): ResolvedFact[] {
  const facts: ResolvedFact[] = [
    makeFact(need.id, need.kind, "expense_id", transaction.id),
    makeFact(need.id, need.kind, "amount", transaction.amount),
    makeFact(need.id, need.kind, "category", transaction.category),
    makeFact(need.id, need.kind, "sub_category", transaction.subCategory ?? "عام"),
    makeFact(need.id, need.kind, "description", transaction.description ?? ""),
    makeFact(need.id, need.kind, "date", transaction.date),
  ];
  if (need.scope?.targetCategory) {
    facts.push(makeFact(need.id, need.kind, "target_category", need.scope.targetCategory));
  }
  if (need.scope?.sourceCategory) {
    facts.push(makeFact(need.id, need.kind, "source_category", need.scope.sourceCategory));
  }
  if (need.scope?.query) {
    facts.push(makeFact(need.id, need.kind, "lookup_query", need.scope.query));
  }
  return facts;
}

function classificationTraceFacts(
  need: DataNeed,
  trace: FinanceClassificationTrace | null,
): ResolvedFact[] {
  if (!trace) return [];
  return [
    makeFact(need.id, need.kind, "expense_id", trace.transaction.id),
    makeFact(need.id, need.kind, "description", trace.transaction.description ?? trace.transaction.subCategory ?? "عملية"),
    makeFact(need.id, need.kind, "stored_category", trace.transaction.category),
    makeFact(need.id, need.kind, "date", trace.transaction.date),
    makeFact(need.id, need.kind, "trace_available", Boolean(trace.parsedBy)),
    makeFact(need.id, need.kind, "parsed_by", trace.parsedBy ?? null),
    makeFact(need.id, need.kind, "decision", trace.decision ?? null),
    makeFact(need.id, need.kind, "confidence", trace.confidence ?? null),
  ];
}

export async function resolveKernelDataNeeds(
  ctx: FinanceContext,
  dataNeeds: DataNeed[],
): Promise<FinanceResolverResult> {
  const facts: ResolvedFact[] = [];
  const artifacts: Artifact[] = [];
  const errors: string[] = [];
  let profileSnapshot: FinanceProfileSnapshot | undefined;

  const needsFinancialPeriod = dataNeeds.some((need) =>
    need.kind.startsWith("finance.") || need.kind === "chart.data" || need.kind === "goals.active",
  );
  if (needsFinancialPeriod && !ctx.salaryDay) {
    try {
      profileSnapshot = await getProfileSnapshot(ctx);
      ctx.salaryDay = profileSnapshot.salaryDay;
    } catch (error) {
      errors.push(`profile_snapshot_prefetch:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const financeCacheTrace = await collectFinanceCacheTrace(async () => {
    for (const need of dataNeeds) {
      try {
        if (need.kind === "none") continue;

        if (need.kind === "finance.summary") {
          facts.push(...summaryFacts(need, await getFinanceSummary(ctx, resolveInputFromNeed(need))));
        } else if (need.kind === "finance.period_comparison") {
          facts.push(...comparisonFacts(need, await getFinancePeriodComparison(ctx, resolveInputFromNeed(need))));
        } else if (need.kind === "finance.category_total") {
          facts.push(
            ...categoryFacts(
              need,
              await getCategoryTotal(ctx, need.scope?.category ?? "uncategorized", resolveInputFromNeed(need)),
            ),
          );
        } else if (need.kind === "finance.person_total") {
          facts.push(
            ...personTotalFacts(
              need,
              await getPersonTotal(
                ctx,
                need.scope?.personQuery ?? need.scope?.query ?? "",
                resolveInputFromNeed(need),
              ),
            ),
          );
        } else if (need.kind === "finance.classification_trace") {
          facts.push(
            ...classificationTraceFacts(
              need,
              await getClassificationTrace(
                ctx,
                need.scope?.query ?? "",
                resolveInputFromNeed(need),
              ),
            ),
          );
        } else if (need.kind === "finance.breakdown") {
          facts.push(
            ...breakdownFacts(
              need,
              await getFinanceBreakdown(ctx, {
                ...resolveInputFromNeed(need),
                category: need.scope?.category,
                granularity: need.scope?.granularity as FinanceGranularity | undefined,
                limit: need.scope?.limit,
              }),
            ),
          );
        } else if (need.kind === "finance.transactions") {
          facts.push(
            ...transactionFacts(
              need,
              await getFinanceTransactions(ctx, {
                ...resolveInputFromNeed(need),
                category: need.scope?.category,
                categories: need.scope?.categories,
                transactionTypes: need.scope?.transactionTypes,
                limit: need.scope?.limit ?? need.maxRows,
              }),
            ),
          );
        } else if (need.kind === "finance.comparison_drivers") {
          facts.push(
            ...comparisonDriverFacts(need, await getComparisonDrivers(ctx, resolveInputFromNeed(need))),
          );
        } else if (need.kind === "finance.business_cashflow") {
          facts.push(
            ...businessCashflowFacts(need, await getBusinessCashflow(ctx, resolveInputFromNeed(need))),
          );
        } else if (need.kind === "finance.category_inclusion") {
          facts.push(
            ...categoryInclusionFacts(
              need,
              await getCategoryInclusion(ctx, need.scope?.category ?? "food", resolveInputFromNeed(need)),
            ),
          );
        } else if (need.kind === "goal.feasibility") {
          facts.push(...goalFeasibilityFacts(need, await getGoalFeasibility(ctx, {
            ...resolveInputFromNeed(need),
            targetAmount: typeof need.scope?.targetAmount === "number" ? need.scope.targetAmount : undefined
          })));
        } else if (need.kind === "finance.transaction_lookup") {
          const transaction = await getTransactionLookup(
            ctx,
            need.scope?.query ?? "",
            need.scope?.category,
            need.scope?.transactionTypes,
            resolveInputFromNeed(need),
          );
          if (transaction) {
            facts.push(...transactionLookupFacts(need, transaction));
          } else {
            facts.push(makeFact(need.id, need.kind, "not_found", true));
          }
        } else if (need.kind === "finance.goal_progress" || need.kind === "goals.active") {
          facts.push(...goalFacts(need, await getGoalProgress(ctx)));
        } else if (need.kind === "profile.snapshot") {
          const profile = profileSnapshot ?? (await getProfileSnapshot(ctx));
          ctx.salaryDay = profile.salaryDay;
          facts.push(...profileFacts(need, profile));
        } else if (need.kind === "wallet.summary") {
          facts.push(...walletFacts(need, await getWalletSummary(ctx)));
        } else if (need.kind === "chart.data") {
          const chart = await getChartData(ctx, {
            ...resolveInputFromNeed(need),
            category: need.scope?.category,
            categories: need.scope?.categories,
            granularity: need.scope?.granularity as FinanceGranularity | undefined,
            limit: need.scope?.limit,
          });
          artifacts.push(createFinanceChartArtifact(need, chart));
        }
      } catch (error) {
        errors.push(`${need.id}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  return { facts, artifacts, errors, cacheHits: financeCacheTrace.cacheHits };
}
