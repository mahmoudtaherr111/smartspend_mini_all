import { describe, expect, it } from "vitest";
import { exportRow } from "./export-router";

describe("an exported row", () => {
  const base = { amount: "150.00", category: "أكل وشرب", subCategory: "مطعم", description: "غدا", source: "ai_parsed" };

  it("is dated by Cairo's day, not the UTC one", () => {
    // 23:30 in Cairo on the 20th is still the 20th, though it is 20:30 UTC; 00:30 Cairo on the 21st is 21:30 UTC on the 20th.
    expect(exportRow({ ...base, type: "expense", date: new Date("2026-09-20T21:30:00Z") }).التاريخ).toBe("2026-09-21");
  });

  it("names transfers, investments and refunds instead of calling them spending", () => {
    const at = new Date("2026-09-20T10:00:00Z");
    expect(exportRow({ ...base, type: "transfer", date: at }).النوع).toBe("تحويل");
    expect(exportRow({ ...base, type: "investment", date: at }).النوع).toBe("استثمار");
    expect(exportRow({ ...base, type: "income", date: at }).النوع).toBe("دخل");
    const refund = exportRow({ ...base, type: "expense", amount: "-300", date: at });
    expect([refund.النوع, refund.المبلغ]).toEqual(["مرتجع", -300]);
  });

  it("keeps each source's own name and the subcategory", () => {
    const at = new Date("2026-09-20T10:00:00Z");
    expect(exportRow({ ...base, type: "expense", date: at }).المصدر).toBe("مكتوب");
    expect(exportRow({ ...base, type: "expense", source: "sms", date: at }).المصدر).toBe("رسالة بنك");
    expect(exportRow({ ...base, type: "expense", source: "image", date: at }).المصدر).toBe("إيصال");
    expect(exportRow({ ...base, type: "expense", date: at })["الفئة الفرعية"]).toBe("مطعم");
  });
});
