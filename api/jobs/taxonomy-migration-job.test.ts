import { describe, expect, it } from "vitest";
import { planTaxonomyChange } from "./taxonomy-migration-job";
import { CATEGORIES, LEGACY_TAXONOMY, resolveLegacyTaxonomy } from "../../contracts/categories";

const valid = new Map(CATEGORIES.map((c) => [c.name_ar, new Set(c.subcategories.map((s) => s.name_ar))]));

describe("taxonomy migration of stored rows", () => {
  it("moves merged categories and subcategories to where they live now", () => {
    expect(planTaxonomyChange({ category: "خدمات سيارات", subCategory: "تغيير زيت", type: "expense" }))
      .toEqual({ category: "مواصلات", subCategory: "صيانة عربية", type: "expense" });
    expect(planTaxonomyChange({ category: "خدمات سيارات", subCategory: "مخالفة", type: "expense" }))
      .toEqual({ category: "خدمات حكومية", subCategory: "مخالفة مرور", type: "expense" });
    expect(planTaxonomyChange({ category: "ترفيه", subCategory: "كافيه", type: "expense" }))
      .toEqual({ category: "أكل وشرب", subCategory: "قهوة وكافيه", type: "expense" });
    expect(planTaxonomyChange({ category: "عوائد استثمار", subCategory: "استرجاع", type: "income" }))
      .toEqual({ category: "دخل آخر", subCategory: "مرتجعات واسترداد", type: "income" });
  });

  it("retypes money movements that were booked as spending or income", () => {
    expect(planTaxonomyChange({ category: "التزامات وجمعيات", subCategory: "قسط جمعية", type: "expense" }))
      .toEqual({ category: "تحويل", subCategory: "جمعية", type: "transfer", direction: "outgoing" });
    expect(planTaxonomyChange({ category: "التزامات وجمعيات", subCategory: "قبض جمعية", type: "income" }))
      .toEqual({ category: "تحويل", subCategory: "جمعية", type: "transfer", direction: "incoming" });
    expect(planTaxonomyChange({ category: "تحويل", subCategory: "دين/سلفة", type: "income" }))
      .toEqual({ category: "تحويل", subCategory: "دين/سلفة", type: "transfer", direction: "incoming" });
    expect(planTaxonomyChange({ category: "متنوعات", subCategory: "سحب نقدي / ATM", type: "expense" }))
      .toEqual({ category: "تحويل", subCategory: "سحب ATM", type: "transfer", direction: "outgoing" });
  });

  it("leaves current rows alone, so a second run does nothing", () => {
    expect(planTaxonomyChange({ category: "أكل وشرب", subCategory: "مطعم", type: "expense" })).toBeNull();
    expect(planTaxonomyChange({ category: "تحويل", subCategory: "دين/سلفة", type: "transfer" })).toBeNull();
    expect(planTaxonomyChange({ category: "مواصلات", subCategory: "صيانة عربية", type: "expense" })).toBeNull();
  });

  it("only ever moves a row to a pair the registry can store", () => {
    for (const rule of LEGACY_TAXONOMY) {
      expect(valid.get(rule.to.category)?.has(rule.to.sub), `${rule.to.category}/${rule.to.sub}`).toBe(true);
    }
  });

  it("never lets a retired category survive the mapping", () => {
    for (const retired of ["خدمات سيارات", "خدمات رقمية", "التزامات وجمعيات"]) {
      expect(valid.has(retired)).toBe(false);
      expect(resolveLegacyTaxonomy(retired, "anything", "expense")).not.toBeNull();
    }
  });
});
