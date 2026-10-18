import { describe, expect, it } from "vitest";
import {
  buildDefaultSmartProfile,
  mergeSmartProfilePatch,
  storedSpendingBehavior,
  summarizeProfileForAI,
} from "./user-profile-service";

describe("user profile service helpers", () => {
  it("creates a smart profile from legacy fields", () => {
    const profile = buildDefaultSmartProfile(
      { id: 1, type: "local", name: "Mona", phone: "01000000000" },
      {
        monthlyIncome: "15000.00",
        financialGoal: "budgeting",
        financialPersonality: "balanced",
        profileCompleted: true,
      },
    );

    expect(profile.basicInfo.name).toBe("Mona");
    expect(profile.basicInfo.phone).toBe("01000000000");
    expect(profile.financialInfo.averageMonthlyIncome).toBe(15000);
    expect(profile.financialInfo.primaryGoal).toBe("budgeting");
    expect(profile.aiInferredAttributes.financialPersonality).toBe("balanced");
    expect(profile.profileCompleted).toBe(true);
  });

  it("merges structured patches without deleting existing sections", () => {
    const profile = buildDefaultSmartProfile({
      id: 1,
      type: "oauth",
      name: "Ali",
    });
    const next = mergeSmartProfilePatch(profile, {
      lifestyleInfo: { hasChildren: true, childrenCount: 2 },
      preferences: { detailLevel: "detailed" },
    });

    expect(next.basicInfo.name).toBe("Ali");
    expect(next.lifestyleInfo.hasChildren).toBe(true);
    expect(next.lifestyleInfo.childrenCount).toBe(2);
    expect(next.preferences.alertsEnabled).toBe(true);
    expect(next.preferences.detailLevel).toBe("detailed");
  });
});

describe("the spending behaviour and the learning events", () => {
  // What a few saves left behind while every read appended the events to the stored value.
  const grown =
    "بيصرف أكتر في آخر الشهر\nأحدث أحداث التعلم:\n- onboarding_answer: {}\nأحدث أحداث التعلم:\n- profile_edit: {}";

  it("cuts what reads used to append, and keeps what was inferred", () => {
    expect(storedSpendingBehavior(grown)).toBe("بيصرف أكتر في آخر الشهر");
    expect(storedSpendingBehavior("أحدث أحداث التعلم:\n- x")).toBeNull();
    expect(storedSpendingBehavior("متوازن")).toBe("متوازن");
    expect(storedSpendingBehavior(null)).toBeNull();
  });

  it("gives the prompt the events once, on their own line", () => {
    const profile = buildDefaultSmartProfile({ id: 1, type: "local", name: "Mona" });
    profile.aiInferredAttributes.spendingBehavior = grown;
    profile.aiInferredAttributes.recentLearningEvents = ["onboarding_answer", "profile_edit"];
    const summary = summarizeProfileForAI(profile);
    expect(summary).toContain("Spending behavior: بيصرف أكتر في آخر الشهر\n");
    expect(summary).toContain("Recent learning: onboarding_answer; profile_edit");
    expect(summary).not.toContain("أحدث أحداث التعلم");
  });
});
