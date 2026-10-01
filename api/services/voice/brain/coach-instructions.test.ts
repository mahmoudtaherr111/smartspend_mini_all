import { describe, expect, it } from "vitest";
import { buildCoachInstruction } from "./coach-instructions";

const snapshot = { firstName: "منى", title: null, text: "النهارده الأربع 2026-09-30.", question: null };

describe("the coach's instructions", () => {
  for (const variant of [undefined, "lean" as const]) {
    it(`keep the rules that protect money and trust (${variant ?? "current"})`, () => {
      const text = buildCoachInstruction({ snapshot, voiceGender: "female", noteTag: "#a1b2c3", variant });
      expect(text).toMatch(/Egyptian Arabic/i);
      expect(text).toContain("calculate");
      expect(text).toMatch(/confirm only after a clear yes/i);
      expect(text).toContain("«ملاحظة من التطبيق #a1b2c3»");
      expect(text).toMatch(/never claim a system error|Never say "حصل عطل"/i);
      expect(text).toMatch(/never claim to be a person/i);
      expect(text).toContain("money_query debts");
      expect(text).toContain("scope business");
      expect(text.endsWith("النهارده الأربع 2026-09-30.")).toBe(true);
    });
  }

  it("adds the Ultra section in Ultra mode, and only the offer when Ultra is available", () => {
    expect(buildCoachInstruction({ snapshot, voiceGender: "male", noteTag: "#x", mode: "ultra" })).toContain("ULTRA THINKING");
    const offered = buildCoachInstruction({ snapshot, voiceGender: "male", noteTag: "#x", mode: "standard", ultraAvailable: true });
    expect(offered).toContain("«تفكير أعمق»");
    expect(offered).not.toContain("ULTRA THINKING");
    expect(buildCoachInstruction({ snapshot, voiceGender: "male", noteTag: "#x" })).not.toContain("تفكير أعمق");
  });

  it("is about half the length in its lean form", () => {
    const current = buildCoachInstruction({ snapshot, voiceGender: "female", noteTag: "#x" }).length;
    const lean = buildCoachInstruction({ snapshot, voiceGender: "female", noteTag: "#x", variant: "lean" }).length;
    expect(lean / current).toBeLessThan(0.6);
  });
});
