import { describe, expect, it } from "vitest";
import { addUsage, emptyUsage, textModelCostUsd, usageCostUsd } from "./pricing";

describe("call pricing", () => {
  it("prices the live model's tokens by modality", () => {
    const usage = addUsage(emptyUsage(), { input: { text: 1_000_000, audio: 1_000_000 }, output: { audio: 1_000_000 }, thoughts: 0 });
    expect(usageCostUsd(usage)).toBeCloseTo(0.75 + 3 + 12);
  });

  it("prices the tools' text models at their own rates, and an unknown one as the dearest", () => {
    expect(textModelCostUsd("gemini-3.5-flash-lite", 1_000_000, 1_000_000)).toBeCloseTo(2.8);
    expect(textModelCostUsd("gemini-3.1-flash-lite", 1_000_000, 0)).toBeCloseTo(0.25);
    expect(textModelCostUsd("some-new-model", 0, 1_000_000)).toBeCloseTo(3.75);
  });
});
