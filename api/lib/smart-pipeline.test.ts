import { describe, expect, it } from "vitest";
import { runSmartPipeline } from "./smart-pipeline";

const baseInput = {
  userId: 1,
  userType: "local",
  userPlan: "free",
  userDict: [],
  apiKey: "",
  apiKey2: "",
  modelName: "gemini-2.5-flash",
  maxTokens: 128,
  pipelineSettings: {},
};

describe("smart pipeline person memory", () => {
  it("asks who an unknown directed-payment person is without calling AI", async () => {
    const result = await runSmartPipeline({
      ...baseInput,
      text: "اديت مروان 400 جنيه",
      userProfileContext: { knownPeople: [] },
    });

    expect(result.parsedBy).toBe("rule_engine");
    expect(result.decision).toBe("clarify");
    expect(result.clarificationQuestion).toContain("مين مروان");
    expect(result.items[0]?.person_mentioned).toBe("مروان");
  });

  it("uses saved people for direct name mentions without requiring a lam prefix", async () => {
    const result = await runSmartPipeline({
      ...baseInput,
      text: "اديت مروان 400 جنيه",
      userProfileContext: {
        knownPeople: [
          {
            name: "مروان",
            relationship: "صديق",
            category: "أصدقاء",
            subCategory: "مروان صاحبك",
          },
        ],
      },
    });

    expect(result.parsedBy).toBe("rule_engine");
    expect(result.items[0]?.category).toBe("أصدقاء");
    expect(result.items[0]?.subCategory).toBe("مروان صاحبك");

    // Resolved locally and correctly — but shown for review rather than written silently.
    //
    // This used to assert auto_save, which it earned by being lifted to a confidence of
    // 96 for the sole reason that a known name matched. Recognising WHO the money went
    // to says nothing about whether the CATEGORY is right, and calibration puts this
    // evidence at roughly 86% accurate — auto-saving it means one wrong row in seven,
    // written without the user ever seeing it.
    //
    // Auto-save is still reachable; it has to be earned by corroboration between
    // independent resolvers rather than granted by a name lookup.
    expect(result.decision).toBe("review");
  });

  it("keeps multi-transaction narratives local and clarifies only the unknown person segment", async () => {
    const result = await runSmartPipeline({
      ...baseInput,
      text: "فطرت ب 50 وركبت اوبر 80 واديت مروان 400 جنيه",
      userProfileContext: { knownPeople: [] },
    });

    expect(result.parsedBy).toBe("rule_engine");
    expect(result.decision).toBe("clarify");
    expect(result.clarificationQuestion).toContain("مين مروان");
    expect(result.items.map((item) => item.amount)).toEqual([50, 80, 400]);
    expect(result.items[2]?.person_mentioned).toBe("مروان");
  });

  it("asks one batched question for multiple unknown people", async () => {
    const result = await runSmartPipeline({
      ...baseInput,
      text: "اديت مروان 400 وعلاء 500 جنيه",
      userProfileContext: { knownPeople: [] },
    });

    expect(result.parsedBy).toBe("rule_engine");
    expect(result.decision).toBe("clarify");
    expect(result.clarificationQuestion).toContain("مروان");
    expect(result.clarificationQuestion).toContain("علاء");
    expect(result.items.map((item) => item.amount)).toEqual([400, 500]);
  });

});
