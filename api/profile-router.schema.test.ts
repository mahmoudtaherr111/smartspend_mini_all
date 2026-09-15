/**
 * The smart profile settings screen (src/components/profile/SmartProfileSettings.tsx) clears a field by
 * sending null. The input schema of profile.updateSmartProfile must accept that payload, or saving fails.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./queries/connection", () => ({ db: {} }));

const { smartProfilePatchSchema } = await import("./profile-router");

describe("profile.updateSmartProfile input", () => {
  it("accepts the settings screen payload with null for empty fields", () => {
    const result = smartProfilePatchSchema.safeParse({
      basicInfo: { profession: null },
      financialInfo: {
        averageMonthlyIncome: null,
        hasFixedSalary: true,
        salaryDay: null,
        incomeSources: ["salary"],
        primaryGoal: "save_money",
        spendingPattern: "balanced",
        hasDebt: false,
        monthlyDebtPayment: null,
      },
      lifestyleInfo: {
        hasChildren: false,
        childrenCount: null,
        childrenNames: [],
        partnerName: null,
        livingSituation: null,
        housingType: null,
        monthlyRent: null,
        responsibleForFamily: false,
        livesAlone: true,
        supportsOthers: false,
        fixedMonthlyCommitments: null,
        carOwnership: false,
        carType: null,
        monthlyCarCost: null,
        hasPets: false,
        petNames: [],
        smoking: false,
        subscriptions: [],
        regularContacts: [],
      },
      preferences: { detailLevel: "balanced", reportStyle: "balanced", questionFriction: "low", alertsEnabled: true },
      avatarId: null,
      profileCompleted: false,
    });
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("still rejects nested objects and oversized strings", () => {
    expect(smartProfilePatchSchema.safeParse({ lifestyleInfo: { nested: { a: 1 } } }).success).toBe(false);
    expect(smartProfilePatchSchema.safeParse({ lifestyleInfo: { note: "x".repeat(501) } }).success).toBe(false);
  });
});
