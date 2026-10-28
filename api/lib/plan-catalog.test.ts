import { describe, expect, it } from "vitest";
import { buildPlanCatalogEntry } from "./plan-catalog";

const bankMessages = (stored: Record<string, string>, plan: "free" | "pro") =>
  buildPlanCatalogEntry(stored, plan).find((row) => row.key === "bank_messages");

describe("the plans page row for bank messages", () => {
  it("is not shown while capture is off", () => {
    expect(bankMessages({}, "pro")).toBeUndefined();
  });

  it("gives the free month's limit, and tells Pro that what was missed is recorded on subscribing", () => {
    const on = { capture_enabled: "true" };
    expect(bankMessages(on, "free")?.value).toBe("50 عملية في الشهر");
    expect(bankMessages(on, "pro")?.value).toBe("بدون حد، وأي عملية فاتتك في آخر شهرين بتتسجل أول ما تشترك");
    expect(bankMessages({ ...on, capture_monthly_limit_free: "30" }, "free")?.value).toBe("30 عملية في الشهر");
  });
});
