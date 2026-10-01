import { describe, expect, it } from "vitest";
import { readSlot, slotExpiry, slotMeta } from "./slots";

describe("memory slots", () => {
  it("knows the fixed slots and the topical ones, and nothing else", () => {
    expect(readSlot(" Income.Payday ")).toMatchObject({ slot: "income.payday", kind: "profile", validDays: null });
    expect(readSlot("goal:phone")).toMatchObject({ slot: "goal:phone", kind: "goal" });
    expect(readSlot("refusal:food_budget")).toMatchObject({ kind: "refusal", validDays: 30 });
    expect(readSlot("followup:installment_amount")).toMatchObject({ kind: "followup", validDays: 21 });
    for (const bad of ["mood.today", "goal:", "goal:موبايل", "goal:Phone!", "secret:x", "", null, 5]) expect(readSlot(bad)).toBeNull();
  });

  it("dates a refusal's and a follow-up's end, and never a payday's", () => {
    const said = new Date("2026-09-01T10:00:00Z");
    expect(slotExpiry("refusal:food_budget", said)?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(slotExpiry("income.payday", said)).toBeNull();
    expect(slotExpiry("made.up", said)).toBeNull();
  });

  it("reads what a memory row carries, defensively", () => {
    expect(slotMeta({ slot: "goal:phone", day: "2026-09-10", validUntil: "2027-09-10T00:00:00.000Z" })).toEqual({
      slot: "goal:phone", day: "2026-09-10", validUntil: new Date("2027-09-10T00:00:00.000Z"),
    });
    expect(slotMeta({ slot: "nope", day: "10/9", validUntil: "soon" })).toEqual({ slot: null, day: null, validUntil: null });
    expect(slotMeta(null)).toEqual({ slot: null, day: null, validUntil: null });
  });
});
