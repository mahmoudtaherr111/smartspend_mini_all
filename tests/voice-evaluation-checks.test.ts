import { describe, expect, it } from "vitest";
import { asks, neverSays, says, type CallTrace } from "../scripts/voice-eval/corpus";

const trace = (assistant: string, heard?: string): CallTrace => ({
  turns: [{ user: "", assistant, ...(heard === undefined ? {} : { heard }), tools: [], cards: [],
    firstAudioMs: null, doneMs: null, timedOut: false }],
  incidents: [], writes: { expenses: [], budgets: 0, goals: 0 }, costUsd: 0, tokens: {}, providerErrors: [],
});

describe("live evaluation checks use the words actually released to the user", () => {
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
