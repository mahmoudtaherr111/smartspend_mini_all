import { describe, expect, it } from "vitest";
import { buildBehaviorSnapshot } from "./lifestyle-inference-engine";
import { buildDefaultSmartProfile } from "./user-profile-service";

describe("lifestyle inference engine", () => {
  it("builds monthly behavior snapshot and detects spikes", () => {
    const profile = buildDefaultSmartProfile(
      { id: 1, type: "local" },
      { monthlyIncome: "10000" },
    );
    const snapshot = buildBehaviorSnapshot(
      [
        {
          amount: 10000,
          type: "income",
          category: "salary",
          date: "2026-05-01",
        },
        {
          amount: 200,
          type: "expense",
          category: "food",
          subCategory: "coffee",
          date: "2026-05-02",
        },
        {
          amount: 200,
          type: "expense",
          category: "transport",
          subCategory: "metro",
          date: "2026-05-04",
        },
        {
          amount: 3000,
          type: "expense",
          category: "shopping",
          subCategory: "electronics",
          date: "2026-05-03",
        },
      ],
      [],
      profile,
    );

    expect(snapshot.totalIncome).toBe(10000);
    expect(snapshot.totalExpense).toBe(3400);
    expect(snapshot.topCategories[0].name).toBe("shopping");
    expect(snapshot.behaviorFlags.hasSpikeSpending).toBe(true);
    expect(snapshot.inferredAttributes.financialStability).toBe("watch");
  });
});
