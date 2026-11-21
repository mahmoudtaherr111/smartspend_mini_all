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

describe("the days of a behaviour snapshot", () => {
  it("are Cairo days and weekdays, not UTC ones", () => {
    const snapshot = buildBehaviorSnapshot([
      // 00:30 on Sunday November 1st in Cairo; Saturday October 31st in UTC.
      { amount: 300, type: "expense", category: "food", date: "2026-10-31T22:30:00.000Z" },
      // 23:30 on Saturday October 31st in Cairo.
      { amount: 100, type: "expense", category: "food", date: "2026-10-31T21:30:00.000Z" },
    ]);
    expect(snapshot.spendingByDay).toEqual(
      expect.arrayContaining([
        { date: "2026-11-01", amount: 300 },
        { date: "2026-10-31", amount: 100 },
      ]),
    );
    expect(snapshot.spendingByWeekday).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ weekday: "0", amount: 300 }),
        expect.objectContaining({ weekday: "6", amount: 100 }),
      ]),
    );
  });
});
