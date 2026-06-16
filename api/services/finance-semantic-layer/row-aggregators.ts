import type {
  FinanceBreakdown,
  FinanceBreakdownItem,
  FinanceChartData,
  FinanceChartPoint,
  FinanceGranularity,
  FinanceSummary,
  ResolvedFinancePeriod,
} from "./types";
import { canonicalCategoryForRow, displayFinanceCategory } from "./category-matcher";

export interface FinanceRowLike {
  id?: number | null;
  type?: string | null;
  amount?: string | number | null;
  category?: string | null;
  subCategory?: string | null;
  description?: string | null;
  rawText?: string | null;
  paymentMethod?: string | null;
  placeHint?: string | null;
  date?: Date | string | null;
}

export function amountOf(row: FinanceRowLike): number {
  const value = Number(row.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function dateKey(value: Date | string | null | undefined, granularity: FinanceGranularity): string {
  const date = value instanceof Date ? value : new Date(value ?? 0);
  if (Number.isNaN(date.getTime())) return "unknown";

  if (granularity === "month") return date.toISOString().slice(0, 7);
  if (granularity === "week") {
    const start = new Date(date);
    const day = start.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + offset);
    return start.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function isTimeGranularity(granularity: FinanceGranularity): boolean {
  return granularity === "day" || granularity === "week" || granularity === "month";
}

function startOfTimeBucket(date: Date, granularity: FinanceGranularity): Date {
  const bucket = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (granularity === "month") {
    bucket.setUTCDate(1);
  } else if (granularity === "week") {
    const day = bucket.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day;
    bucket.setUTCDate(bucket.getUTCDate() + offset);
  }
  return bucket;
}

function addTimeBucket(date: Date, granularity: FinanceGranularity): Date {
  const next = new Date(date);
  if (granularity === "month") next.setUTCMonth(next.getUTCMonth() + 1);
  else if (granularity === "week") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function timeBucketLabels(
  period: ResolvedFinancePeriod,
  granularity: FinanceGranularity,
  limit: number,
): string[] {
  if (!isTimeGranularity(granularity)) return [];

  const labels: string[] = [];
  let cursor = startOfTimeBucket(period.startDate, granularity);
  const end = period.endDate;

  while (cursor <= end && labels.length < 366) {
    labels.push(dateKey(cursor, granularity));
    cursor = addTimeBucket(cursor, granularity);
  }

  return labels.slice(-Math.max(1, limit));
}

export function aggregateFinanceSummary(
  rows: FinanceRowLike[],
  period: ResolvedFinancePeriod,
): FinanceSummary {
  let totalIncome = 0;
  let totalExpense = 0;
  let totalTransfers = 0;
  let totalInvestments = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const row of rows) {
    const amount = amountOf(row);
    if (row.type === "income") {
      totalIncome += amount;
      incomeCount++;
    } else if (row.type === "transfer") {
      totalTransfers += amount;
    } else if (row.type === "investment") {
      totalInvestments += amount;
    } else {
      totalExpense += amount;
      expenseCount++;
    }
  }

  return {
    period,
    totalIncome,
    totalExpense,
    totalTransfers,
    totalInvestments,
    netFlow: totalIncome - totalExpense,
    transactionCount: rows.length,
    expenseCount,
    incomeCount,
    dailyAverageExpense: Math.round((totalExpense / Math.max(1, period.daysElapsed)) * 100) / 100,
  };
}

export function buildBreakdown(
  rows: FinanceRowLike[],
  period: ResolvedFinancePeriod,
  granularity: FinanceGranularity,
  limit = 10,
): FinanceBreakdown {
  const expenseRows = rows.filter((row) => row.type !== "income");
  const totalExpense = expenseRows.reduce((sum, row) => sum + amountOf(row), 0);
  const grouped = new Map<string, { amount: number; count: number }>();

  for (const row of expenseRows) {
    const name =
      granularity === "day" || granularity === "week" || granularity === "month"
        ? dateKey(row.date, granularity)
        : granularity === "sub_category"
          ? row.subCategory || "general"
          : granularity === "merchant"
            ? row.placeHint || row.description || "unknown"
            : granularity === "payment_method"
              ? row.paymentMethod || "unknown"
        : displayFinanceCategory(
            canonicalCategoryForRow(row.category, row.subCategory, row.description, row.rawText, row.placeHint),
          );
    const existing = grouped.get(name) ?? { amount: 0, count: 0 };
    existing.amount += amountOf(row);
    existing.count += 1;
    grouped.set(name, existing);
  }

  const items: FinanceBreakdownItem[] = [...grouped.entries()]
    .map(([name, item]) => ({
      name,
      amount: item.amount,
      count: item.count,
      percent: totalExpense > 0 ? Math.round((item.amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);

  return { period, granularity, totalExpense, items };
}

export function buildChartData(
  rows: FinanceRowLike[],
  period: ResolvedFinancePeriod,
  granularity: FinanceGranularity,
  limit = 12,
): FinanceChartData {
  if (isTimeGranularity(granularity)) {
    const grouped = new Map<string, { amount: number; count: number }>();
    for (const row of rows.filter((item) => item.type !== "income")) {
      const key = dateKey(row.date, granularity);
      if (key === "unknown") continue;
      const existing = grouped.get(key) ?? { amount: 0, count: 0 };
      existing.amount += amountOf(row);
      existing.count += 1;
      grouped.set(key, existing);
    }

    const labels = timeBucketLabels(period, granularity, limit);
    const fallbackLabels = [...grouped.keys()].sort((a, b) => a.localeCompare(b)).slice(-limit);
    const selectedLabels = labels.length > 0 ? labels : fallbackLabels;
    const points: FinanceChartPoint[] = selectedLabels.map((label) => {
      const item = grouped.get(label);
      return {
        label,
        value: item?.amount ?? 0,
        count: item?.count ?? 0,
      };
    });

    return {
      period,
      granularity,
      points,
    };
  }

  const breakdown = buildBreakdown(rows, period, granularity, limit);
  const points: FinanceChartPoint[] = breakdown.items
    .map((item) => ({
      label: item.name,
      value: item.amount,
      count: item.count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    period,
    granularity,
    points,
  };
}

function uniqueCategories(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function canonicalCategoryOf(row: FinanceRowLike): string {
  return canonicalCategoryForRow(row.category, row.subCategory, row.description, row.rawText, row.placeHint);
}

export function buildMultiCategoryChartData(
  rows: FinanceRowLike[],
  period: ResolvedFinancePeriod,
  categories: string[],
  granularity: FinanceGranularity,
  limit = 12,
): FinanceChartData {
  const series = uniqueCategories(categories);
  const grouped = new Map<string, FinanceChartPoint>();

  for (const row of rows) {
    if (row.type === "income") continue;
    const matchedCategory = series.find((category) => canonicalCategoryOf(row) === category);
    if (!matchedCategory) continue;

    const label = dateKey(row.date, granularity);
    if (label === "unknown") continue;

    const point = grouped.get(label) ?? { label, value: 0, count: 0 };
    const amount = amountOf(row);
    point[matchedCategory] = Number(point[matchedCategory] ?? 0) + amount;
    point.value = Number(point.value ?? 0) + amount;
    point.count = Number(point.count ?? 0) + 1;
    grouped.set(label, point);
  }

  const fallbackLabels = [...grouped.keys()].sort((a, b) => a.localeCompare(b)).slice(-limit);
  const labels = timeBucketLabels(period, granularity, limit);
  const selectedLabels = labels.length > 0 ? labels : fallbackLabels;
  const points = selectedLabels.map((label) => {
    const point = grouped.get(label) ?? { label, value: 0, count: 0 };
    for (const category of series) {
      point[category] = Number(point[category] ?? 0);
    }
    return point;
  });

  return {
    period,
    granularity,
    points,
    series: series.map((category) => ({
      key: category,
      label: displayFinanceCategory(category),
      unit: "EGP",
    })),
  };
}
