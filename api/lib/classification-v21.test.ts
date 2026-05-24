import { describe, expect, it } from "vitest";
import { normalizeText } from "./text-normalizer";
import { extractEntities } from "./entity-extractor";
import { detectIntent } from "./intent-detector";
import { findTaxonomyMatch } from "./taxonomy-adapter";
import { runRuleEngine } from "./rule-engine";
import { normalizeTransactionTaxonomy } from "./category-registry";

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

  it("does not confuse 'انت/كنت' with 'نت' in recharge context", () => {
    const normalized = normalizeText("شحنت رصيد 50 لرقمك انت");
    const result = runRuleEngine(normalized);
    expect(result.items[0]?.amount).toBe(50);
    expect(result.items[0]?.category).toBe("فواتير");
    expect(result.items[0]?.subCategory).toBe("شحن رصيد");
  });

  it("classifies phone purchase phrases as shopping electronics", () => {
    const normalized = normalizeText("اشتريت تليفون جديد 5000");
    const result = runRuleEngine(normalized);
    expect(result.items[0]?.amount).toBe(5000);
    expect(result.items[0]?.category).toBe("تسوق");
    expect(result.items[0]?.subCategory).toBe("أجهزة إلكترونية");
  });

  it("canonicalizes digital internet bills back to bills/internet", () => {
    const item = normalizeTransactionTaxonomy({
      amount: 200,
      category: "خدمات رقمية",
      subCategory: "باقات إنترنت",
      description: "جددت باقة النت",
      type: "expense",
    }, "جددت الباقة 200 جنيه");

    expect(item.category).toBe("فواتير");
    expect(item.subCategory).toBe("إنترنت");
    expect(item.type).toBe("expense");
  });

  it("canonicalizes legacy and invalid category names", () => {
    const item = normalizeTransactionTaxonomy({
      amount: 75,
      category: "أخرى",
      subCategory: "أخرى",
      description: "حاجة مش واضحة",
      type: "expense",
    });

    expect(item.category).toBe("متنوعات");
    expect(item.subCategory).toBe("عام");
  });
});
