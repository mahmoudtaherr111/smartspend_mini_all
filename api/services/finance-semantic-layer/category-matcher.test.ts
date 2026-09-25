import { describe, expect, it } from "vitest";
import { financeCategoryId, financeCategoryIds } from "./category-matcher";

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

describe("financeCategoryIds", () => {
  it("sweeps a whole group when the user names one", () => {
    expect(financeCategoryIds("الدخل")).toEqual(["salary", "freelance", "investment_income", "gifts_received", "other_income"]);
    expect(financeCategoryIds("income")).toEqual(financeCategoryIds("دخل"));
    expect(financeCategoryIds("فواتير")).toEqual(["bills", "daily_commitments"]);
    expect(financeCategoryIds("أكل")).toEqual(["food"]);
    expect(financeCategoryIds("مرتب")).toEqual(["salary"]);
  });
});
