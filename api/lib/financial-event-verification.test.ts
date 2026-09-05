import { describe, expect, it } from "vitest";
import { verifyClassifiedItems } from "./post-classifier-verifier";
import { applyCalibration } from "./confidence-calibrator";
import { emptyEvidence } from "./classification-evidence";
import { gateShortcutResult } from "./final-acceptance";
import type { ParsedTransaction } from "./rule-engine";

function item(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return { amount: 200, category: "مواصلات", subCategory: "عام", description: "بنزين",
    type: "expense", currency: "EGP", confidence: 95, needsReview: false,
    parsedBy: "rule_engine", evidence: { ...emptyEvidence("subcat_unigram", 84), anchorConsumed: true },
    ...overrides };
}
describe("verification reports conflicts without manufacturing financial facts", () => {
  it.each([-200, Number.NaN, Number.POSITIVE_INFINITY, 20_000_000])("does not repair an invalid amount %s into a valid purchase", (amount) => {
    const result = verifyClassifiedItems([item({ amount })], "دفعت 200 بنزين");
    expect(result.items[0].amount).toBe(amount);
    expect(result.flags.some((flag) => flag.severity === "error")).toBe(true);
    expect(result.items[0].needsReview).toBe(true);
  });
  it("does not reverse a refund's cash direction to fit an expense category", () => {
    const result = verifyClassifiedItems([item({ type: "income" })], "رجعلي 200");
    expect(result.items[0].type).toBe("income");
    expect(result.items[0].reviewReasons).toContain("direction_category_conflict");
  });
  it("does not delete a possible duplicate based on similar descriptions", () => {
    const result = verifyClassifiedItems([item(), item()], "دفعت 200 بنزين");
    expect(result.items).toHaveLength(2);
    expect(result.flags.some((flag) => flag.type === "duplicate")).toBe(true);
  });
  it("does not confuse two distinct event identities with duplicate rows", () => {
    const result = verifyClassifiedItems([item({ sourceEventId: 0 }), item({ sourceEventId: 1 })], "دفعت بنزين");
    expect(result.items).toHaveLength(2);
    expect(result.flags.some((flag) => flag.type === "duplicate")).toBe(false);
  });
  it("refuses a shortcut with an extra unanchored item even if all mentioned amounts were consumed", () => {
    const result = gateShortcutResult({ items: [item(), item({ amount: 300 })], text: "دفعت 200 بنزين" });
    expect(result.coversUtterance).toBe(false);
    expect(result.decision).not.toBe("auto_save");
  });
  it("replaces only raw category score uncertainty with measured evidence", () => {
    const result = applyCalibration([item({ confidence: 80, needsReview: true,
      reviewReasons: ["raw_category_confidence"] })]);
    expect(result.items[0].needsReview).toBe(false);
    expect(result.items[0].confidence).toBeGreaterThanOrEqual(90);
  });
  it("cannot clear semantic uncertainty alongside raw score uncertainty", () => {
    const result = applyCalibration([item({ confidence: 80, needsReview: true,
      reviewReasons: ["raw_category_confidence", "amount_binding_ambiguous"] })]);
    expect(result.items[0].needsReview).toBe(true);
    expect(result.items[0].reviewReasons).toContain("amount_binding_ambiguous");
  });
  it("does not clear an unexplained review flag", () => {
    expect(applyCalibration([item({ needsReview: true })]).items[0].needsReview).toBe(true);
  });
});
