import { describe, expect, it } from "vitest";
import { financeCategoryId } from "./category-matcher";

describe("financeCategoryId", () => {
  it("reads a category as the user names it, in Arabic or as its id", () => {
    expect(financeCategoryId("أكل")).toBe("food");
    expect(financeCategoryId("الأكل برّه")).toBe("food");
    expect(financeCategoryId("مطاعم")).toBe("food");
    expect(financeCategoryId("food")).toBe("food");
    expect(financeCategoryId("مواصلات")).toBe(financeCategoryId("transport"));
  });

  it("keeps a name the registry does not know, so it matches nothing instead of every uncategorized row", () => {
    expect(financeCategoryId("zzqx")).toBe("zzqx");
    expect(financeCategoryId("uncategorized")).toBe("uncategorized");
  });
});
