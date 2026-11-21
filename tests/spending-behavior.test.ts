import { describe, expect, it } from "vitest";
import {
  calculateSpendingBehavior,
  SPENDING_BEHAVIOR_METADATA,
} from "../api/lib/spending-behavior";

describe("calculateSpendingBehavior (BUG-04 SSOT)", () => {
  it("detects conservative when expense is under 40% of income", () => {
    const res = calculateSpendingBehavior({
      totalExpense: 3000,
      totalIncome: 10000,
      flexPercent: 20,
      hasSpike: false,
      categoryCount: 5,
    });
    expect(res.behavior).toBe("conservative");
    expect(res.labelAr).toBe("محافظ");
    expect(res.labelEn).toBe("Conservative");
  });

  it("detects impulsive when expense is over 95% of income", () => {
    const res = calculateSpendingBehavior({
      totalExpense: 9800,
      totalIncome: 10000,
      flexPercent: 30,
      hasSpike: false,
      categoryCount: 6,
    });
    expect(res.behavior).toBe("impulsive");
    expect(res.labelAr).toBe("مندفع");
  });

  it("detects concentrated when <= 2 categories have spending", () => {
    const res = calculateSpendingBehavior({
      totalExpense: 4000,
      totalIncome: null,
      flexPercent: 20,
      hasSpike: false,
      categoryCount: 2,
    });
    expect(res.behavior).toBe("concentrated");
    expect(res.labelAr).toBe("صرف مركز");
  });

  it("detects emotional when discretionary flexPercent > 55%", () => {
    const res = calculateSpendingBehavior({
      totalExpense: 6000,
      totalIncome: 8000,
      flexPercent: 60,
      hasSpike: false,
      categoryCount: 4,
    });
    expect(res.behavior).toBe("emotional");
    expect(res.labelAr).toBe("صرف عاطفي");
  });

  it("detects spiky when a spike exists or flexPercent > 45%", () => {
    const res = calculateSpendingBehavior({
      totalExpense: 5000,
      totalIncome: 8000,
      flexPercent: 48,
      hasSpike: true,
      categoryCount: 4,
    });
    expect(res.behavior).toBe("spiky");
    expect(res.labelAr).toBe("صرف فجائي");
  });

  it("detects balanced when stable ratio without spikes", () => {
    const res = calculateSpendingBehavior({
      totalExpense: 5000,
      totalIncome: 8000, // 62.5%
      flexPercent: 25,
      hasSpike: false,
      categoryCount: 4,
    });
    expect(res.behavior).toBe("balanced");
    expect(res.labelAr).toBe("متوازن");
  });

  it("has metadata for all defined behaviors", () => {
    const behaviors = [
      "planned",
      "spiky",
      "emotional",
      "concentrated",
      "impulsive",
      "conservative",
      "balanced",
    ] as const;
    for (const b of behaviors) {
      expect(SPENDING_BEHAVIOR_METADATA[b]).toBeDefined();
      expect(SPENDING_BEHAVIOR_METADATA[b].labelAr.length).toBeGreaterThan(0);
      expect(SPENDING_BEHAVIOR_METADATA[b].labelEn.length).toBeGreaterThan(0);
      expect(SPENDING_BEHAVIOR_METADATA[b].descriptionAr.length).toBeGreaterThan(0);
    }
  });
});
