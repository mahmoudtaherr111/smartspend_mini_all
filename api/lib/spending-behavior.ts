/**
 * Single source of truth for spending behaviour / personality across SmartSpend (BUG-04).
 *
 * Used by:
 * - api/expense-router.ts (stats.summary -> behavioralInsights)
 * - api/services/lifestyle-inference-engine.ts (inferLifestyleAttributes)
 * - src/components/dashboard/StatsView.tsx
 * - Mobile stats and personality views
 */

export type SpendingBehaviorType =
  | "planned"
  | "spiky"
  | "emotional"
  | "concentrated"
  | "impulsive"
  | "conservative"
  | "balanced";

export interface SpendingBehaviorInput {
  totalExpense: number;
  totalIncome?: number | null;
  flexPercent?: number; // discretionary spending % (0-100)
  hasSpike?: boolean; // any day with > 2.5x daily average or > 500 EGP above average
  categoryCount?: number; // number of distinct categories with spending > 0
}

export interface SpendingBehaviorResult {
  behavior: SpendingBehaviorType;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
}

export const SPENDING_BEHAVIOR_METADATA: Record<
  SpendingBehaviorType,
  { labelAr: string; labelEn: string; descriptionAr: string }
> = {
  planned: {
    labelAr: "مخطط",
    labelEn: "Planned",
    descriptionAr: "مصاريفك موزعة بانتظام وماشية مع خطتك.",
  },
  spiky: {
    labelAr: "صرف فجائي",
    labelEn: "Spiky",
    descriptionAr: "مصاريفك فيها قفزات مفاجئة في أيام معينة.",
  },
  emotional: {
    labelAr: "صرف عاطفي",
    labelEn: "Emotional",
    descriptionAr: "نسبة الصرف على الرفاهيات والتسوق أعلى من المعتاد.",
  },
  concentrated: {
    labelAr: "صرف مركز",
    labelEn: "Concentrated",
    descriptionAr: "أغلب مصاريفك مركزة في فئة واحدة أو فئتين بس.",
  },
  impulsive: {
    labelAr: "مندفع",
    labelEn: "Impulsive",
    descriptionAr: "المصاريف قريبة جداً من دخلك أو بتعديه.",
  },
  conservative: {
    labelAr: "محافظ",
    labelEn: "Conservative",
    descriptionAr: "بتوفر نسبة كبيرة من دخلك وبتتحكم في مصاريفك بحذر.",
  },
  balanced: {
    labelAr: "متوازن",
    labelEn: "Balanced",
    descriptionAr: "مصاريفك متوازنة ومستقرة مقارنة بدخلك.",
  },
};

export function calculateSpendingBehavior(
  input: SpendingBehaviorInput,
): SpendingBehaviorResult {
  const {
    totalExpense,
    totalIncome = null,
    flexPercent = 0,
    hasSpike = false,
    categoryCount = 5,
  } = input;

  let behavior: SpendingBehaviorType = "planned";

  if (hasSpike || flexPercent > 45) {
    behavior = "spiky";
  }
  if (flexPercent > 55) {
    behavior = "emotional";
  }
  if (categoryCount <= 2 && totalExpense > 0) {
    behavior = "concentrated";
  }

  const expenseIncomeRatio =
    totalIncome && totalIncome > 0 ? (totalExpense / totalIncome) * 100 : null;

  if (expenseIncomeRatio !== null) {
    if (expenseIncomeRatio > 95) {
      behavior = "impulsive";
    } else if (expenseIncomeRatio < 40) {
      behavior = "conservative";
    } else if (behavior === "planned" && expenseIncomeRatio <= 75) {
      behavior = "balanced";
    }
  }

  const meta = SPENDING_BEHAVIOR_METADATA[behavior];

  return {
    behavior,
    labelAr: meta.labelAr,
    labelEn: meta.labelEn,
    descriptionAr: meta.descriptionAr,
  };
}
