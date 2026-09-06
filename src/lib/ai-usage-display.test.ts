import { describe, it, expect } from "vitest";
import {
  readUsageDisplay,
  formatUsageCount,
  formatUsageUsd,
} from "./ai-usage-display";

describe("admin usage display", () => {
  it("does not present legacy zero defaults as measured usage or a free request", () => {
    const result = readUsageDisplay({ metadata: { channel: "parse" } });
    expect(result).toMatchObject({
      input: null,
      output: null,
      cache: null,
      usd: null,
      costLabel: "غير متاح",
    });
    expect(formatUsageCount(result.cache)).toBe("غير متاح");
    expect(formatUsageUsd(result.usd)).toBe("غير متاح");
  });
  it("shows a measured zero distinctly from missing data", () => {
    const result = readUsageDisplay({
      metadata: {
        accounting: {
          usage: { promptTokens: 100, completionTokens: 20, cachedTokens: 0 },
          cost: { usd: 0, source: "provider" },
        },
      },
    });
    expect(formatUsageCount(result.cache)).toBe((0).toLocaleString());
    expect(formatUsageUsd(result.usd)).toBe("$0.00000000");
    expect(result.costLabel).toBe("من المزوّد");
  });
  it("separates result reuse from cached input and applies only a recorded FX rate", () => {
    const result = readUsageDisplay({
      metadata: {
        accounting: {
          cacheKind: "result_cache",
          usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
          cost: { usd: 0, source: "local" },
        },
      },
    });
    expect(result).toMatchObject({ cacheLabel: "نتيجة محلية", usd: 0, egp: 0 });
    expect(
      readUsageDisplay({
        metadata: {
          accounting: {
            cost: { usd: 0.5, source: "configured_rates" },
            exchangeRate: 50,
          },
        },
      }),
    ).toMatchObject({ usd: 0.5, egp: 25, costLabel: "تقدير بأسعار الأدمن" });
    expect(
      readUsageDisplay({ metadata: { accounting: { cost: { usd: 0.5 } } } })
        .egp,
    ).toBeNull();
  });
});
