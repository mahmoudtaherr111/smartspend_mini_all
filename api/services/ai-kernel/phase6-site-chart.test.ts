import { compileDataNeeds } from "./data-need-compiler";
import { routeIntent } from "./intent-router";
import { createFinanceChartArtifact } from "../finance-semantic-layer";

describe("AI kernel phase 6 site guide and charts", () => {
  it("routes how-to questions to site guide retrieval", () => {
    const intent = routeIntent("ازاي اربط SMS بتاع البنك؟");
    const needs = compileDataNeeds(intent);

    expect(intent).toMatchObject({ kind: "site_help" });
    expect(needs).toEqual([
      expect.objectContaining({
        kind: "site_guide.search",
        scope: expect.objectContaining({ query: expect.stringContaining("sms") }),
      }),
    ]);
  });

  it("builds a monthly chart need for food spending over the last 6 months", () => {
    const intent = routeIntent("اعمل رسم بياني لمصاريف الاكل آخر 6 شهور");
    const needs = compileDataNeeds(intent);

    expect(intent).toMatchObject({
      kind: "chart_request",
      slots: expect.objectContaining({ category: "food" }),
    });
    expect(needs[0]).toMatchObject({
      kind: "chart.data",
      scope: expect.objectContaining({
        period: "custom",
        category: "food",
        granularity: "month",
        limit: 12,
      }),
    });
    expect(needs[0].scope?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(needs[0].scope?.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("builds a monthly chart need for multiple categories over the last 6 months", () => {
    const intent = routeIntent("ارسملي صرف الأكل والمواصلات آخر 6 شهور في رسم واحد");
    const needs = compileDataNeeds(intent);

    expect(intent).toMatchObject({
      kind: "chart_request",
      slots: expect.objectContaining({
        category: "food",
        categories: ["food", "transport"],
      }),
    });
    expect(needs[0]).toMatchObject({
      kind: "chart.data",
      scope: expect.objectContaining({
        period: "custom",
        category: "food",
        categories: ["food", "transport"],
        granularity: "month",
        limit: 12,
      }),
    });
  });

  it("creates a stable Recharts-friendly finance chart artifact contract", () => {
    const artifact = createFinanceChartArtifact(
      {
        id: "need_chart",
        kind: "chart.data",
        priority: "normal",
        reason: "test",
      },
      {
        period: {
          kind: "custom",
          key: "custom:test",
          label: "2026-01-01..2026-06-15",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-06-15"),
          salaryDay: 1,
          daysElapsed: 166,
          daysTotal: 166,
          isSalaryCycle: false,
        },
        granularity: "month",
        points: [
          { label: "2026-05", value: 1200, count: 4 },
          { label: "2026-06", value: 900, count: 3 },
        ],
      },
    );

    expect(artifact).toMatchObject({
      type: "chart",
      payload: {
        contractVersion: 1,
        source: "finance.chartData",
        chartKind: "bar",
        xKey: "label",
        yKey: "value",
        series: [expect.objectContaining({ unit: "EGP" })],
        points: [
          { label: "2026-05", value: 1200, count: 4 },
          { label: "2026-06", value: 900, count: 3 },
        ],
      },
    });
  });
});
