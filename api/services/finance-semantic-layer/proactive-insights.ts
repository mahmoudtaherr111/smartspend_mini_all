import { and, desc, eq } from "drizzle-orm";
import { monthlyBehaviorSnapshots } from "../../../db/schema";
import { db } from "../../queries/connection";
import type { Artifact, ResolvedFact } from "../ai-kernel/types";

export interface SnapshotLike {
  month: string;
  totalIncome?: string | number | null;
  totalExpense?: string | number | null;
  netFlow?: string | number | null;
  topCategories?: unknown;
  behaviorFlags?: unknown;
}

export interface ProactiveInsight {
  id: string;
  severity: "positive" | "info" | "warning";
  title: string;
  body: string;
  facts: ResolvedFact[];
  artifact: Artifact;
}

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function fact(id: string, label: string, value: string | number): ResolvedFact {
  return {
    id,
    dataNeedId: "proactive_insights",
    label,
    value,
    source: "manual",
    confidence: 1,
  };
}

function insightArtifact(insight: Omit<ProactiveInsight, "artifact">): Artifact {
  return {
    id: `proactive:${insight.id}`,
    type: "text_block",
    title: insight.title,
    payload: {
      severity: insight.severity,
      body: insight.body,
      facts: insight.facts.map((item) => ({
        label: item.label,
        value: item.value,
      })),
    },
  };
}

export function buildProactiveInsightsFromSnapshots(snapshots: SnapshotLike[]): ProactiveInsight[] {
  const ordered = [...snapshots].sort((a, b) => String(b.month).localeCompare(String(a.month)));
  const current = ordered[0];
  const previous = ordered[1];
  if (!current) return [];

  const currentExpense = money(current.totalExpense);
  const currentIncome = money(current.totalIncome);
  const currentNet = money(current.netFlow);
  const previousExpense = previous ? money(previous.totalExpense) : 0;
  const change = previous ? percentChange(currentExpense, previousExpense) : null;
  const insights: Array<Omit<ProactiveInsight, "artifact">> = [];

  if (change !== null && change >= 25) {
    insights.push({
      id: "expense_spike",
      severity: "warning",
      title: "مصاريفك زادت بشكل ملحوظ",
      body: `مصاريف ${current.month} أعلى من الشهر السابق بحوالي ${change}%. راجع أكبر فئتين قبل نهاية الشهر.`,
      facts: [
        fact("expense_spike:current", "current_expense", currentExpense),
        fact("expense_spike:previous", "previous_expense", previousExpense),
        fact("expense_spike:change", "change_percent", change),
      ],
    });
  }

  if (change !== null && change <= -15) {
    insights.push({
      id: "expense_improved",
      severity: "positive",
      title: "تحسن واضح في الإنفاق",
      body: `مصاريف ${current.month} أقل من الشهر السابق بحوالي ${Math.abs(change)}%. حافظ على نفس السلوك أسبوعين كمان.`,
      facts: [
        fact("expense_improved:current", "current_expense", currentExpense),
        fact("expense_improved:previous", "previous_expense", previousExpense),
        fact("expense_improved:change", "change_percent", change),
      ],
    });
  }

  if (currentIncome > 0) {
    const burnRate = Math.round((currentExpense / currentIncome) * 100);
    if (burnRate >= 85) {
      insights.push({
        id: "income_burn_rate",
        severity: "warning",
        title: "نسبة استهلاك الدخل عالية",
        body: `استهلاكك من الدخل وصل ${burnRate}%. حاول تسيب هامش أمان 15-20% على الأقل.`,
        facts: [
          fact("income_burn_rate:expense", "total_expense", currentExpense),
          fact("income_burn_rate:income", "total_income", currentIncome),
          fact("income_burn_rate:percent", "burn_rate_percent", burnRate),
        ],
      });
    }
  }

  if (currentNet > 0 && currentIncome > 0) {
    const savingsRate = Math.round((currentNet / currentIncome) * 100);
    if (savingsRate >= 10) {
      insights.push({
        id: "positive_net_flow",
        severity: "positive",
        title: "فيه فرصة ادخار جاهزة",
        body: `الصافي موجب بحوالي ${currentNet} جنيه. ممكن تحول جزء منه لهدف ادخار بدل ما يذوب في مصاريف صغيرة.`,
        facts: [
          fact("positive_net_flow:net", "net_flow", currentNet),
          fact("positive_net_flow:savings_rate", "savings_rate_percent", savingsRate),
        ],
      });
    }
  }

  return insights.map((item) => ({
    ...item,
    artifact: insightArtifact(item),
  }));
}

export async function getProactiveInsights(ctx: {
  userId: number;
  userType: string;
  limit?: number;
}): Promise<ProactiveInsight[]> {
  const rows = await db
    .select()
    .from(monthlyBehaviorSnapshots)
    .where(
      and(
        eq(monthlyBehaviorSnapshots.userId, ctx.userId),
        eq(monthlyBehaviorSnapshots.userType, ctx.userType),
      ),
    )
    .orderBy(desc(monthlyBehaviorSnapshots.month))
    .limit(Math.max(2, Math.min(ctx.limit ?? 3, 6)));

  return buildProactiveInsightsFromSnapshots(rows);
}
