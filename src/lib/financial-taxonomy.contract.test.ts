import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../../api/lib/category-registry";
import {
  CATEGORY_OPTIONS,
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
