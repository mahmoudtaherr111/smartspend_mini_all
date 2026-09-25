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
      { name: "أكل وشرب", amount: 120, count: 1, percent: 60 },
      { name: "مواصلات", amount: 80, count: 1, percent: 40 },
    ]);
    expect(chart.points).toEqual([
      { label: "أكل وشرب", value: 120, count: 1 },
      { label: "مواصلات", value: 80, count: 1 },
    ]);
  });

  it("counts a row under its stored category, and reads the text only of a row without one", () => {
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

    // The Carrefour row was saved as تسوق: the chat counts it there, as Home does.
    expect(breakdown.items).toEqual([
      { name: "تسوق", amount: 375, count: 1, percent: 59 },
      { name: "أكل وشرب", amount: 175.5, count: 2, percent: 28 },
      { name: "مواصلات", amount: 80, count: 1, percent: 13 },
    ]);
  });

  it("does not count transfers and investments as spending", () => {
    const breakdown = buildBreakdown(
      [
        { id: 1, type: "expense", amount: "100", category: "food", date: "2026-06-03" },
        { id: 2, type: "transfer", amount: "1000", category: "transfer", subCategory: "جمعية", date: "2026-06-04" },
        { id: 3, type: "investment", amount: "5000", category: "investment", date: "2026-06-05" },
      ],
      period,
      "category",
      5,
    );
    expect(breakdown.totalExpense).toBe(100);
    expect(breakdown.items.map((item) => item.name)).toEqual(["أكل وشرب"]);
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

  it("puts an expense in its Cairo day, not its UTC day", () => {
    const twoDays = resolveFinancePeriod(
      { period: "custom", startDate: "2026-06-14", endDate: "2026-06-15" },
      { referenceDate: new Date("2026-06-15T12:00:00Z") },
    );
    const chart = buildChartData(
      // 01:30 on 15 June in Cairo is 22:30 UTC on 14 June.
      [{ id: 1, type: "expense", amount: "50", category: "transport", date: new Date("2026-06-14T22:30:00Z") }],
      twoDays,
      "day",
      7,
    );

    expect(chart.points).toEqual([
      { label: "2026-06-14", value: 0, count: 0 },
      { label: "2026-06-15", value: 50, count: 1 },
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
      { key: "food", label: "أكل وشرب", unit: "EGP" },
      { key: "transport", label: "مواصلات", unit: "EGP" },
    ]);
    expect(chart.points).toEqual([
      { label: "2026-01", value: 0, count: 0, food: 0, transport: 0 },
      { label: "2026-02", value: 0, count: 0, food: 0, transport: 0 },
      { label: "2026-03", value: 0, count: 0, food: 0, transport: 0 },
      { label: "2026-04", value: 0, count: 0, food: 0, transport: 0 },
      { label: "2026-05", value: 0, count: 0, food: 0, transport: 0 },
      { label: "2026-06", value: 260, count: 1, food: 0, transport: 260 },
    ]);
  });
});
