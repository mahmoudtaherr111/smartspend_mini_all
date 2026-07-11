import type { PeriodHint } from "../ai-kernel/types";

export type FinancePeriodKind = PeriodHint | "salary_cycle";

export type FinanceGranularity =
  | "day"
  | "week"
  | "month"
  | "category"
  | "sub_category"
  | "merchant"
  | "payment_method";

export interface FinanceContext {
  userId: number;
  userType: string;
  salaryDay?: number | null;
  referenceDate?: Date;
}

export interface FinancePeriodInput {
  period?: FinancePeriodKind;
  comparePeriod?: FinancePeriodKind;
  month?: string;
  startDate?: Date | string;
  endDate?: Date | string;
}

export interface ResolvedFinancePeriod {
  kind: FinancePeriodKind;
  key: string;
  label: string;
  startDate: Date;
  endDate: Date;
  salaryDay: number;
  daysElapsed: number;
  daysTotal: number;
  isSalaryCycle: boolean;
}

export interface FinanceSummary {
  period: ResolvedFinancePeriod;
  totalIncome: number;
  totalExpense: number;
  totalTransfers: number;
  totalInvestments: number;
  netFlow: number;
  transactionCount: number;
  expenseCount: number;
  incomeCount: number;
  dailyAverageExpense: number;
}

export interface FinancePeriodComparison {
  current: FinanceSummary;
  previous: FinanceSummary;
  expenseDifference: number;
  expenseChangePercent: number | null;
  incomeDifference: number;
  incomeChangePercent: number | null;
  netFlowDifference: number;
}

export interface FinanceCategoryTotal {
  period: ResolvedFinancePeriod;
  category: string;
  aliases: string[];
  totalExpense: number;
  totalIncome: number;
  transactionCount: number;
  topSubCategories: Array<{
    name: string;
    amount: number;
    count: number;
  }>;
}

export interface FinancePersonTotal {
  period: ResolvedFinancePeriod;
  contactId: number;
  name: string;
  relation?: string | null;
  totalExpense: number;
  transactionCount: number;
}

export interface FinanceClassificationTrace {
  transaction: FinanceTransactionFact;
  classificationLogId?: number | null;
  parsedBy?: string | null;
  decision?: string | null;
  confidence?: number | null;
  modelUsed?: string | null;
}

export interface FinanceBreakdownItem {
  name: string;
  amount: number;
  count: number;
  percent: number;
}

export interface FinanceBreakdown {
  period: ResolvedFinancePeriod;
  granularity: FinanceGranularity;
  totalExpense: number;
  items: FinanceBreakdownItem[];
}

export interface FinanceTransactionFact {
  id: number;
  type: string;
  amount: number;
  category: string;
  subCategory?: string | null;
  description?: string | null;
  paymentMethod?: string | null;
  placeHint?: string | null;
  date: string;
}

export interface FinanceWalletSummary {
  totalBalance: number;
  walletCount: number;
  wallets: Array<{
    id: number;
    name: string;
    provider: string;
    balance: number;
    lastFourDigits?: string | null;
  }>;
}

export interface FinanceTransactionsResult {
  period: ResolvedFinancePeriod;
  totalMatched: number;
  returned: number;
  transactions: FinanceTransactionFact[];
}

export interface FinanceGoalProgress {
  goals: Array<{
    id: number;
    title: string;
    status: string;
    targetAmount: number;
    targetDate?: string | null;
    estimatedMonthlyCapacity: number;
    estimatedMonthsNeeded?: number | null;
  }>;
}

export interface FinanceChartPoint {
  label: string;
  value: number;
  count: number;
  [seriesKey: string]: string | number;
}

export interface FinanceChartData {
  period: ResolvedFinancePeriod;
  granularity: FinanceGranularity;
  points: FinanceChartPoint[];
  series?: Array<{
    key: string;
    label: string;
    unit?: string;
  }>;
}

export interface FinanceProfileSnapshot {
  monthlyIncome: number | null;
  financialGoal: string | null;
  financialPersonality: string | null;
  salaryDay: number;
}

export interface FinanceResolverResult {
  facts: import("../ai-kernel/types").ResolvedFact[];
  artifacts: import("../ai-kernel/types").Artifact[];
  errors: string[];
  cacheHits: string[];
}

export interface FinanceComparisonDriver {
  category: string;
  type: "category" | "merchant";
  currentAmount: number;
  previousAmount: number;
  difference: number;
  changePercent: number | null;
  direction: "up" | "down" | "stable";
}

export interface FinanceBusinessCashflow {
  period: string;
  totalIncome: number;
  totalExpense: number;
  netFlow: number;
  topExpenseCategories: Array<{ category: string; amount: number }>;
  topIncomeCategories: Array<{ category: string; amount: number }>;
  dailyAverageExpense: number;
  projectedMonthEnd: number;
  suggestedWeeklyPlan: string[];
}

export interface FinanceCategoryInclusion {
  category: string;
  merchants: string[];
  sampleTransactions: Array<{ description: string; amount: number; date: string }>;
  ruleExplanation: string;
  totalMatched: number;
}

export interface FinanceGoalFeasibility {
  monthlyCapacity: number;
  targetAmount: number;
  estimatedMonths: number | null;
  topExpenseLevers: Array<{ category: string; amount: number; potentialSavings: number }>;
  feasibilityRating: "easy" | "moderate" | "challenging";
}
