import { describe, expect, it } from "vitest";
import { buildDefaultSmartProfile, mergeSmartProfilePatch } from "./user-profile-service";

describe("user profile service helpers", () => {
  it("creates a smart profile from legacy fields", () => {
    const profile = buildDefaultSmartProfile(
      { id: 1, type: "local", name: "Mona", phone: "01000000000" },
      {
        monthlyIncome: "15000.00",
        financialGoal: "budgeting",
        financialPersonality: "balanced",
        profileCompleted: true,
      }
    );

    expect(profile.basicInfo.name).toBe("Mona");
    expect(profile.basicInfo.phone).toBe("01000000000");
    expect(profile.financialInfo.averageMonthlyIncome).toBe(15000);
    expect(profile.financialInfo.primaryGoal).toBe("budgeting");
    expect(profile.aiInferredAttributes.financialPersonality).toBe("balanced");
    expect(profile.profileCompleted).toBe(true);
  });

  it("merges structured patches without deleting existing sections", () => {
    const profile = buildDefaultSmartProfile({ id: 1, type: "oauth", name: "Ali" });
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
