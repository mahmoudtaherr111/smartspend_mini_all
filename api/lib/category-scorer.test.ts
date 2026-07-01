import { describe, it, expect, beforeAll } from "vitest";
import { scoreCategories, detectTransactionIntent } from "./category-scorer";
import { getLocalRAGEngine } from "./local-rag-engine";

describe("Category Scorer V3", () => {
  beforeAll(() => {
    // Ensure local RAG is loaded
    getLocalRAGEngine();
  });

  describe("Intent Detection", () => {
    it("should detect income", () => {
      expect(detectTransactionIntent("استلمت 500 جنيه من محمود")).toBe("income");
      expect(detectTransactionIntent("قبضت المرتب 5000")).toBe("income");
      expect(detectTransactionIntent("جالي بونص 1000")).toBe("income");
    });

    it("should detect transfer", () => {
      expect(detectTransactionIntent("حولت 300 جنيه انستاباي")).toBe("transfer");
      expect(detectTransactionIntent("سلفت احمد 500")).toBe("transfer");
    });

    it("should detect investment", () => {
      expect(detectTransactionIntent("اشتريت سبيكة دهب 10 جرام")).toBe("investment");
      expect(detectTransactionIntent("حطيت 10000 في ثاندر")).toBe("investment");
    });

    it("should default to expense for others", () => {
      expect(detectTransactionIntent("دفعت فاتورة الكهرباء 200")).toBe("expense");
      expect(detectTransactionIntent("اكلت شاورما ب 150")).toBe("expense");
      expect(detectTransactionIntent("جبت طلبات للبيت ب 300")).toBe("expense");
    });
  });

  describe("Category Scoring & Filtering", () => {
    it("should strongly favor 'فواتير' and 'مواصلات' for 'دفعت فاتورة الكهربا 500 جنيه وركبت اوبر'", () => {
      const result = scoreCategories("دفعت فاتورة الكهربا 500 جنيه وركبت اوبر ب 100", [], 2);
      
      const catNames = result.filteredCategories.map(c => c.name_ar);
      expect(catNames).toContain("فواتير");
      expect(catNames).toContain("مواصلات");
      expect(catNames).toContain("متنوعات"); // always included
      
      // Should filter out irrelevant ones to save tokens
      expect(catNames.length).toBeLessThanOrEqual(10);
      expect(catNames).not.toContain("تعليم");
      expect(catNames).not.toContain("صحة");
    });

    it("should expand 'أكل وشرب' with 'ترفيه' and 'خروجات' due to co-occurrence", () => {
      // "شاورما" -> أكل وشرب -> ترفيه & خروجات
      const result = scoreCategories("خرجت مع صحابي اكلنا شاورما ب 200");
      const catNames = result.filteredCategories.map(c => c.name_ar);
      
      expect(catNames).toContain("أكل وشرب");
      expect(catNames).toContain("ترفيه");
      expect(catNames).toContain("أصدقاء"); // from person detection
    });

    it("should apply mandatory Person injections when people are mentioned", () => {
      const result = scoreCategories("دفعت 100 جنيه لاخويا");
      const catNames = result.filteredCategories.map(c => c.name_ar);
      
      expect(catNames).toContain("العائلة");
      expect(catNames).toContain("أصدقاء");
      expect(catNames).toContain("موظفين");
    });

    it("should utilize user history effectively", () => {
      // Text gives a generic signal so it doesn't fallback, but allows history to influence the top rank
      const text = "باص";
      const history = [
        { category: "تعليم", count: 8 },
        { category: "صحة", count: 2 },
      ];
      
      const result = scoreCategories(text, history);
      const scores = result.scores;
      
      const eduScore = scores.find(s => s.category === "تعليم")?.score || 0;
      const healthScore = scores.find(s => s.category === "صحة")?.score || 0;
      
      // Because it's 8/10 of history, it should get ~12 points (15 * 0.8)
      expect(eduScore).toBeGreaterThan(healthScore);
    });

    it("should never return fewer than 3 categories", () => {
      const result = scoreCategories("شيء مبهم جداً");
      expect(result.filteredCategories.length).toBeGreaterThanOrEqual(3);
      expect(result.filteredCategories.map(c => c.name_ar)).toContain("متنوعات");
    });

    it("should fallback to all categories if score is too low", () => {
      const result = scoreCategories("كلام فاضي");
      // Fallback is expected when ambiguous
      expect(result.totalCategories).toBe(result.allCategories);
    });
  });
});
