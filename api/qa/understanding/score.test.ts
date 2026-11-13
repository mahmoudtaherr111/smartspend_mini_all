import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "./report";
import { aggregate, matchEvents, percentile, personRight, scoreCase, type CaseResult, type PredictedEvent } from "./score";
import type { EvalCase, EvalSet, GoldEvent } from "./set";

const TODAY = "2026-11-11";

function predicted(overrides: Partial<PredictedEvent> = {}): PredictedEvent {
  return {
    quote: "x",
    amount: 100,
    kind: "spending",
    flow: "out",
    category: "dining",
    sub: "cafe",
    what: "",
    person: "",
    personRole: "none",
    personRelation: "",
    commitment: "",
    installments: 0,
    wallet: "",
    date: "",
    doubt: "none",
    flags: [],
    reasons: [],
    ...overrides,
  };
}

const gold = (overrides: Partial<GoldEvent> = {}): GoldEvent => ({ amount: 100, kind: "spending", flow: "out", category: "dining", sub: "cafe", ...overrides });
const kase = (expect: EvalCase["expect"], events: GoldEvent[], id = "C-1"): EvalCase => ({ id, text: "t", expect, events });

function result(outcome: CaseResult["outcome"], events: PredictedEvent[], extra: Partial<CaseResult> = {}): CaseResult {
  return {
    id: "C-1",
    today: TODAY,
    outcome,
    source: "model",
    events,
    flags: [...new Set(events.flatMap((event) => event.flags))],
    reasons: [],
    usage: { promptTokens: 1000, completionTokens: 100, cachedTokens: 400, totalTokens: 1100, servedBy: "gemini", model: "m", degradedSchema: false, attempts: [] },
    latencyMs: 1000,
    engineLatencyMs: 990,
    problems: [],
    versions: {},
    retries: 0,
    ...extra,
  };
}

