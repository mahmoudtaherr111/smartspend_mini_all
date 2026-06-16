import {
  aggregateFinanceSummary,
  buildBreakdown,
  buildChartData,
  buildMultiCategoryChartData,
} from "./row-aggregators";
import { resolveFinancePeriod } from "./period-resolver";

const period = resolveFinancePeriod(
  { period: "custom", startDate: "2026-06-01", endDate: "2026-06-10" },
  { referenceDate: new Date("2026-06-10T12:00:00Z") },
);

describe("finance row aggregators", () => {
  const rows = [
    { id: 1, type: "expense", amount: "120", category: "food", subCategory: "lunch", date: "2026-06-03" },
    { id: 2, type: "expense", amount: 80, category: "transport", subCategory: "uber", date: "2026-06-04" },
    { id: 3, type: "income", amount: "1000", category: "salary", date: "2026-06-05" },
  ];

  it("aggregates exact summary numbers without LLM work", () => {
    const summary = aggregateFinanceSummary(rows, period);

    expect(summary.totalIncome).toBe(1000);
    expect(summary.totalExpense).toBe(200);
    expect(summary.netFlow).toBe(800);
    expect(summary.transactionCount).toBe(3);
  });

  it("builds compact breakdown and chart data", () => {
    const breakdown = buildBreakdown(rows, period, "category", 5);
    const chart = buildChartData(rows, period, "category", 5);

    expect(breakdown.items).toEqual([
      { name: "الأكل", amount: 120, count: 1, percent: 60 },
      { name: "المواصلات", amount: 80, count: 1, percent: 40 },
    ]);
    expect(chart.points).toEqual([
      { label: "الأكل", value: 120, count: 1 },
      { label: "المواصلات", value: 80, count: 1 },
    ]);
  });

  it("canonicalizes obvious category aliases and descriptions for AI facts", () => {
    const breakdown = buildBreakdown(
      [
        { id: 1, type: "expense", amount: "120", category: "food", description: "غدا كشري", date: "2026-06-03" },
        { id: 2, type: "expense", amount: "55.5", category: "uncategorized", description: "قهوة الصبح", date: "2026-06-04" },
        { id: 3, type: "expense", amount: 80, category: "transport", description: "Uber", date: "2026-06-05" },
        { id: 4, type: "expense", amount: 375, category: "shopping", description: "كارفور خضار ولحمة", date: "2026-06-06" },
      ],
      period,
      "category",
      5,
    );

    expect(breakdown.items).toEqual([
      { name: "الأكل", amount: 550.5, count: 3, percent: 87 },
      { name: "المواصلات", amount: 80, count: 1, percent: 13 },
    ]);
  });

  it("fills empty monthly chart buckets inside the requested range", () => {
    const sixMonthPeriod = resolveFinancePeriod(
      { period: "custom", startDate: "2026-01-01", endDate: "2026-06-15" },
      { referenceDate: new Date("2026-06-15T12:00:00Z") },
    );
    const chart = buildChartData(
      [{ id: 1, type: "expense", amount: "660", category: "food", date: "2026-06-10" }],
      sixMonthPeriod,
      "month",
      12,
    );

    expect(chart.points).toEqual([
      { label: "2026-01", value: 0, count: 0 },
      { label: "2026-02", value: 0, count: 0 },
      { label: "2026-03", value: 0, count: 0 },
      { label: "2026-04", value: 0, count: 0 },
      { label: "2026-05", value: 0, count: 0 },
      { label: "2026-06", value: 660, count: 1 },
    ]);
  });

  it("fills multi-category monthly chart buckets and filters by canonical category", () => {
    const sixMonthPeriod = resolveFinancePeriod(
      { period: "custom", startDate: "2026-01-01", endDate: "2026-06-15" },
      { referenceDate: new Date("2026-06-15T12:00:00Z") },
    );
    const chart = buildMultiCategoryChartData(
      [
        {
          id: 1,
          type: "expense",
          amount: "375",
          category: "shopping",
          description: "كارفور خضار ولحمة",
          date: "2026-06-10",
        },
        {
          id: 2,
          type: "expense",
          amount: 260,
          category: "transport",
          description: "Uber",
          date: "2026-06-11",
        },
        {
          id: 3,
          type: "expense",
          amount: 95,
          category: "shopping",
          description: "صيدلية العزبي",
          date: "2026-06-12",
        },
      ],
      sixMonthPeriod,
      ["food", "transport"],
      "month",
      12,
    );

    expect(chart.series).toEqual([
      { key: "food", label: "الأكل", unit: "EGP" },
      { key: "transport", label: "المواصلات", unit: "EGP" },
    ]);
    expect(chart.points).toEqual([
      { label: "2026-01", value: 0, count: 0, food: 0, transport: 0 },
      { label: "2026-02", value: 0, count: 0, food: 0, transport: 0 },
      { label: "2026-03", value: 0, count: 0, food: 0, transport: 0 },
      { label: "2026-04", value: 0, count: 0, food: 0, transport: 0 },
      { label: "2026-05", value: 0, count: 0, food: 0, transport: 0 },
      { label: "2026-06", value: 635, count: 2, food: 375, transport: 260 },
    ]);
  });
});
