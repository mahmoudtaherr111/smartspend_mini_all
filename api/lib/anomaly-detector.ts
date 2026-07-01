/**
 * SmartSpend Anomaly Detector
 * ───────────────────────────
 * Detects logical anomalies in classified transactions:
 * - Amount-category mismatches (e.g., food = 50,000 EGP)
 * - Statistical outliers vs user history
 * - Intent-category conflicts
 *
 * Returns alert messages and confidence penalties.
 */

import { db } from "../queries/connection";
import { expenses } from "../../db/schema";
import { eq, and, gte } from "drizzle-orm";
import type { ParsedTransaction } from "./rule-engine";

// ─── Types ───

export interface AnomalyResult {
  hasAnomaly: boolean;
  alertMessage?: string;
  confidencePenalty: number; // How much to reduce confidence (0-50)
  anomalyType?:
    | "amount_range"
    | "statistical"
    | "intent_conflict"
    | "time_context";
}

// ─── Amount Range Rules ───
// Reasonable amount ranges per category in Egyptian Pounds

interface AmountRule {
  category: string;
  minAmount: number;
  maxAmount: number;
  alertHigh: string;
  alertLow: string;
}

const AMOUNT_RULES: AmountRule[] = [
  {
    category: "أكل وشرب",
    minAmount: 1,
    maxAmount: 5000,
    alertHigh: "المبلغ ده كبير أوي على الأكل 🤔 متأكد مش حاجة تانية؟",
    alertLow: "",
  },
  {
    category: "مواصلات",
    minAmount: 1,
    maxAmount: 3000,
    alertHigh: "المبلغ ده كبير على المواصلات. ممكن يكون صيانة عربية؟",
    alertLow: "",
  },
  {
    category: "خدمات سيارات",
    minAmount: 5,
    maxAmount: 50000,
    alertHigh: "المبلغ ده كبير أوي على خدمات السيارات. متأكد؟",
    alertLow: "",
  },
  {
    category: "مرتب",
    minAmount: 500,
    maxAmount: 500000,
    alertHigh: "",
    alertLow: "المبلغ ده صغير على مرتب. قصدك دخل جانبي؟",
  },
  {
    category: "عمل حر",
    minAmount: 50,
    maxAmount: 500000,
    alertHigh: "",
    alertLow: "",
  },
  {
    category: "ترفيه",
    minAmount: 1,
    maxAmount: 5000,
    alertHigh: "المبلغ ده كبير على الترفيه. متأكد من الفئة؟",
    alertLow: "",
  },
  {
    category: "ترفيه",
    minAmount: 1,
    maxAmount: 5000,
    alertHigh: "المبلغ ده كبير على الخروجات. متأكد؟",
    alertLow: "",
  },
  {
    category: "صحة",
    minAmount: 5,
    maxAmount: 100000,
    alertHigh: "",
    alertLow: "",
  },
  {
    category: "تعليم",
    minAmount: 10,
    maxAmount: 200000,
    alertHigh: "",
    alertLow: "",
  },
  {
    category: "سكن",
    minAmount: 50,
    maxAmount: 200000,
    alertHigh: "",
    alertLow: "",
  },
  {
    category: "استثمار",
    minAmount: 100,
    maxAmount: 5000000,
    alertHigh: "",
    alertLow: "",
  },
  {
    category: "تسوق",
    minAmount: 5,
    maxAmount: 200000,
    alertHigh: "",
    alertLow: "",
  },
  {
    category: "هدايا وصدقات",
    minAmount: 5,
    maxAmount: 50000,
    alertHigh: "المبلغ ده كبير على هدايا/صدقات. متأكد؟",
    alertLow: "",
  },
  {
    category: "مجاملات",
    minAmount: 5,
    maxAmount: 50000,
    alertHigh: "المبلغ ده كبير على المجاملات. متأكد؟",
    alertLow: "",
  },
];

// ─── Amount Heuristics ───
// What categories are likely for certain amount ranges

export interface AmountHint {
  minAmount: number;
  maxAmount: number;
  likelyCategories: string[];
  boostScore: number; // How much to boost confidence if category matches
}

export const AMOUNT_HINTS: AmountHint[] = [
  {
    minAmount: 1,
    maxAmount: 15,
    likelyCategories: ["مواصلات", "أكل وشرب"],
    boostScore: 5,
  },
  {
    minAmount: 15,
    maxAmount: 100,
    likelyCategories: ["أكل وشرب", "مواصلات", "أكل وشرب"],
    boostScore: 3,
  },
  {
    minAmount: 100,
    maxAmount: 500,
    likelyCategories: ["أكل وشرب", "مواصلات", "تسوق", "فواتير"],
    boostScore: 2,
  },
  {
    minAmount: 500,
    maxAmount: 2000,
    likelyCategories: ["فواتير", "تسوق", "صحة", "تعليم"],
    boostScore: 2,
  },
  {
    minAmount: 2000,
    maxAmount: 10000,
    likelyCategories: ["سكن", "فواتير", "تسوق", "صحة", "استثمار"],
    boostScore: 3,
  },
  {
    minAmount: 10000,
    maxAmount: 100000,
    likelyCategories: ["سكن", "استثمار", "تسوق", "صحة"],
    boostScore: 5,
  },
];

