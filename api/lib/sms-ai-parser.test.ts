import { describe, expect, it } from "vitest";
import { mapSmsToExpenseCategory } from "./sms-ai-parser";

describe("where a bank message is filed", () => {
  it("files salary only when the message says salary", () => {
    expect(mapSmsToExpenseCategory({ direction: "incoming", category: "income" })).toEqual({
      category: "مرتب",
      subCategory: "مرتب أساسي",
      type: "income",
    });
    expect(mapSmsToExpenseCategory({ direction: "incoming", category: "transfer", provider: "InstaPay" })).toEqual({
      category: "دخل آخر",
      subCategory: "عام",
      type: "income",
    });
  });

  it("files an ATM withdrawal as money moved, not spent", () => {
    expect(mapSmsToExpenseCategory({ direction: "outgoing", category: "withdrawal" })).toEqual({
      category: "تحويل",
      subCategory: "سحب ATM",
      type: "transfer",
    });
  });

  it("names the rail of an outgoing transfer and keeps bills as bills", () => {
    expect(
      mapSmsToExpenseCategory({ direction: "outgoing", category: "transfer", provider: "Vodafone Cash" }).subCategory,
    ).toBe("فودافون كاش");
    expect(mapSmsToExpenseCategory({ direction: "outgoing", category: "bills" }).category).toBe("فواتير");
  });
});
