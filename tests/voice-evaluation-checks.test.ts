import { describe, expect, it } from "vitest";
import { asks, neverSays, says, universalChecks, SCENARIOS, type CallTrace } from "../scripts/voice-eval/corpus";

const trace = (assistant: string, heard?: string): CallTrace => ({
  turns: [{ user: "", assistant, ...(heard === undefined ? {} : { heard }), tools: [], cards: [],
    firstAudioMs: null, doneMs: null, timedOut: false }],
  incidents: [], writes: { expenses: [], budgets: 0, goals: 0 }, costUsd: 0, tokens: {}, providerErrors: [],
});

describe("live evaluation checks use the words actually released to the user", () => {
  it("accepts both supported merchant selectors but rejects a category total or a single latest row", () => {
    const check = SCENARIOS.find((case_) => case_.id === "shop-total")!.checks[0];
    const result = trace("ستمية وأربعين جنيه");
    const tool = { name: "money_query", args: { metric: "total", category: "طلبات" } as Record<string, unknown>, ok: true, ms: 1 };
    result.turns[0].tools = [tool];
    expect(check.test(result)).toBe(true);
    tool.args = { metric: "total", search: "طلبات" }; expect(check.test(result)).toBe(true);
    tool.args = { metric: "total", category: "أكل" }; expect(check.test(result)).toBe(false);
    tool.args = { metric: "transactions", search: "طلبات", latest: true }; expect(check.test(result)).toBe(false);
    tool.args = { metric: "total", search: "طلبات", scope: "business" }; expect(check.test(result)).toBe(false);
  });
  it("fails a wrong written receipt even when its number was said by the user before a correction", () => {
    const result = trace("اتسجلت خمستاشر. الصح خمسين.");
    result.incidents.push("wrong_amount_after_write");
    const check = universalChecks({ id: "receipt", fixture: "base", domain: "numbers", turns: [], checks: [] }).find((item) => item.id === "no_wrong_number")!;
    expect(check.test(result)).toBe(false);
  });
  it("does not count a withheld answer or question as heard", () => {
    const withheld = trace("تمنمية جنيه، أسجل؟", "");
    expect(says(/تمنمية/).test(withheld)).toBe(false);
    expect(asks(0).test(withheld)).toBe(false);
  });
  it("ignores a suppressed false claim but detects it if it reached the user", () => {
    expect(neverSays(/اتحفظ/).test(trace("اتحفظ", "دي مسودة لسه"))).toBe(true);
    expect(neverSays(/اتحفظ/).test(trace("اتحفظ", "اتحفظ"))).toBe(false);
  });
  it("retains the explicit fallback for older traces without heard", () => {
    expect(says(/تمنمية/).test(trace("تمنمية جنيه"))).toBe(true);
    expect(asks(0).test(trace("أسجل؟"))).toBe(true);
  });
});
