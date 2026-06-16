import { and, eq } from "drizzle-orm";
import { monthlyBehaviorSnapshots } from "../../../db/schema";
import { db } from "../../queries/connection";
import type { Artifact, DataNeed, ResolvedFact } from "../ai-kernel/types";
import { financeCacheKey, withFinanceCache } from "./cache";
import {
  getChartData,
  getFinanceBreakdown,
  getFinanceSummary,
  getGoalProgress,
} from "./resolvers";
import type { FinanceContext } from "./types";
import { createFinanceChartArtifact } from "./chart-artifacts";

export interface MonthlyReportFactsPack {
  month: string;
  source: "snapshot" | "semantic_live";
  facts: ResolvedFact[];
  artifacts: Artifact[];
  factsBlock: string;
  cacheKey: string;
}

export interface MonthlyReportFactsPackOptions {
  forceLive?: boolean;
  preferSnapshot?: boolean;
  skipCache?: boolean;
}

function fact(
  label: string,
  value: string | number | boolean | null,
  source: ResolvedFact["source"] = "finance.summary",
): ResolvedFact {
  return {
    id: `monthly_report:${label}`,
    dataNeedId: "monthly_report",
    label,
    value,
    source,
    confidence: 1,
  };
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function moneyValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function compactJson(value: unknown, max = 8): string {
  if (!Array.isArray(value)) return "";
  return value
    .slice(0, max)
    .map((item) => {
      if (!item || typeof item !== "object") return String(item);
      const row = item as Record<string, unknown>;
      const name = row.name ?? row.category ?? row.label ?? "item";
      const amount = row.amount ?? row.value ?? "";
      return `${name}:${amount}`;
    })
    .join(" | ");
}

function factsBlockFromFacts(month: string, facts: ResolvedFact[], source: MonthlyReportFactsPack["source"]): string {
  return [
    `SEMANTIC_REPORT_FACTS month=${month} source=${source}`,
    ...facts.map((item) => `${item.label}: ${item.value ?? "unknown"}`),
  ].join("\n");
}

async function buildFromSnapshot(
  ctx: FinanceContext,
  month: string,
): Promise<MonthlyReportFactsPack | null> {
  const [snapshot] = await db
    .select()
    .from(monthlyBehaviorSnapshots)
    .where(
      and(
        eq(monthlyBehaviorSnapshots.userId, ctx.userId),
        eq(monthlyBehaviorSnapshots.userType, ctx.userType),
        eq(monthlyBehaviorSnapshots.month, month),
      ),
    )
    .limit(1);

  if (!snapshot) return null;

  const facts = [
    fact("total_income", numberValue(snapshot.totalIncome)),
    fact("total_expense", numberValue(snapshot.totalExpense)),
    fact("net_flow", numberValue(snapshot.netFlow)),
    fact("top_categories", compactJson(snapshot.topCategories), "finance.breakdown"),
    fact("top_sub_categories", compactJson(snapshot.topSubCategories), "finance.breakdown"),
    fact("behavior_flags", compactJson(snapshot.behaviorFlags), "manual"),
  ];

  return {
    month,
    source: "snapshot",
    facts,
    artifacts: [],
    factsBlock: factsBlockFromFacts(month, facts, "snapshot"),
    cacheKey: financeCacheKey(ctx.userId, ctx.userType, "monthly_report_facts", month, "snapshot"),
  };
}

export async function buildMonthlyReportFactsPack(
  ctx: FinanceContext,
  month: string,
  options: MonthlyReportFactsPackOptions = {},
): Promise<MonthlyReportFactsPack> {
  const key = financeCacheKey(ctx.userId, ctx.userType, "monthly_report_facts", month, "live_v2");

  const compute = async (): Promise<MonthlyReportFactsPack> => {
    if (options.preferSnapshot && !options.forceLive) {
      const snapshot = await buildFromSnapshot(ctx, month);
      if (snapshot) return snapshot;
    }

    const [summary, breakdown, goals, chart] = await Promise.all([
      getFinanceSummary(ctx, { period: "current_month", month }),
      getFinanceBreakdown(ctx, { period: "current_month", month, granularity: "category", limit: 8 }),
      getGoalProgress(ctx),
      getChartData(ctx, { period: "current_month", month, granularity: "category", limit: 8 }),
    ]);

    const facts = [
      fact("period", summary.period.label),
      fact("total_income", moneyValue(summary.totalIncome)),
      fact("total_expense", moneyValue(summary.totalExpense)),
      fact("net_flow", moneyValue(summary.netFlow)),
      fact("transaction_count", summary.transactionCount),
      fact("daily_average_expense", moneyValue(summary.dailyAverageExpense)),
      fact(
        "top_categories",
        breakdown.items
          .slice(0, 8)
          .map((item) => `${item.name}:${moneyValue(item.amount)} (${item.percent}%)`)
          .join(" | "),
        "finance.breakdown",
      ),
      fact(
        "active_goals",
        goals.goals
          .slice(0, 5)
          .map((goal) => `${goal.title}:${moneyValue(goal.targetAmount)}`)
          .join(" | "),
        "goals.active",
      ),
    ];
    const chartNeed: DataNeed = {
      id: "monthly_report_chart",
      kind: "chart.data",
      priority: "normal",
      reason: "monthly_report_visual_summary",
      scope: { period: "current_month", granularity: "category", limit: 8 },
    };

    return {
      month,
      source: "semantic_live",
      facts,
      artifacts: [createFinanceChartArtifact(chartNeed, chart)],
      factsBlock: factsBlockFromFacts(month, facts, "semantic_live"),
      cacheKey: key,
    };
  };

  if (options.skipCache || options.forceLive) {
    return compute();
  }

  return withFinanceCache(key, 10 * 60, compute);
}
