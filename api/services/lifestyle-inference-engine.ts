import type { SmartUserProfile } from "./user-profile-service";

export interface TransactionLike {
  amount: string | number;
  type: string;
  category: string;
  subCategory?: string | null;
  description?: string | null;
  date: Date | string;
}

export interface BehaviorSnapshotResult {
  totalIncome: number;
  totalExpense: number;
  netFlow: number;
  topCategories: Array<{ name: string; amount: number; count: number; percent: number }>;
  topSubCategories: Array<{ name: string; category: string; amount: number; count: number; percent: number }>;
  spendingByDay: Array<{ date: string; amount: number }>;
  spendingByWeekday: Array<{ weekday: string; amount: number }>;
  behaviorFlags: Record<string, unknown>;
  inferredAttributes: Record<string, unknown>;
}

function amountOf(item: TransactionLike): number {
  const amount = Number(item.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function percentage(amount: number, total: number): number {
  return total > 0 ? Math.round((amount / total) * 100) : 0;
}

export function buildBehaviorSnapshot(
  items: TransactionLike[],
  previousItems: TransactionLike[] = [],
  profile?: SmartUserProfile
): BehaviorSnapshotResult {
  const expenses = items.filter((item) => item.type === "expense");
  const income = items.filter((item) => item.type === "income");
  const totalExpense = expenses.reduce((sum, item) => sum + amountOf(item), 0);
  const totalIncome = income.reduce((sum, item) => sum + amountOf(item), 0);

  const categoryMap: Record<string, { amount: number; count: number }> = {};
  const subCategoryMap: Record<string, { category: string; amount: number; count: number }> = {};
  const dayMap: Record<string, number> = {};
  const weekdayMap: Record<string, number> = {};

  for (const item of expenses) {
    const amount = amountOf(item);
    categoryMap[item.category] ||= { amount: 0, count: 0 };
    categoryMap[item.category].amount += amount;
    categoryMap[item.category].count += 1;

    const subCategory = item.subCategory || "General";
    const subKey = `${item.category} > ${subCategory}`;
    subCategoryMap[subKey] ||= { category: item.category, amount: 0, count: 0 };
    subCategoryMap[subKey].amount += amount;
    subCategoryMap[subKey].count += 1;

    const date = new Date(item.date);
    const dayKey = date.toISOString().slice(0, 10);
    dayMap[dayKey] = (dayMap[dayKey] || 0) + amount;
    const weekday = String(date.getDay());
    weekdayMap[weekday] = (weekdayMap[weekday] || 0) + amount;
  }

  const topCategories = Object.entries(categoryMap)
    .map(([name, data]) => ({
      name,
      amount: data.amount,
      count: data.count,
      percent: percentage(data.amount, totalExpense),
    }))
    .sort((a, b) => b.amount - a.amount);

  const topSubCategories = Object.entries(subCategoryMap)
    .map(([name, data]) => ({
      name,
      category: data.category,
      amount: data.amount,
      count: data.count,
      percent: percentage(data.amount, totalExpense),
    }))
    .sort((a, b) => b.amount - a.amount);

  const spendingByDay = Object.entries(dayMap)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const spendingByWeekday = Object.entries(weekdayMap).map(([weekday, amount]) => ({
    weekday,
    amount,
  }));

  const dailyAverage = spendingByDay.length > 0 ? totalExpense / spendingByDay.length : 0;
  const spikeDays = spendingByDay.filter(
    (day) => day.amount > Math.max(500, dailyAverage * 2.5)
  );
  const flexCategories = new Set(["ترفيه", "تسوق", "أكل وشرب", "خروجات"]);
  const flexSpend = topCategories
    .filter((cat) => flexCategories.has(cat.name))
    .reduce((sum, cat) => sum + cat.amount, 0);
  const flexPercent = percentage(flexSpend, totalExpense);

  const previousTotalExpense = previousItems
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + amountOf(item), 0);
  const monthOverMonthChange =
    previousTotalExpense > 0
      ? Math.round(((totalExpense - previousTotalExpense) / previousTotalExpense) * 100)
      : null;
  const incomeBaseline =
    totalIncome ||
    Number(profile?.financialInfo.averageMonthlyIncome || profile?.legacy.monthlyIncome || 0);
  const expenseIncomeRatio = incomeBaseline > 0 ? Math.round((totalExpense / incomeBaseline) * 100) : null;

  let spendingBehavior = "planned";
  if (spikeDays.length > 0 || flexPercent > 45) spendingBehavior = "spiky";
  if (flexPercent > 55) spendingBehavior = "emotional";
  if (topCategories.length <= 2 && totalExpense > 0) spendingBehavior = "concentrated";

  let financialStability = "unknown";
  if (expenseIncomeRatio !== null) {
    if (expenseIncomeRatio < 65 && spikeDays.length === 0) financialStability = "stable";
    else if (expenseIncomeRatio <= 90) financialStability = "watch";
    else financialStability = "pressure";
  }

  const behaviorFlags = {
    hasSpikeSpending: spikeDays.length > 0,
    spikeDays,
    flexPercent,
    monthOverMonthChange,
    expenseIncomeRatio,
  };

  const inferredAttributes = {
    financialStability,
    topSpendingCategories: topCategories.slice(0, 5),
    topSpendingDays: spendingByDay.sort((a, b) => b.amount - a.amount).slice(0, 3),
    weeklySpendingPattern: spendingByWeekday.sort((a, b) => b.amount - a.amount)[0]?.weekday ?? null,
    spendingBehavior,
    hasSpikeSpending: spikeDays.length > 0,
    monthOverMonthChange,
    expenseIncomeRatio,
  };

  return {
    totalIncome,
    totalExpense,
    netFlow: totalIncome - totalExpense,
    topCategories,
    topSubCategories,
    spendingByDay: Object.entries(dayMap)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    spendingByWeekday,
    behaviorFlags,
    inferredAttributes,
  };
}
