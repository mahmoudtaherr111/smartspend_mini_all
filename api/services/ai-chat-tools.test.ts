import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeTool, TOOL_DEFINITIONS } from "./ai-chat-tools";
import { resolveKernelDataNeeds } from "./finance-semantic-layer";

vi.mock("./finance-semantic-layer", () => ({
  resolveKernelDataNeeds: vi.fn(async () => ({
    facts: [
      {
        id: "legacy_finance_1_finance_category_total:category_total_expense",
        dataNeedId: "legacy_finance_1_finance_category_total",
        label: "category_total_expense",
        value: 550.5,
        source: "finance.category_total",
        confidence: 1,
      },
    ],
    artifacts: [],
    errors: [],
    cacheHits: ["legacy_finance:finance.category_total:current_month:food"],
  })),
}));

describe("legacy AI chat tools bridge", () => {
  beforeEach(() => {
    vi.mocked(resolveKernelDataNeeds).mockClear();
  });

  it("prefers a unified finance_query tool backed by the finance semantic layer", async () => {
    expect(TOOL_DEFINITIONS[0].function.name).toBe("finance_query");

    const output = await executeTool(
      "finance_query",
      { kind: "category_total", period: "current_month", category: "food", limit: 5 },
      { userId: 1, userType: "oauth", salaryDay: 1 },
    );
    const parsed = JSON.parse(output);

    expect(parsed).toMatchObject({
      ok: true,
      tool: "finance_query",
      result: {
        contract: "finance.query.v1",
        facts: [expect.objectContaining({ label: "category_total_expense", value: 550.5 })],
      },
    });
    expect(resolveKernelDataNeeds).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, userType: "oauth", salaryDay: 1 }),
      expect.arrayContaining([
        expect.objectContaining({
          kind: "finance.category_total",
          scope: expect.objectContaining({ period: "current_month", category: "food" }),
        }),
        expect.objectContaining({
          kind: "finance.transactions",
          scope: expect.objectContaining({ period: "current_month", category: "food", limit: 5 }),
        }),
      ]),
    );
  });

  it("returns structured JSON envelopes for legacy non-finance tools too", async () => {
    const output = await executeTool(
      "get_app_guide",
      {},
      { userId: 1, userType: "oauth", salaryDay: 1 },
    );
    const parsed = JSON.parse(output);

    expect(parsed.ok).toBe(true);
    expect(parsed.tool).toBe("get_app_guide");
    expect(parsed.result).toMatchObject({
      contract: "site.guide.v1",
      topic: "smartspend_usage",
      summary: "دليل استخدام SmartSpend السريع",
    });
    expect(parsed.result.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sms_cards",
          steps: expect.arrayContaining([
            expect.stringContaining("آخر أربعة أرقام"),
          ]),
        }),
      ]),
    );
  });
});
