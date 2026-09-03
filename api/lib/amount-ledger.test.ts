import { describe, it, expect } from "vitest";
import {
  buildAnchors,
  describeUnconsumed,
  fromCents,
  reconcileAmounts,
  toCents,
} from "./amount-ledger";

const items = (...amounts: number[]) => amounts.map((amount) => ({ amount }));

describe("amount ledger", () => {
  it("counts money in whole cents", () => {
    expect(toCents(100.5)).toBe(10050);
    expect(toCents(133.33)).toBe(13333);
    expect(fromCents(13333)).toBeCloseTo(133.33, 2);
    expect(toCents(Number.NaN)).toBe(0);
  });

  it("balances a straightforward narrative", () => {
    const r = reconcileAmounts(buildAnchors([50, 80, 400]), items(50, 80, 400));
    expect(r.balanced).toBe(true);
    expect(r.unconsumed).toHaveLength(0);
    expect(r.outcomes.every((o) => o.kind === "exact")).toBe(true);
  });

  it("matches amounts that float comparison gets wrong", () => {
    // 0.1 + 0.2 !== 0.3 is the textbook case, and it reached this code as a phantom
    // missing amount that asked the user a question about arithmetic that was correct.
    const r = reconcileAmounts(buildAnchors([0.3]), items(0.1 + 0.2));
    expect(r.balanced).toBe(true);
  });

  it("recognises a split rather than reporting the amount as lost", () => {
    // "٤٠٠ لمروان وعلاء" is correctly recorded as two items of 200. The old comparison
    // looked for 400 among the items, did not find it, and reported a loss.
    const r = reconcileAmounts(buildAnchors([400]), items(200, 200));
    expect(r.balanced).toBe(true);
    expect(r.outcomes[0].kind).toBe("split");
  });

  it("recognises a three-way split that cannot divide evenly", () => {
    // 400/3 forces a rounding remainder; requiring an exact sum would reject correct
    // arithmetic, and a percentage tolerance would admit incorrect arithmetic.
    const r = reconcileAmounts(buildAnchors([400]), items(133.33, 133.33, 133.34));
    expect(r.balanced).toBe(true);
    expect(r.outcomes[0].kind).toBe("split");
  });

  it("does not call two unequal transactions a split just because they add up", () => {
    // 300 + 100 landing on a 400 anchor is far more likely two real transactions, and
    // treating it as a split would hide a genuinely extra amount.
    const r = reconcileAmounts(buildAnchors([400]), items(300, 100));
    expect(r.balanced).toBe(false);
    expect(r.unconsumed.map((a) => a.raw)).toEqual([400]);
  });

  it("reports every lost amount, not just the first", () => {
    // The old loop asked about the first and then `break`. Say three numbers, lose
    // three, get asked about one — and answering it recovered nothing.
    const r = reconcileAmounts(buildAnchors([50, 80, 400]), items(50));
    expect(r.unconsumed.map((a) => a.raw)).toEqual([80, 400]);
  });

  it("flags an item whose amount the user never said", () => {
    const r = reconcileAmounts(buildAnchors([50]), items(50, 999));
    expect(r.unanchoredItemIndexes).toEqual([1]);
    expect(r.balanced).toBe(false);
  });

  it("claims exact matches before considering splits", () => {
    // Greedy splitting could swallow the items an exact match elsewhere needed, and
    // report a loss created purely by its own ordering.
    const r = reconcileAmounts(buildAnchors([200, 400]), items(200, 200, 200));
    expect(r.balanced).toBe(true);
    const kinds = r.outcomes.map((o) => o.kind).sort();
    expect(kinds).toEqual(["exact", "split"]);
  });

  it("treats duplicate amounts as separate transactions", () => {
    // Two coffees at 50 are two rows, not one row matched twice.
    const r = reconcileAmounts(buildAnchors([50, 50]), items(50, 50));
    expect(r.balanced).toBe(true);
    expect(r.outcomes.filter((o) => o.kind === "exact")).toHaveLength(2);
  });

  it("notices when a repeated amount is only recorded once", () => {
    const r = reconcileAmounts(buildAnchors([50, 50]), items(50));
    expect(r.unconsumed).toHaveLength(1);
  });

  it("asks about all the missing amounts in the order they were spoken", () => {
    const anchors = buildAnchors([50, 80, 400]);
    const q = describeUnconsumed([anchors[2], anchors[0]]);
    expect(q).toContain("50");
    expect(q).toContain("400");
    expect(q.indexOf("50")).toBeLessThan(q.indexOf("400"));
  });

  it("says nothing when nothing is missing", () => {
    expect(describeUnconsumed([])).toBe("");
  });
});
