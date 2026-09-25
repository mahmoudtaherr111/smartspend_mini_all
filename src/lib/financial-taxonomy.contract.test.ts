import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../../api/lib/category-registry";
import {
  CATEGORY_OPTIONS,
  defaultSubCategory,
  getCategoryOptionsForType,
  getSubCategoryOptions,
} from "./financial-taxonomy";

describe("manual-entry taxonomy contract", () => {
  it("offers exactly the server's canonical categories", () => {
    expect(CATEGORY_OPTIONS).toEqual(CATEGORIES.map((category) => category.name_ar));
  });

  it("offers exactly the server's canonical subcategories", () => {
    for (const category of CATEGORIES) {
      expect(getSubCategoryOptions(category.name_ar)).toEqual(
        category.subcategories.map((subCategory) => subCategory.name_ar),
      );
    }
  });
});

describe("the review card's pickers", () => {
  it("lists only the categories of the item's kind, keeping the one it has", () => {
    const income = getCategoryOptionsForType("income");
    expect(income).toContain("دخل آخر");
    expect(income).not.toContain("أكل وشرب");
    // "استلمت من أحمد" is income filed under the person: its category stays selectable.
    expect(getCategoryOptionsForType("income", "أصدقاء")[0]).toBe("أصدقاء");
  });

  it("starts a newly picked category at its general subcategory", () => {
    expect(defaultSubCategory("مواصلات")).toBe("عام");
    expect(defaultSubCategory("مرتب")).toBe("مرتب أساسي");
  });
});
