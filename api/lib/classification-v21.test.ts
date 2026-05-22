import { describe, expect, it } from "vitest";
import { normalizeText } from "./text-normalizer";
import { extractEntities } from "./entity-extractor";
import { detectIntent } from "./intent-detector";
import { findTaxonomyMatch } from "./taxonomy-adapter";
import { runRuleEngine } from "./rule-engine";

describe("classification v2.1", () => {
  it("normalizes common Egyptian phrases", () => {
    const normalized = normalizeText("فكيت بنزين");
    expect(normalized).toContain("بنزين");
  });

  it("extracts multi-transaction hints and context", () => {
    const entities = extractEntities("شحنت رصيد 50 وبعدها دفعت للكهربا 200");
    expect(entities.amounts.length).toBeGreaterThanOrEqual(2);
    expect(entities.hasMultipleTransactions).toBe(true);
  });

  it("detects transfer/debt-like intent patterns", () => {
    const intent = detectIntent("حولت ل احمد");
    expect(["transfer", "expense", "income", "investment"]).toContain(intent.intent);
    expect(intent.confidence).toBeGreaterThan(0);
  });

  it("maps colloquial phrases through synonym graph", () => {
    const match = findTaxonomyMatch("دفعت للسايس");
    expect(match).not.toBeNull();
    expect(match?.subCategory).toBe("ركنة");
  });
  it("uses profile hints for children education expenses", () => {
    const result = runRuleEngine("دفعت 500 مدرسة", [], { hasChildren: true });
    expect(result.items[0]?.category).toBe("تعليم");
    expect(result.items[0]?.confidence).toBeGreaterThanOrEqual(90);
  });

  it("classifies colloquial coffee voice phrase without AI", () => {
    const normalized = normalizeText("أنا شربت قهوة بعشرين جنيه");
    const result = runRuleEngine(normalized);
    expect(result.items[0]?.amount).toBe(20);
    expect(result.items[0]?.category).toBe("أكل وشرب");
    expect(result.items[0]?.subCategory).toBe("قهوة وكافيه");
    expect(result.items[0]?.confidence).toBeGreaterThanOrEqual(90);
    expect(result.needsAI).toBe(false);
  });
});
