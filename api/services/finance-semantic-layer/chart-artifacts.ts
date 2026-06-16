import type { Artifact, DataNeed } from "../ai-kernel/types";
import type { FinanceChartData } from "./types";

const SERIES_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2"];

function displaySeriesName(value: string): string {
  const names: Record<string, string> = {
    food: "الأكل",
    transport: "المواصلات",
    shopping: "التسوق",
    health: "الصحة",
    bills: "الفواتير",
    income: "الدخل",
    saving: "الادخار",
    value: "المبلغ",
  };
  return names[value] ?? value;
}

function chartTitle(data: FinanceChartData): string {
  const axis =
    data.granularity === "month"
      ? "شهري"
      : data.granularity === "day"
        ? "يومي"
        : data.granularity === "category"
          ? "حسب الفئة"
          : `حسب ${data.granularity}`;
  return `رسم المصاريف ${axis}`;
}

function moneyValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function createFinanceChartArtifact(need: DataNeed, data: FinanceChartData): Artifact {
  const series =
    data.series && data.series.length > 0
      ? data.series.map((item, index) => ({
          key: item.key,
          label: displaySeriesName(item.label),
          unit: item.unit ?? "EGP",
          color: SERIES_COLORS[index % SERIES_COLORS.length],
        }))
      : [
          {
            key: "value",
            label: "المبلغ",
            unit: "EGP",
            color: SERIES_COLORS[0],
          },
        ];

  return {
    id: `${need.id}:chart`,
    type: "chart",
    title: chartTitle(data),
    payload: {
      contractVersion: 1,
      source: "finance.chartData",
      chartKind: data.granularity === "day" || data.granularity === "month" ? "bar" : "bar",
      period: data.period.label,
      granularity: data.granularity,
      xKey: "label",
      yKey: series[0]?.key ?? "value",
      series,
      points: data.points.map((point) => ({
        ...point,
        label: point.label,
        value: moneyValue(point.value),
        count: point.count,
        ...Object.fromEntries(
          series.map((item) => [item.key, moneyValue(point[item.key])]),
        ),
      })),
    },
  };
}