describe("matchEvents", () => {
  it("matches by exact amount in cents, each gold event once", () => {
    const m = matchEvents([gold({ amount: 10.5 }), gold({ amount: 20 })], [predicted({ amount: 20 }), predicted({ amount: 10.5 }), predicted({ amount: 20 })]);
    expect(m.pairs).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(m.missing).toEqual([]);
    expect(m.extra).toEqual([2]);
  });

  it("with equal amounts prefers the gold event whose category matches", () => {
    const golds = [gold({ amount: 400, category: "health", sub: "doctor" }), gold({ amount: 400, category: "dining", sub: "cafe" })];
    const m = matchEvents(golds, [predicted({ amount: 400, category: "dining" }), predicted({ amount: 400, category: "health", sub: "doctor" })]);
    expect(m.pairs).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("accepts an alternative category when choosing among equal amounts", () => {
    const golds = [gold({ amount: 50, category: "kids", sub: "pocket_money" }), gold({ amount: 50, category: "health", sub: "doctor", alt: [["family_support", "other"]] })];
    const m = matchEvents(golds, [predicted({ amount: 50, category: "family_support", sub: "other" })]);
    expect(m.pairs).toEqual([[1, 0]]);
    expect(m.missing).toEqual([0]);
  });
});

describe("scoreCase", () => {
  it("a right save of a clear case is a correct save", () => {
    const score = scoreCase(kase("clear", [gold()]), result("save", [predicted()]));
    expect(score).toMatchObject({ correctSave: true, unsafeSave: false, slipSave: false, eventsMatched: 1 });
  });

  it("a wrong sub does not make a save unsafe or incorrect, and is reported", () => {
    const score = scoreCase(kase("clear", [gold()]), result("save", [predicted({ sub: "restaurant" })]));
    expect(score).toMatchObject({ correctSave: true, unsafeSave: false });
    expect(score.matched[0].fields.sub).toBe(false);
  });

  it.each([
    ["wrong category", [predicted({ category: "groceries", sub: "supermarket" })]],
    ["wrong kind", [predicted({ kind: "refund" })]],
    ["wrong flow", [predicted({ flow: "in" })]],
    ["wrong amount (missing + extra)", [predicted({ amount: 101 })]],
    ["an extra event", [predicted(), predicted({ amount: 57357 })]],
    ["a missing event", []],
  ])("a save with %s is unsafe", (_name, events) => {
    const score = scoreCase(kase("clear", [gold()]), result("save", events));
    expect(score.unsafeSave).toBe(true);
    expect(score.correctSave).toBe(false);
  });

  it.each(["doubt", "ask", "none"] as const)("any save of a %s case is unsafe, even with matching labels", (expectation) => {
    const events = expectation === "doubt" ? [gold()] : [];
    const score = scoreCase(kase(expectation, events), result("save", [predicted()]));
    expect(score.unsafeSave).toBe(true);
    expect(score.missedQuestion).toBe(expectation !== "doubt");
  });

  it("a save that is right on G1 fields but wrong on person or date is a slip, not correct and not unsafe", () => {
    const score = scoreCase(kase("clear", [gold({ person: "محمد" })]), result("save", [predicted({ person: "احمد" })]));
    expect(score).toMatchObject({ slipSave: true, correctSave: false, unsafeSave: false });
    const dated = scoreCase(kase("clear", [gold({ date: "offset:-1" })]), result("save", [predicted()]));
    expect(dated).toMatchObject({ slipSave: true, correctSave: false });
  });

  it("accepts an alternative pair for category and sub", () => {
    const score = scoreCase(kase("clear", [gold({ alt: [["entertainment", "outing"]] })]), result("save", [predicted({ category: "entertainment", sub: "outing" })]));
    expect(score.matched[0].fields).toMatchObject({ category: true, sub: true });
    const half = scoreCase(kase("clear", [gold({ alt: [["entertainment", "outing"]] })]), result("save", [predicted({ category: "entertainment", sub: "cinema_events" })]));
    expect(half.matched[0].fields).toMatchObject({ category: true, sub: false });
  });

  it("an alternative bound to another kind carries that kind", () => {
    const label = gold({ category: "kids", sub: "pocket_money", alt: [["people_transfer", "other"]] });
    const score = scoreCase(kase("doubt", [label]), result("show", [predicted({ kind: "personal_transfer", category: "people_transfer", sub: "other" })]));
    expect(score.matched[0].fields).toMatchObject({ kind: true, category: true });
    const wrongKind = scoreCase(kase("doubt", [label]), result("show", [predicted({ kind: "loan", category: "people_transfer", sub: "other" })]));
    expect(wrongKind.matched[0].fields.kind).toBe(false);
  });

  it("scores dates against the day the case ran, and today as empty", () => {
    const yesterday = scoreCase(kase("clear", [gold({ date: "offset:-1" })]), result("show", [predicted({ date: "2026-11-10" })]));
    expect(yesterday.matched[0].fields.date).toBe(true);
    const fifth = scoreCase(kase("clear", [gold({ date: "day:5" })]), result("show", [predicted({ date: "2026-11-05" })]));
    expect(fifth.matched[0].fields.date).toBe(true);
    const todayWritten = scoreCase(kase("clear", [gold()]), result("save", [predicted({ date: TODAY })]));
    expect(todayWritten.matched[0].fields.date).toBe(true);
    const invented = scoreCase(kase("clear", [gold()]), result("save", [predicted({ date: "2026-11-01" })]));
    expect(invented.matched[0].fields.date).toBe(false);
  });

  it("questions: needless on clear and doubt, right on ask and none", () => {
    expect(scoreCase(kase("clear", [gold()]), result("ask", [])).needlessQuestion).toBe(true);
    expect(scoreCase(kase("doubt", []), result("ask", [])).needlessQuestion).toBe(true);
    expect(scoreCase(kase("ask", []), result("ask", [])).rightQuestion).toBe(true);
    expect(scoreCase(kase("none", []), result("ask", [])).rightQuestion).toBe(true);
    expect(scoreCase(kase("ask", []), result("show", [predicted()])).missedQuestion).toBe(false);
  });

  it("show right needs every field right, sub included; anything else is show wrong", () => {
    expect(scoreCase(kase("doubt", [gold()]), result("show", [predicted()])).showRight).toBe(true);
    expect(scoreCase(kase("doubt", [gold()]), result("show", [predicted({ sub: "restaurant" })])).showWrong).toBe(true);
    expect(scoreCase(kase("none", []), result("show", [predicted()])).showWrong).toBe(true);
  });
});

describe("personRight", () => {
  it("matches folded containment either way, and is not scored without a gold person", () => {
    expect(personRight("احمد", "لمستر أحمد")).toBe(true);
    expect(personRight("محمد ابني", "محمد")).toBe(true);
    expect(personRight("محمد", "")).toBe(false);
    expect(personRight(undefined, "الواد")).toBeNull();
  });
});

describe("aggregate", () => {
  const set: EvalSet = {
    name: "t",
    note: "",
    cases: [
      kase("clear", [gold()], "A"),
      kase("clear", [gold({ category: "health", sub: "doctor" })], "B"),
      kase("doubt", [gold()], "C"),
      kase("ask", [], "D"),
      kase("clear", [gold({ person: "محمد" })], "E"),
    ],
  };
  const results: CaseResult[] = [
    result("save", [predicted()], { id: "A", latencyMs: 100 }),
    result("save", [predicted({ flags: ["sub_repaired"] })], { id: "B", latencyMs: 200, reasons: [] }),
    result("show", [predicted({ flags: ["model_doubt:category"], reasons: ["model_doubt:category"] })], { id: "C", latencyMs: 300, retries: 2 }),
    result("ask", [], { id: "D", latencyMs: 400, reasons: ["model_asked"] }),
    result("ask", [], { id: "E", latencyMs: 500 }),
    result("save", [predicted()], { id: "Z" }),
  ];
  const { aggregate: a } = aggregate(set, results);

  it("computes G1 over saves and the other rates over all cases", () => {
    expect(a.cases).toBe(5);
    expect(a.unknownIds).toEqual(["Z"]);
    expect(a.outcomes).toEqual({ save: 2, show: 1, ask: 2 });
    expect(a.wrongAutoSave).toEqual({ count: 1, of: 2, rate: 0.5 });
    expect(a.noExtraTap).toEqual({ count: 1, of: 5, rate: 0.2 });
    expect(a.question).toEqual({ count: 2, of: 5, rate: 0.4 });
    expect(a.needlessQuestion.count).toBe(1);
    expect(a.rightQuestion.count).toBe(1);
    expect(a.showRight).toEqual({ count: 1, of: 1, rate: 1 });
    expect(a.byExpect.clear).toEqual({ save: 2, show: 0, ask: 1 });
  });

  it("field accuracies are over matched events; person only where the label names one", () => {
    expect(a.eventsMatched).toBe(3);
    expect(a.fields.category).toEqual({ count: 2, of: 3, rate: 2 / 3 });
    expect(a.fields.person.of).toBe(0);
    expect(a.missing).toBe(1);
  });

  it("latency, tokens, flags, reasons and confusion", () => {
    expect(a.latencyMs).toEqual({ p50: 300, p95: 500, max: 500 });
    expect(a.tokens.total).toEqual({ prompt: 5000, completion: 500, cached: 2000, total: 5500 });
    expect(a.tokens.perCase.prompt).toBe(1000);
    expect(a.retries).toBe(2);
    expect(a.flags).toEqual({ sub_repaired: 1, "model_doubt:category": 1 });
    expect(a.reasons).toEqual({ "model_doubt:category": 1, model_asked: 1 });
    expect(a.confusion).toEqual([{ gold: "health", predicted: "dining", ids: ["B"] }]);
  });
});

describe("helpers", () => {
  it("percentile is nearest-rank", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95)).toBe(19);
  });

  it("estimates cost from the published rate, cached tokens at the cached price", () => {
    // gemini-3.1-flash-lite: input 0.25, output 1.5, cached 0.0125 per million.
    const cost = estimateCostUsd("gemini-3.1-flash-lite", { prompt: 1_000_000, completion: 1_000_000, cached: 400_000 });
    expect(cost).toBeCloseTo(0.6 * 0.25 + 0.4 * 0.0125 + 1.5, 6);
    expect(estimateCostUsd("no-such-model", { prompt: 1, completion: 1, cached: 0 })).toBeNull();
  });
});
