import type { BehaviorSnapshotResult } from "./lifestyle-inference-engine";
import type { SmartUserProfile } from "./user-profile-service";

export function buildReportPersonalizationContext(
  profile: SmartUserProfile,
  snapshot: BehaviorSnapshotResult
): string {
  const lifestyle = profile.lifestyleInfo;
  const inferred = profile.aiInferredAttributes;
  const preferences = profile.preferences;

  return [
    "User intelligence context:",
    `- Has children: ${lifestyle.hasChildren ?? "unknown"}`,
    `- Family responsibility: ${lifestyle.responsibleForFamily ?? "unknown"}`,
    `- Supports others: ${Array.isArray(lifestyle.supportsOthers) ? lifestyle.supportsOthers.join(", ") : "unknown"}`,
    `- Fixed commitments: ${lifestyle.fixedMonthlyCommitments ?? "unknown"}`,
    `- Preferred detail level: ${preferences.detailLevel ?? "summary"}`,
    `- Financial stability: ${snapshot.inferredAttributes.financialStability ?? inferred.financialStability ?? "unknown"}`,
    `- Spending behavior: ${snapshot.inferredAttributes.spendingBehavior ?? inferred.spendingBehavior ?? "unknown"}`,
    `- Top category: ${snapshot.topCategories[0]?.name ?? "unknown"}`,
    `- Spike spending: ${snapshot.behaviorFlags.hasSpikeSpending ? "yes" : "no"}`,
  ].join("\n");
}

export function buildBackendPersonalizedInsights(
  profile: SmartUserProfile,
  snapshot: BehaviorSnapshotResult
): Record<string, unknown> {
  const alerts: string[] = [];
  const savingOpportunities: string[] = [];
  const topCategory = snapshot.topCategories[0];
  const stability = String(snapshot.inferredAttributes.financialStability || "unknown");

  if (topCategory && topCategory.percent > 50) {
    alerts.push(`High concentration in ${topCategory.name}: ${topCategory.percent}% of monthly spend.`);
  }
  if (snapshot.behaviorFlags.hasSpikeSpending) {
    alerts.push("Spike spending detected this month.");
  }
  if (stability === "pressure") {
    alerts.push("Expense-to-income pressure is high this month.");
  }

  for (const sub of snapshot.topSubCategories.slice(0, 3)) {
    if (sub.percent >= 10) {
      savingOpportunities.push(`Review ${sub.name}; it represents ${sub.percent}% of spending.`);
    }
  }

  const familyContext =
    profile.lifestyleInfo.hasChildren === true
      ? "Family/children costs should be separated from discretionary spending."
      : "Lifestyle spending can be reviewed without family-cost assumptions.";

  return {
    behavioral_summary: {
      financial_stability: stability,
      spending_behavior: snapshot.inferredAttributes.spendingBehavior,
      family_context: familyContext,
    },
    alerts,
    saving_opportunities: savingOpportunities,
    comparative_analysis: {
      month_over_month_change: snapshot.inferredAttributes.monthOverMonthChange,
      expense_income_ratio: snapshot.inferredAttributes.expenseIncomeRatio,
      trend:
        Number(snapshot.inferredAttributes.monthOverMonthChange || 0) > 0
          ? "trending_up"
          : "trending_down_or_flat",
    },
  };
}
