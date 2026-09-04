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

    // What this test owns is the CLASSIFICATION: resolved locally, correct category,
    // correct person, and no question asked. That is the stable contract.
    //
    // It deliberately does not assert auto_save vs review. Whether an answer is safe to
    // write without review is decided by the measured reliability of its evidence, and
    // that number moves when the calibration table is rebuilt from new data — this exact
    // assertion has already flipped twice for that reason, once in each direction, and
    // both times the pipeline was behaving correctly. A unit test that fails whenever
    // the system learns something is testing the wrong thing.
    //
    // The decision layer's own behaviour is covered where it belongs, against a fixed
    // table, in classification-evidence.test.ts and classification-decision.test.ts.
    expect(result.decision).not.toBe("clarify");
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