// ─── Time Context ───

export interface TimeHint {
  category: string;
  subCategoryHint?: string;
}

/**
 * Get time-based context hints for classification.
 */
export function getTimeContext(): TimeHint | null {
  const hour = new Date().getHours();
  const day = new Date().getDay(); // 0 = Sunday, 5 = Friday

  // Morning breakfast time (6-10 AM)
  if (hour >= 6 && hour <= 10) {
    return { category: "أكل وشرب", subCategoryHint: "فطار" };
  }
  // Lunch time (12-15 PM)
  if (hour >= 12 && hour <= 15) {
    return { category: "أكل وشرب", subCategoryHint: "غدا" };
  }
  // Dinner time (19-23 PM)
  if (hour >= 19 && hour <= 23) {
    return { category: "أكل وشرب", subCategoryHint: "عشا" };
  }
  // Friday outings
  if (day === 5 && hour >= 10 && hour <= 22) {
    return { category: "ترفيه" };
  }

  return null;
}

// ─── Core Detection ───

/**
 * Check if a transaction amount makes sense for its category.
 */
export function checkAmountAnomaly(item: ParsedTransaction): AnomalyResult {
  const rule = AMOUNT_RULES.find((r) => r.category === item.category);
  if (!rule) return { hasAnomaly: false, confidencePenalty: 0 };

  if (item.amount > rule.maxAmount && rule.alertHigh) {
    return {
      hasAnomaly: true,
      alertMessage: rule.alertHigh,
      confidencePenalty: 30,
      anomalyType: "amount_range",
    };
  }

  if (item.amount < rule.minAmount && rule.alertLow) {
    return {
      hasAnomaly: true,
      alertMessage: rule.alertLow,
      confidencePenalty: 15,
      anomalyType: "amount_range",
    };
  }

  return { hasAnomaly: false, confidencePenalty: 0 };
}

/**
 * Check for intent-category conflicts.
 * e.g., type=income but category=food
 */
export function checkIntentConflict(item: ParsedTransaction): AnomalyResult {
  const expenseOnlyCategories = [
    "أكل وشرب",
    "مواصلات",
    "فواتير",
    "سكن",
    "تسوق",
    "صحة",
    "تعليم",
    "ترفيه",
    "خدمات سيارات",
  ];
  const incomeOnlyCategories = ["مرتب", "عمل حر", "عوائد استثمار"];

  if (item.type === "income" && expenseOnlyCategories.includes(item.category)) {
    return {
      hasAnomaly: true,
      alertMessage: `فئة "${item.category}" عادة بتكون مصروف مش دخل. متأكد؟`,
      confidencePenalty: 25,
      anomalyType: "intent_conflict",
    };
  }

  if (item.type === "expense" && incomeOnlyCategories.includes(item.category)) {
    return {
      hasAnomaly: true,
      alertMessage: `فئة "${item.category}" عادة بتكون دخل مش مصروف. متأكد؟`,
      confidencePenalty: 25,
      anomalyType: "intent_conflict",
    };
  }

  return { hasAnomaly: false, confidencePenalty: 0 };
}

/**
 * Get amount-based category hints.
 * Returns boost score if amount matches expected range for category.
 */
export function getAmountCategoryBoost(
  amount: number,
  category: string,
): number {
  for (const hint of AMOUNT_HINTS) {
    if (amount >= hint.minAmount && amount <= hint.maxAmount) {
      if (hint.likelyCategories.includes(category)) {
        return hint.boostScore;
      }
    }
  }
  return 0;
}

/**
 * Run all anomaly checks on a transaction.
 */
export function detectAnomalies(item: ParsedTransaction): AnomalyResult {
  // Check amount range
  const amountCheck = checkAmountAnomaly(item);
  if (amountCheck.hasAnomaly) return amountCheck;

  // Check intent conflict
  const intentCheck = checkIntentConflict(item);
  if (intentCheck.hasAnomaly) return intentCheck;

  return { hasAnomaly: false, confidencePenalty: 0 };
}

/**
 * Apply amount-based confidence adjustments.
 * Boosts confidence when amount matches expected range,
 * penalizes when it doesn't.
 */
export function adjustConfidenceByAmount(item: ParsedTransaction): number {
  const boost = getAmountCategoryBoost(item.amount, item.category);
  const anomaly = checkAmountAnomaly(item);
  return boost - anomaly.confidencePenalty;
}
