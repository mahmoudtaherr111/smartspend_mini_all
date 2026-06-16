vi.mock("../queries/connection", () => ({
  getDb: vi.fn(),
}));

vi.mock("../services/whatsapp-service", () => ({
  whatsappService: {
    sendMessage: vi.fn(),
  },
}));

vi.mock("../services/user-profile-service", () => ({
  getSmartProfile: vi.fn(),
}));

vi.mock("../services/finance-semantic-layer", () => ({
  buildMonthlyReportFactsPack: vi.fn(),
}));

vi.mock("../services/ai-cost-policy", () => ({
  recordAICostMetric: vi.fn(),
  resolveAICostPolicy: vi.fn(() => ({
    maxOutputTokens: 900,
    maxToolRounds: 1,
  })),
}));

vi.mock("../lib/fireworks-client", () => ({
  callFireworksAPI: vi.fn(),
}));

import {
  isMonthlyReportCacheValid,
  MONTHLY_REPORT_CACHE_VERSION,
} from "./monthly-report-job";

describe("monthly report cache", () => {
  it("accepts only cached reports with the current cache version", () => {
    expect(
      isMonthlyReportCacheValid({
        id: 1,
        aiReport: "cached report",
        insights: JSON.stringify({ cacheVersion: MONTHLY_REPORT_CACHE_VERSION }),
      }),
    ).toBe(true);

    expect(
      isMonthlyReportCacheValid({
        id: 1,
        aiReport: "cached report",
        insights: JSON.stringify({ cacheVersion: "old_version" }),
      }),
    ).toBe(false);

    expect(
      isMonthlyReportCacheValid({
        id: 1,
        aiReport: "",
        insights: JSON.stringify({ cacheVersion: MONTHLY_REPORT_CACHE_VERSION }),
      }),
    ).toBe(false);
  });
});
