import type { InferSelectModel } from "drizzle-orm";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { financialGoals, expenses, userProfiles, userWallets } from "../../../db/schema";
import { db } from "../../queries/connection";
import type { Artifact, DataNeed, DataNeedKind, ResolvedFact } from "../ai-kernel/types";
import { collectFinanceCacheTrace, financeCacheKey, financeCacheTtl, withFinanceCache } from "./cache";
import { canonicalCategoryForRow, getCategoryAliases } from "./category-matcher";
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
  FinanceContext,
  FinanceGranularity,
  FinanceGoalProgress,
  FinancePeriodComparison,
  FinancePeriodInput,
  FinanceProfileSnapshot,
  FinanceResolverResult,
  FinanceSummary,
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
    startDate: need.scope?.startDate,
    endDate: need.scope?.endDate,
  };
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
    startDate: input.startDate,
    endDate: input.endDate,
  };
  const key = financeCacheKey(
    ctx.userId,
    ctx.userType,
    "period_comparison",
    currentInput.period ?? "current_month",
    input.startDate ? String(input.startDate) : "",
    input.endDate ? String(input.endDate) : "",
  );

  return withFinanceCache(key, financeCacheTtl(currentInput.period ?? "current_month"), async () => {
    const [current, previous] = await Promise.all([
      getFinanceSummary(ctx, currentInput),
      getFinanceSummary(ctx, { period: "previous_month" }),
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

function profileFacts(need: DataNeed, profile: FinanceProfileSnapshot): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "monthly_income", profile.monthlyIncome),
    makeFact(need.id, need.kind, "financial_goal", profile.financialGoal),
    makeFact(need.id, need.kind, "financial_personality", profile.financialPersonality),
    makeFact(need.id, need.kind, "salary_day", profile.salaryDay),
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

  return {
    facts,
    artifacts,
    errors,
    cacheHits: financeCacheTrace.cacheHits,
  };
}
