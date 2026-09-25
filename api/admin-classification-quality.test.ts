import { describe, expect, it } from "vitest";
import { summarizeClassificationQuality } from "./admin-router";

describe("classification quality for the admin", () => {
  it("measures silent mistakes against what was saved on its own", () => {
    const quality = summarizeClassificationQuality({
      total: 200, autoSaved: 120, review: 60, clarify: 20, corrected: 15,
      autoSavedCorrected: 6, byModel: 30, avgTimeMs: 41.6,
    });
    expect(quality).toEqual({
      total: 200, autoSaveRate: 60, reviewRate: 30, clarifyRate: 10, correctionRate: 7.5,
      silentMistakeRate: 5, modelShare: 15, avgTimeMs: 42,
    });
  });

  it("reads an empty period as zeros", () => {
    const quality = summarizeClassificationQuality({
      total: 0, autoSaved: 0, review: 0, clarify: 0, corrected: 0, autoSavedCorrected: 0, byModel: 0, avgTimeMs: 0,
    });
    expect(quality.silentMistakeRate).toBe(0);
    expect(quality.autoSaveRate).toBe(0);
  });
});
