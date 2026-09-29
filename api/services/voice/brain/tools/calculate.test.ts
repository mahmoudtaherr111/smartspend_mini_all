import { describe, expect, it } from "vitest";
import { DraftBook } from "../drafts";
import { FactLedger } from "../facts";
import { calculateTool, resultUnit, runCalculation } from "./calculate";
import type { ToolContext, VoiceAppCalls } from "./types";

function context() {
  const ledger = new FactLedger();
  const ctx: ToolContext = {
    identity: { callId: "vc_calc000000000", userId: 7, userType: "local", plan: "pro", role: "user" },
    ledger,
    drafts: new DraftBook(),
    app: {} as VoiceAppCalls,
    signal: new AbortController().signal,
    now: () => new Date("2026-09-29T10:00:00Z"),
    salaryDay: async () => 25,
    openClarifications: [],
  };
  ledger.nextBatch();
  const income = ledger.add({ id: "mq_income", label: "دخل الدورة", value: 14_000, source: "ledger" });
  const spent = ledger.add({ id: "mq_spent", label: "مصروف الدورة", value: 2_800, source: "ledger" });
  const days = ledger.add({ id: "mq_days", label: "أيام فاضلة على المرتب", value: 10, unit: "days", source: "ledger" });
  return { ctx, ledger, refs: { income: income.ref, spent: spent.ref, days: days.ref } };
}

describe("calculate", () => {
  it("does the multi-step sum the old number screen refused: (14,000 − 2,800) ÷ 10 days", async () => {
    const { ctx, ledger, refs } = context();
    const result = await calculateTool.run({
      steps: [
        { name: "left", op: "sub", of: [refs.income, refs.spent], label: "الفاضل من الدورة" },
        { name: "daily", op: "div", of: ["left", refs.days], label: "المتاح في اليوم" },
      ],
    }, ctx);
    expect(result.response).toMatchObject({
      ok: true,
      results: [
        { name: "left", value: 11_200, unit: "EGP" },
        { name: "daily", value: 1_120, unit: "EGP/day", say: "ألف ومية وعشرين في اليوم" },
      ],
    });
    // The results are facts the call may now say, with refs a later step can use.
    expect(ledger.allows(1_120, false)).toBe(true);
    expect(result.card).toMatchObject({ kind: "fact", items: [{ value: 11_200 }, { value: 1_120 }] });
  });

  it("refuses pounds times pounds, and adding pounds to days", () => {
    const { ctx, refs } = context();
    expect(() => runCalculation([{ name: "x", op: "mul", of: [refs.income, refs.spent] }], ctx)).toThrow("unit_mismatch");
    expect(() => runCalculation([{ name: "x", op: "add", of: [refs.income, refs.days] }], ctx)).toThrow("unit_mismatch");
    expect(resultUnit("div", ["EGP", "EGP/day"])).toBe("days");
    expect(resultUnit("mul", ["EGP/month", "months"])).toBe("EGP");
  });

  it("takes an amount only from the records or the user's own words", async () => {
    const { ctx, ledger, refs } = context();
    const refused = await calculateTool.run({ steps: [{ name: "x", op: "sub", of: [refs.income, "9000 EGP"] }] }, ctx);
    expect(refused.response).toMatchObject({ ok: false, error: "unknown_amount" });
    ledger.noteUserValue(9_000);
    const taken = await calculateTool.run({ steps: [{ name: "x", op: "sub", of: [refs.income, "9000"] }] }, ctx);
    expect(taken.response).toMatchObject({ ok: true, results: [{ value: 5_000, unit: "EGP" }] });
    expect((await calculateTool.run({ steps: [{ name: "x", op: "add", of: ["f99", refs.income] }] }, ctx)).response)
      .toMatchObject({ ok: false, error: "unknown_fact" });
  });

  it("takes a known fact typed as a number as that fact, and still refuses one nobody read", () => {
    const { ctx } = context();
    const { results } = runCalculation([{ name: "left", op: "sub", of: ["14000 EGP", "2800"] }], ctx);
    expect(results[0]).toMatchObject({ value: 11_200, how: expect.stringContaining("دخل الدورة") });
    expect(() => runCalculation([{ name: "x", op: "sub", of: ["14001 EGP", "2800"] }], ctx)).toThrow("unknown_amount");
  });

  it("counts, months and percents: 20% of a month's income, and months to a goal", () => {
    const { ctx, refs, ledger } = context();
    ledger.noteUserValue(30_000);
    const { results } = runCalculation([
      { name: "save", op: "mul", of: [refs.income, "20 percent"], label: "عشرين في المية من الدخل" },
      { name: "months", op: "div", of: ["30000 EGP", "save"], label: "شهور لحد الموبايل" },
      { name: "months_up", op: "round", of: ["months"] },
    ], ctx);
    expect(results.map((r) => [r.value, r.unit])).toEqual([[2_800, "EGP"], [10.71, "ratio"], [11, "ratio"]]);
  });

  it("is exact where floating point is not", () => {
    const { ctx, ledger } = context();
    for (const value of [0.1, 0.2, 1_000]) ledger.noteUserValue(value);
    const { results } = runCalculation([
      { name: "a", op: "add", of: ["0.1 EGP", "0.2 EGP"] },
      { name: "b", op: "div", of: ["1000 EGP", "3 count"] },
    ], ctx);
    expect(results.map((r) => r.value)).toEqual([0.3, 333.33]);
  });

  it("carries a figure that went out of date into the result, and says so", async () => {
    const { ctx, ledger, refs } = context();
    ledger.markRecordsChanged();
    const result = await calculateTool.run({ steps: [{ name: "left", op: "sub", of: [refs.income, refs.spent] }] }, ctx);
    expect(result.response).toMatchObject({ ok: true, results: [{ stale: true }], note: expect.any(String) });
    expect(ledger.onlyStale(11_200, false)).toBe(true);
  });

  it("refuses a division by zero, a repeated name and too many steps, without writing any fact", () => {
    const { ctx, ledger, refs } = context();
    const before = ledger.all().length;
    ledger.noteUserValue(500);
    expect(() => runCalculation([{ name: "z", op: "sub", of: [refs.income, refs.income] }, { name: "d", op: "div", of: ["500", "z"] }], ctx))
      .toThrow("divide_by_zero");
    expect(() => runCalculation([{ name: "a", op: "add", of: [refs.income, refs.spent] }, { name: "a", op: "add", of: [refs.income, refs.spent] }], ctx))
      .toThrow("bad_name");
    expect(() => runCalculation(Array.from({ length: 9 }, (_, i) => ({ name: `s${i}`, op: "add", of: [refs.income, refs.spent] })), ctx))
      .toThrow("too_many_steps");
    expect(ledger.all().length).toBe(before);
  });

  it("adds up any list of recorded amounts exactly (property over generated sums)", () => {
    let seed = 42;
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31);
    for (let round = 0; round < 200; round += 1) {
      const { ctx, ledger } = context();
      ledger.nextBatch();
      const cents = Array.from({ length: 2 + (next() % 8) }, () => next() % 5_000_000);
      const refs = cents.map((value, index) => ledger.add({ id: `x${index}`, label: "x", value: value / 100, source: "ledger" }).ref);
      const { results } = runCalculation([{ name: "total", op: "sum", of: refs }], ctx);
      expect(Math.round(results[0].value * 100)).toBe(cents.reduce((a, b) => a + b, 0));
    }
  });
});
