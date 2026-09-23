import { describe, expect, it } from "vitest";
import { DoneClaimCheck } from "./claims";

describe("DoneClaimCheck", () => {
  it("catches a waiting draft called recorded, once a reply", () => {
    const check = new DoneClaimCheck();
    expect(check.add("سجلت خمسين جنيه ", true)).toBe(true);
    expect(check.add("مواصلات، أأكد؟", true)).toBe(false);
    check.endTurn();
    expect(check.add("تمام اتسجلت.", true)).toBe(true);
  });

  it("finds the claim across pieces of the transcription and through diacritics", () => {
    const check = new DoneClaimCheck();
    expect(check.add("خلاص ", true)).toBe(false);
    expect(check.add("سَجّلت الأكل", true)).toBe(true);
  });

  it("leaves questions, other words and replies without a waiting draft alone", () => {
    const check = new DoneClaimCheck();
    expect(check.add("خمسين مواصلات، أسجلهم؟", true)).toBe(false);
    expect(check.add(" التسجيلات كتير", true)).toBe(false);
    check.endTurn();
    expect(check.add("آخر حاجة سجلتها كانت أكل", false)).toBe(false);
  });
});
