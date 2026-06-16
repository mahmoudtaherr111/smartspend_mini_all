import {
  aiActionMemory,
  aiConversationSummaries,
  aiMemoryItems,
} from "../../../db/schema";
import { db } from "../../queries/connection";
import { and, desc, eq } from "drizzle-orm";
import {
  getFinanceSummary,
  getGoalProgress,
  getProfileSnapshot,
} from "../finance-semantic-layer";
import type {
  FinanceGoalProgress,
  FinanceProfileSnapshot,
  FinanceSummary,
} from "../finance-semantic-layer/types";
import type {
  VoiceFinanceSnapshot,
  VoiceGoalSnapshot,
  VoiceHotContext,
  VoiceProfileSnapshot,
  VoiceSessionInput,
} from "./types";

function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "unknown";
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.?0+$/, "");
}

function compactText(value: unknown, max = 120): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function financeSnapshot(summary: FinanceSummary): VoiceFinanceSnapshot {
  return {
    period: summary.period.label,
    totalIncome: summary.totalIncome,
    totalExpense: summary.totalExpense,
    netFlow: summary.netFlow,
    transactionCount: summary.transactionCount,
    dailyAverageExpense: summary.dailyAverageExpense,
  };
}

function profileSnapshot(profile: FinanceProfileSnapshot): VoiceProfileSnapshot {
  return {
    monthlyIncome: profile.monthlyIncome,
    financialGoal: profile.financialGoal,
    financialPersonality: profile.financialPersonality,
    salaryDay: profile.salaryDay,
  };
}

function goalSnapshots(result: FinanceGoalProgress): VoiceGoalSnapshot[] {
  return result.goals.slice(0, 5).map((goal) => ({
    id: goal.id,
    title: goal.title,
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
    estimatedMonthlyCapacity: goal.estimatedMonthlyCapacity,
    estimatedMonthsNeeded: goal.estimatedMonthsNeeded,
  }));
}

async function capture<T>(
  label: string,
  errors: string[],
  fn: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    errors.push(`${label}:${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function loadRecentMemoryHints(input: VoiceSessionInput): Promise<string[]> {
  const [capsules, memories, actions] = await Promise.all([
    db
      .select({ content: aiConversationSummaries.capsule, updatedAt: aiConversationSummaries.updatedAt })
      .from(aiConversationSummaries)
      .where(
        and(
          eq(aiConversationSummaries.userId, input.userId),
          eq(aiConversationSummaries.userType, input.userType),
        ),
      )
      .orderBy(desc(aiConversationSummaries.updatedAt))
      .limit(4),
    db
      .select({ content: aiMemoryItems.content, updatedAt: aiMemoryItems.updatedAt })
      .from(aiMemoryItems)
      .where(
        and(
          eq(aiMemoryItems.userId, input.userId),
          eq(aiMemoryItems.userType, input.userType),
          eq(aiMemoryItems.status, "active"),
        ),
      )
      .orderBy(desc(aiMemoryItems.updatedAt))
      .limit(5),
    db
      .select({ content: aiActionMemory.summary, updatedAt: aiActionMemory.updatedAt })
      .from(aiActionMemory)
      .where(
        and(
          eq(aiActionMemory.userId, input.userId),
          eq(aiActionMemory.userType, input.userType),
        ),
      )
      .orderBy(desc(aiActionMemory.updatedAt))
      .limit(3),
  ]);

  const seen = new Set<string>();
  return [...memories, ...capsules, ...actions]
    .map((item) => compactText(item.content, 110))
    .filter((content) => {
      const key = content.toLowerCase();
      if (!content || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

export async function buildVoiceHotContext(input: VoiceSessionInput): Promise<VoiceHotContext> {
  const errors: string[] = [];
  const baseCtx = {
    userId: input.userId,
    userType: input.userType,
  };

  const profile = await capture("profile", errors, () => getProfileSnapshot(baseCtx));
  const financeCtx = {
    ...baseCtx,
    salaryDay: profile?.salaryDay,
  };

  const [today, month, goals, memory] = await Promise.all([
    capture("today_summary", errors, () => getFinanceSummary(financeCtx, { period: "today" })),
    capture("month_summary", errors, () => getFinanceSummary(financeCtx, { period: "current_month" })),
    capture("active_goals", errors, () => getGoalProgress(financeCtx)),
    capture("recent_memory", errors, () => loadRecentMemoryHints(input)),
  ]);

  const recentCapsules = memory ?? [];

  return {
    profile: profile ? profileSnapshot(profile) : undefined,
    today: today ? financeSnapshot(today) : undefined,
    month: month ? financeSnapshot(month) : undefined,
    activeGoals: goals ? goalSnapshots(goals) : [],
    recentCapsules,
    errors,
  };
}

export function renderVoiceHotContext(context: VoiceHotContext): string {
  const lines: string[] = ["HOT_FACTS"];

  if (context.profile) {
    lines.push(
      `profile: income=${money(context.profile.monthlyIncome)}; salary_day=${context.profile.salaryDay}; goal=${compactText(context.profile.financialGoal ?? "unknown", 60)}; personality=${compactText(context.profile.financialPersonality ?? "unknown", 60)}`,
    );
  }

  if (context.today) {
    lines.push(
      `today: expense=${money(context.today.totalExpense)}; income=${money(context.today.totalIncome)}; net=${money(context.today.netFlow)}; tx=${context.today.transactionCount}; avg=${money(context.today.dailyAverageExpense)}`,
    );
  }

  if (context.month) {
    lines.push(
      `month: expense=${money(context.month.totalExpense)}; income=${money(context.month.totalIncome)}; net=${money(context.month.netFlow)}; tx=${context.month.transactionCount}; avg=${money(context.month.dailyAverageExpense)}`,
    );
  }

  if (context.activeGoals.length > 0) {
    lines.push(
      `goals: ${context.activeGoals
        .map((goal) =>
          `${compactText(goal.title, 40)} target=${money(goal.targetAmount)} months=${goal.estimatedMonthsNeeded ?? "unknown"}`,
        )
        .join(" | ")}`,
    );
  }

  if (context.recentCapsules.length > 0) {
    lines.push(`recent_memory: ${context.recentCapsules.join(" | ")}`);
  }

  if (context.errors.length > 0) {
    lines.push(`context_errors: ${context.errors.slice(0, 3).join(" | ")}`);
  }

  return lines.join("\n");
}
