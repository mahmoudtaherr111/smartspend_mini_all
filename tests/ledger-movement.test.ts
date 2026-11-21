import { describe, expect, it } from "vitest";
import { countsInTotals, financialBucket, movementOf, normalizeFinancialMovement, type MovementRow } from "../contracts/ledger-movement";
describe("the shared cashflow ledger", () => {
  it.each([
    ["دين/سلفة", "outgoing", "expense", "loan", true], ["دين/سلفة", "incoming", "income", "loan", true],
    ["جمعية", "outgoing", "expense", "gam3eya", true], ["جمعية", "incoming", "income", "gam3eya", true],
    ["سحب ATM", "outgoing", "expense", "cash_transfer", false], ["كاش", "incoming", "income", "cash_transfer", false],
    ["بين حساباتي", "outgoing", "expense", "own_transfer", false], ["بين حساباتي", "incoming", "income", "own_transfer", false],
    ["تحويل بنكي", "outgoing", "expense", "personal_transfer", true],
  ] as const)("normalizes %s / %s without mixing direction and spending", (subCategory, direction, type, kind, counted) => {
    const input: MovementRow = { type: "transfer", amount: 1000, category: "تحويل", subCategory, parsedMetadata: { direction } };
    const result = normalizeFinancialMovement(input)!;
    expect(result).toMatchObject({ type, financial: { kind, excluded: !counted } });
    const row = { ...input, type: result.type, parsedMetadata: { financial: result.financial } };
    expect(countsInTotals(row)).toBe(counted);
    expect(movementOf(row)).toBe(direction === "incoming" ? "in" : "out");
  });
  it("keeps rent as spending and a salary as income", () => {
    const salary = { type: "income", amount: 10000 }, rent = { type: "expense", amount: 5000 };
    expect(countsInTotals(salary) && countsInTotals(rent)).toBe(true);
    expect(Number(salary.amount) - Number(rent.amount)).toBe(5000);
  });
  it("does not guess unknown legacy directions", () => {
    for (const type of ["transfer", "investment", "unknown"]) expect(normalizeFinancialMovement({ type, amount: 1000 })).toBeNull();
    expect(normalizeFinancialMovement({ type: "unknown", direction: "outgoing", amount: 1000 })).toBeNull();
  });
  it("refuses explicitly contradictory financial kinds", () => {
    expect(normalizeFinancialMovement({ type: "expense", amount: 100 }, "income")).toBeNull();
    expect(normalizeFinancialMovement({ type: "expense", amount: 100 }, "refund")).toBeNull();
    expect(normalizeFinancialMovement({ type: "income", amount: 100 }, "spending")).toBeNull();
  });
  it("keeps a refund as negative spending, with an incoming movement", () => {
    const row = { type: "expense", amount: -450 };
    expect(normalizeFinancialMovement(row)).toMatchObject({ type: "expense", financial: { kind: "refund", movement: "in" } });
    expect(financialBucket(row)).toBe("expense");
    expect(normalizeFinancialMovement({ type: "expense", amount: 450, direction: "incoming" })).toMatchObject({ type: "expense", financial: { kind: "refund", movement: "in" } });
  });
  it("does not let mutable category text overwrite the financial nature", () => {
    const row = { type: "expense", amount: 1000, category: "أكل", parsedMetadata: { financial: { version: 1, kind: "own_transfer", movement: "out", excluded: false } } };
    expect(countsInTotals(row)).toBe(false);
    expect(financialBucket(row)).toBe("transfer");
    expect(normalizeFinancialMovement(row)?.financial.kind).toBe("own_transfer");
  });
  it("ignores malformed metadata and refuses a fake excluded flag on a loan", () => {
    expect(countsInTotals({ type: "expense", parsedMetadata: { financial: { version: 1, kind: "loan", movement: "out", excluded: true } } })).toBe(true);
    expect(countsInTotals({ type: "expense", parsedMetadata: { financial: { version: 1, kind: "invented", movement: "out", excluded: true } } })).toBe(true);
  });
});
