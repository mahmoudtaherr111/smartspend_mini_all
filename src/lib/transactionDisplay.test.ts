import { describe, it, expect } from "vitest";
import { getTransactionDisplayMeta } from "./transactionDisplay";

describe("transactionDisplay helper", () => {
  it("formats outgoing transfer correctly with minus sign and sky styling", () => {
    const meta = getTransactionDisplayMeta({
      type: "transfer",
      parsedMetadata: { direction: "outgoing" },
    });
    expect(meta.isTransfer).toBe(true);
    expect(meta.direction).toBe("outgoing");
    expect(meta.sign).toBe("-");
    expect(meta.label).toBe("حولت ↗️");
    expect(meta.amountClass).toContain("text-sky-600");
  });

  it("formats incoming transfer correctly with plus sign and emerald styling", () => {
    const meta = getTransactionDisplayMeta({
      type: "transfer",
      parsedMetadata: { direction: "incoming" },
    });
    expect(meta.isTransfer).toBe(true);
    expect(meta.direction).toBe("incoming");
    expect(meta.sign).toBe("+");
    expect(meta.label).toBe("اتحولي ↙️");
    expect(meta.amountClass).toContain("text-emerald-600");
  });

  it("identifies category='تحويل' as transfer with default outgoing", () => {
    const meta = getTransactionDisplayMeta({
      type: "expense",
      category: "تحويل",
    });
    expect(meta.isTransfer).toBe(true);
    expect(meta.sign).toBe("-");
    expect(meta.label).toBe("حولت ↗️");
  });

  it("identifies category='تحويل' with direction='incoming' as incoming transfer", () => {
    const meta = getTransactionDisplayMeta({
      category: "تحويل",
      direction: "incoming",
    });
    expect(meta.isTransfer).toBe(true);
    expect(meta.sign).toBe("+");
    expect(meta.label).toBe("اتحولي ↙️");
  });

  it("formats standard income", () => {
    const meta = getTransactionDisplayMeta({
      type: "income",
      category: "مرتب",
    });
    expect(meta.isTransfer).toBe(false);
    expect(meta.isIncome).toBe(true);
    expect(meta.sign).toBe("+");
    expect(meta.label).toBe("دخل");
  });

  it("formats standard expense", () => {
    const meta = getTransactionDisplayMeta({
      type: "expense",
      category: "طعام",
    });
    expect(meta.isTransfer).toBe(false);
    expect(meta.isExpense).toBe(true);
    expect(meta.sign).toBe("-");
    expect(meta.label).toBe("مصروف");
  });

  it("formats investment", () => {
    const meta = getTransactionDisplayMeta({
      type: "investment",
      category: "ذهب",
    });
    expect(meta.isInvestment).toBe(true);
    expect(meta.sign).toBe("-");
    expect(meta.label).toBe("استثمار");
  });
});
