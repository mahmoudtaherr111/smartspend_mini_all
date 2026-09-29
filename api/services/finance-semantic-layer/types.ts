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
  /** The period held more entries than one read takes (ROW_LIMIT): only the newest were counted. */
  partial?: boolean;
}

export interface FinancePersonTotal {
  period: ResolvedFinancePeriod;
  contactId: number;
  name: string;
  relation?: string | null;
  /** Spending linked to the person (refunds from them net it). */
  totalExpense: number;
  /** Income linked to the person: what they paid the user. */
  totalIncome: number;
  expenseCount: number;
  incomeCount: number;
  transactionCount: number;
}

/** Spending whose shop, description or words hold a text ("طلبات"), over the whole period. */
export interface FinanceTextTotal {
  period: ResolvedFinancePeriod;
  text: string;
  totalExpense: number;
  transactionCount: number;
  /** The places it matched, largest first. */
  places: Array<{ name: string; amount: number; count: number }>;
  /** The period held more rows than one read takes (ROW_LIMIT): the newest were counted. */
  partial?: true;
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
  /** The period held more entries than one read takes (ROW_LIMIT): only the newest were counted. */
  partial?: boolean;
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
    /** The Cairo day the balance was last given; null when it was saved before this was kept (unknown age). */
    observedDay: string | null;
    /** user | assistant | null (unknown) */
    source: string | null;
  }>;
}

export interface FinanceTransactionsResult {
  period: ResolvedFinancePeriod;
  /** Every row of the period that passes all the filters, counted before `limit` cuts the list. */
  totalMatched: number;
  returned: number;
  transactions: FinanceTransactionFact[];
  /** The period held more rows than one read takes (ROW_LIMIT): older matches may be missing. */
  partial?: true;
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
