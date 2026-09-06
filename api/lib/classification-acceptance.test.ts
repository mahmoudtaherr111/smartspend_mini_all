/**
 * A1 acceptance: nothing writes to the ledger without earning it.
 *
 * Every case here is an artefact of the classification audit
 * (docs/reviews/2026-09-05-expense-classification-audit.md, section 8) reproduced
 * against the real entry point. They are grouped by the claim they defend, not by the
 * module they touch, because each of these bugs was invisible in its own module and
 * only appeared where two layers met.
 *
 * The rules this file follows, so a green run means something:
 *   - The pipeline is driven through `runSmartPipeline`, never through a helper. A fix
 *     in an uncalled function is not a fix.
 *   - Only the process boundary is mocked — the provider, the database, the learned
 *     patterns. The decision, merge and calibration logic under test always runs.
 *   - No assertion matches the input text. A regex tuned to these sentences would pass
 *     while the system stayed broken for the next one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSmartPipeline, type PipelineInput } from "./smart-pipeline";
import { mapModelName } from "./model-mapper";
import { validateClassifierReply } from "./classifier-contract";
import { mergeCategoryDecisions } from "./classification-merge";
import { applyCalibration } from "./confidence-calibrator";
import { verifyClassifiedItems } from "./post-classifier-verifier";
import { decidePerItem, gateShortcutResult } from "./final-acceptance";
import { emptyEvidence } from "./classification-evidence";
import type { ParsedTransaction } from "./rule-engine";
import type { DecomposedSegment } from "./narrative-decomposer";

const io = vi.hoisted(() => ({ llm: vi.fn(), memory: vi.fn() }));

vi.mock("../queries/connection", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    from: self,
    where: self,
    orderBy: self,
    values: self,
    set: self,
    limit: async () => [],
    then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
  });
  return { db: { select: self, insert: self, update: self, query: {} }, pool: {} };
});
vi.mock("./muscle-memory", () => ({ muscleMemoryLookup: io.memory }));
vi.mock("./ai-gateway", () => ({
  resolveAdminRoutes: async () => ({ preferred: null, routes: [] }),
}));
vi.mock("./llm-router", async (original) => ({
  ...(await original<object>()),
  executeLlmChain: io.llm,
}));

/** Fresh user id per call so the in-process result cache cannot answer for us. */
let userId = 960_000;
function classify(text: string, overrides: Partial<PipelineInput> = {}) {
  return runSmartPipeline({
    text,
    userId: ++userId,
    userType: "local",
    userPlan: "pro",
    userDict: [],
    apiKey: "synthetic-key",
    modelName: mapModelName("flash"),
    maxTokens: 512,
    ...overrides,
  });
}

function modelAnswers(items: unknown[]) {
  return {
    text: JSON.stringify({ items }),
    totalTokens: 80,
    cachedTokens: 0,
    attempts: [{ slug: "test", model: mapModelName("flash"), ok: true, latencyMs: 3 }],
    route: { slug: "test", model: mapModelName("flash") },
    degradedSchema: false,
  };
}

/** The prompt actually sent to a provider on the Nth call. */
function promptOf(call = 0): string {
  return String(io.llm.mock.calls[call]?.[1]?.userPrompt ?? "");
}

const BUSINESS_MATERIALS = [
  {
    id: 1,
    name: "materials",
    nameAr: "خامات",
    type: "expense",
    keywords: ["خامات"],
    matchExamples: [],
  },
];

function item(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    amount: 100,
    category: "أكل وشرب",
    subCategory: "مطعم",
    description: "أكل",
    type: "expense",
    confidence: 95,
    currency: "EGP",
    needsReview: false,
    parsedBy: "rule_engine",
    ...overrides,
  };
}

function clause(text: string, localItems: ParsedTransaction[], clauseId: number) {
  const segment: DecomposedSegment = {
    text,
    amount: null,
    direction: "expense",
    linkedVerb: null,
    personMentioned: null,
    segmentIndex: clauseId - 1,
  };
  return { segment, localItems, clauseId };
}

beforeEach(() => {
  io.memory.mockReset().mockResolvedValue(null);
  io.llm.mockReset().mockRejectedValue(new Error("no provider configured for this test"));
});

// ───────────────────────── 1 & 2. The clause flow ─────────────────────────

describe("A1.3 — what reaches the provider", () => {
  it("escalates a single sentence with its own content, not an empty clause list", async () => {
    io.llm.mockResolvedValue(modelAnswers([{ i: 1, category: "shopping", sub: "عام" }]));

    const result = await classify("دفعت 120 عمل غريب");

    expect(io.llm).toHaveBeenCalledTimes(1);
    const prompt = promptOf();
    // The defect: the un-segmented branch filled the salvage lists and never the clause
    // list, so the prompt asked the model to categorise nothing.
    expect(prompt).not.toContain("0 جملة");
    expect(JSON.parse(prompt).clauses).toHaveLength(1);
    expect(prompt).toContain("120");
    expect(prompt).toContain("عمل غريب");
    // And the answer is usable: index 1 of 1 clause is in range, so it lands.
    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount).toBe(120);
  });

  it("makes zero provider attempts when there is nothing to ask about", async () => {
    io.llm.mockResolvedValue(modelAnswers([{ i: 1, category: "food" }]));

    // Non-financial: the admissibility gate ends the request before any clause exists.
    const result = await classify("فكرني اكلم ماما بكرة الساعة خمسة");

    expect(io.llm).not.toHaveBeenCalled();
    expect(result.tokensUsed).toBe(0);
    expect(result.actualModelUsed).toBeNull();
    expect(result.decision).toBe("clarify");
  });

  it("never sends a request whose clause count is zero", async () => {
    io.llm.mockResolvedValue(modelAnswers([]));

    const texts = [
      "دفعت 120 عمل غريب",
      "صرفت 250 على حاجة مش عارف اسمها",
      "دفعت 200 بنزين",
    ];
    for (const text of texts) {
      io.llm.mockClear();
      await classify(text);
      for (let i = 0; i < io.llm.mock.calls.length; i++) {
        expect(promptOf(i), `"${text}" must not ask for 0 clauses`).not.toContain("0 جملة");
      }
    }
  });

  it("keeps narrative order when only part of the sentence used the model", async () => {
    io.llm.mockResolvedValue(modelAnswers([{ i: 1, category: "shopping", sub: "عام" }]));

    const result = await classify("دفعت 250 لحاجة مجهولة وبعدين دفعت 200 بنزين");

    // Model-answered clauses used to be appended after locally-accepted ones, so the
    // review screen showed the second transaction first.
    expect(result.items.map((x) => x.amount)).toEqual([250, 200]);
    const ids = result.items.map((x) => x.sourceEventId);
    expect(ids[0]).toBeLessThan(ids[1] as number);
  });
});

// ───────────────────────── 3. Business scope ─────────────────────────

describe("A1.2 — business scoring may not hijack a personal entry", () => {
  it("ignores business categories when business mode is off", async () => {
    const result = await classify("دفعت 200 بنزين", {
      businessMode: false,
      businessId: 7,
      businessCategories: [
        { id: 1, name: "fuel", nameAr: "بنزين", type: "expense", keywords: ["بنزين"], matchExamples: [] },
      ],
    });

    expect(result.items[0].category).toBe("مواصلات");
    expect(result.items[0].businessId).toBeUndefined();
    expect(result.log.routing?.route).not.toBe("business_scoring");
  });

  it("does not auto-save a negated business purchase", async () => {
    const result = await classify("ماشتريتش خامات ب500", {
      businessMode: true,
      businessId: 7,
      businessCategories: BUSINESS_MATERIALS,
    });

    expect(result.decision).not.toBe("auto_save");
    expect(result.items).toEqual([]);
  });

  it("does not answer for a two-transaction sentence with the first amount only", async () => {
    io.llm.mockResolvedValue(modelAnswers([{ i: 1, category: "business" }]));

    const result = await classify("دفعت 500 خامات و300 معدات", {
      businessMode: true,
      businessId: 7,
      businessCategories: [
        ...BUSINESS_MATERIALS,
        { id: 2, name: "equipment", nameAr: "معدات", type: "expense", keywords: ["معدات"], matchExamples: [] },
      ],
    });

    // The shortcut used to return one 500 item at confidence 100 and lose the 300
    // entirely, with the ledger never consulted.
    expect(result.log.routing?.route).not.toBe("business_scoring");
    const accounted = result.items.reduce((sum, x) => sum + x.amount, 0);
    if (result.decision === "auto_save") {
      expect(accounted).toBe(800);
    } else {
      expect(result.decision).not.toBe("auto_save");
    }
  });

  it("does not turn money received into money spent because the category is filed as an expense", async () => {
    const result = await classify("قبضت 500 خامات", {
      businessMode: true,
      businessId: 7,
      businessCategories: BUSINESS_MATERIALS,
    });

    // Direction is governed by the verb. It may end up in review, but it may never be
    // silently recorded as an expense.
    const recordedAsExpense =
      result.decision === "auto_save" && result.items.some((x) => x.type === "expense");
    expect(recordedAsExpense).toBe(false);
  });

  it("still recognises a plain business expense in business mode (positive control)", async () => {
    const result = await classify("دفعت 500 خامات", {
      businessMode: true,
      businessId: 7,
      businessCategories: BUSINESS_MATERIALS,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ amount: 500, type: "expense" });
    expect(io.llm).not.toHaveBeenCalled();
    expect(result.tokensUsed).toBe(0);
  });
});

// ───────────────────────── 4. No resurrection ─────────────────────────

describe("A1.2 — a transaction that did not happen stays gone", () => {
  it("does not let a category answer revive a negated purchase", async () => {
    io.llm.mockResolvedValue(modelAnswers([{ i: 1, category: "shopping", sub: "عام" }]));

    const result = await classify("ماشتريتش جزمة ب500 ودفعت 200 بنزين");

    expect(result.items.map((x) => x.amount)).toEqual([200]);
    // The rejected clause is not a clause: it is never offered to the model at all.
    expect(io.llm).not.toHaveBeenCalled();
  });

  it("does not let a remembered pattern speak for a sentence it only partly matches", async () => {
    io.memory.mockResolvedValue({
      matchScore: 100,
      amount: 500,
      pattern: { category: "تسوق", subCategory: "عام", type: "expense", confidence: 100 },
    });

    const result = await classify("ماشتريتش جزمة ب500 ودفعت 200 بنزين");

    expect(result.items.map((x) => [x.amount, x.category])).toEqual([[200, "مواصلات"]]);
    expect(result.log.routing?.route).not.toBe("muscle_memory");
  });

  it("keeps a learned pattern that does account for the whole sentence (positive control)", async () => {
    io.memory.mockResolvedValue({
      matchScore: 100,
      amount: 200,
      pattern: { category: "مواصلات", subCategory: "بنزين", type: "expense", confidence: 96 },
    });

    const result = await classify("دفعت 200 بنزين");

    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount).toBe(200);
    expect(io.llm).not.toHaveBeenCalled();
  });
});

// ───────────────────────── 5 & 6. Calibration ─────────────────────────

describe("A1.4 — confidence follows the answer it is about", () => {
  it("drops the calibration of a category the model replaced", () => {
    const strongRule = item({
      confidence: 95,
      evidence: { ...emptyEvidence("verb_noun_regex", 95), anchorConsumed: true },
      calibration: { signature: "stale-signature", support: 33, probability: 0.95 },
      ambiguityFlags: ["calibrated:strong_rule:single:n=33"],
    });

    const merged = mergeCategoryDecisions(
      [clause("دفعت 100 أكل", [strongRule], 1)],
      [{ i: 1, category: "health", sub: "عام" }],
    );

    const moved = merged.items[0];
    expect(moved.category).not.toBe("أكل وشرب");
    // The old estimate priced the OLD category. Carrying it forward is how a 95 from a
    // strong rule ended up authorising an answer the strong rule never gave.
    expect(moved.calibration).toBeUndefined();
    expect(moved.ambiguityFlags?.some((f) => f.startsWith("calibrated:"))).toBe(false);
    // Layers disagreed, and that disagreement is recorded rather than smoothed away.
    expect(moved.evidence?.disagreement).toBe(1);
    expect(moved.evidence?.agreement).toBe(0);
    expect(moved.needsReview).toBe(true);
  });

  it("prices the replacement from its own evidence, not the old score", () => {
    const strongRule = item({
      confidence: 95,
      evidence: { ...emptyEvidence("verb_noun_regex", 95), anchorConsumed: true },
      calibration: { signature: "stale-signature", support: 33, probability: 0.95 },
    });
    const merged = mergeCategoryDecisions(
      [clause("دفعت 100 أكل", [strongRule], 1)],
      [{ i: 1, category: "health", sub: "عام" }],
    );

    const recalibrated = applyCalibration(merged.items);
    expect(recalibrated.items[0].calibration?.signature).toBeDefined();
    expect(recalibrated.items[0].calibration?.signature).not.toBe("stale-signature");
    expect(recalibrated.items[0].ambiguityFlags?.join(" ")).toContain("calibrated:model:");
  });

  it("keeps an unpriced item unpriced however many times calibration runs", () => {
    // `exact:single` has no observations in the shipped table, so its probability is the
    // corpus prior. Running calibration twice used to report unpriced 1 then 0, which
    // turned an unmeasured path into an auto-saveable one on the second pass.
    const unpriced = item({
      evidence: { ...emptyEvidence("user_dictionary", 95), anchorConsumed: true },
    });

    const first = applyCalibration([unpriced]);
    expect(first.unpriced).toBe(1);

    const second = applyCalibration(first.items);
    expect(second.unpriced).toBe(1);

    const third = applyCalibration(second.items);
    expect(third.unpriced).toBe(1);
  });

  it("refuses auto-save for an item whose probability was never measured", () => {
    const unpriced = applyCalibration([
      item({ evidence: { ...emptyEvidence("user_dictionary", 95), anchorConsumed: true } }),
    ]);

    const outcome = decidePerItem(unpriced.items, {
      amountsFullyConsumed: true,
      needsAnswer: false,
    });
    expect(outcome.decision).not.toBe("auto_save");
  });

  it("does not let a shortcut skip the unpriced condition", () => {
    const gate = gateShortcutResult({
      items: [
        item({
          amount: 200,
          confidence: 100,
          evidence: { ...emptyEvidence("user_dictionary", 100), anchorConsumed: true },
        }),
      ],
      text: "دفعت 200 أكل",
    });

    expect(gate.admitted).toBe(true);
    expect(gate.decision).not.toBe("auto_save");
  });
});

// ───────────────────────── 7. Group confidence ─────────────────────────

describe("A1.4 — a group is as saveable as its weakest member", () => {
  const priced = (confidence: number) =>
    item({
      confidence,
      calibration: { signature: `sig-${confidence}`, support: 40, probability: confidence / 100 },
    });

  it("does not auto-save a group because the mean clears the line", () => {
    // 82, 87, 90 → mean 86.3, which cleared an 85 threshold while an item at 82 did not.
    const outcome = decidePerItem([priced(82), priced(87), priced(90)], {
      amountsFullyConsumed: true,
      needsAnswer: false,
      thresholds: { autoSave: 0.85, review: 0.5, escalate: 0.85 },
    });

    expect(outcome.decision).toBe("review");
    expect(outcome.weakestConfidence).toBe(82);
  });

  it.each([
    [{ autoSave: 0.85, review: 0.5, escalate: 0.85 }, [90, 92, 95], "auto_save"],
    [{ autoSave: 0.85, review: 0.5, escalate: 0.85 }, [84, 99, 99], "review"],
    [{ autoSave: 0.9, review: 0.5, escalate: 0.85 }, [88, 95, 97], "review"],
    [{ autoSave: 0.9, review: 0.5, escalate: 0.85 }, [91, 95, 97], "auto_save"],
    [{ autoSave: 0.7, review: 0.5, escalate: 0.7 }, [72, 99, 99], "auto_save"],
  ])("holds at threshold %o for scores %o", (thresholds, scores, expected) => {
    const outcome = decidePerItem(scores.map(priced), {
      amountsFullyConsumed: true,
      needsAnswer: false,
      thresholds,
    });
    expect(outcome.decision).toBe(expected);
  });

  it("saves a single confident item on its own merits (positive control)", () => {
    const outcome = decidePerItem([priced(96)], {
      amountsFullyConsumed: true,
      needsAnswer: false,
      thresholds: { autoSave: 0.9, review: 0.5, escalate: 0.85 },
    });
    expect(outcome.decision).toBe("auto_save");
  });

  it("blocks the whole group when one amount found no owner", () => {
    const outcome = decidePerItem([priced(99), priced(99)], {
      amountsFullyConsumed: false,
      needsAnswer: false,
    });
    expect(outcome.decision).toBe("clarify");
  });
});

// ───────────────────────── 8. Sticky blockers ─────────────────────────

describe("A1.4 — a blocker survives every later layer", () => {
  it("is not cleared by a verifier that has no objection of its own", () => {
    const blocked = item({
      confidence: 95,
      needsReview: true,
      reviewReasons: ["category_reply_unresolved"],
    });

    const verified = verifyClassifiedItems([blocked], "دفعت 100 أكل");

    expect(verified.items[0].needsReview).toBe(true);
    expect(verified.items[0].reviewReasons).toContain("category_reply_unresolved");
  });

  it("still lets the verifier raise a blocker of its own", () => {
    const clean = item({ confidence: 40 });
    const verified = verifyClassifiedItems([clean], "دفعت 100 أكل");
    expect(verified.items[0].needsReview).toBe(true);
  });

  it("leaves a clean, confident item alone (positive control)", () => {
    const clean = item({ confidence: 96 });
    const verified = verifyClassifiedItems([clean], "دفعت 100 أكل");
    expect(verified.items[0].needsReview).toBe(false);
  });

  it("is not cleared by the merge losing an answer", () => {
    const blocked = item({ needsReview: true, reviewReasons: ["amount_unattached"] });
    const merged = mergeCategoryDecisions([clause("حاجة", [blocked], 1)], []);
    expect(merged.items[0].reviewReasons).toEqual(
      expect.arrayContaining(["amount_unattached", "category_reply_unresolved"]),
    );
  });

  it("is not cleared by a later category rescue", async () => {
    io.llm.mockResolvedValue(modelAnswers([]));
    const result = await classify("صرفت 250 على حاجة غريبة مش عارف اسمها");
    for (const row of result.items) {
      if (row.reviewReasons && row.reviewReasons.length > 0) {
        expect(row.needsReview).toBe(true);
      }
    }
    expect(result.decision).not.toBe("auto_save");
  });
});

// ───────────────────────── 9. Reply robustness ─────────────────────────

describe("A1.5 — the model reply contract", () => {
  it.each([
    ["null", null],
    ["an empty object", {}],
    ["an empty array", []],
    ["items: null", { items: null }],
    ["items: a string", { items: "nope" }],
    ["a null row", { items: [null] }],
    ["a string row", { items: ["food"] }],
    ["a number row", { items: [7] }],
    ["a row with no index", { items: [{ category: "food" }] }],
    ["a row with no category", { items: [{ i: 1 }] }],
    ["an invented category", { items: [{ i: 1, category: "zzz_not_a_thing" }] }],
    ["an out-of-range index", { items: [{ i: 9, category: "food" }] }],
    ["a zero index", { items: [{ i: 0, category: "food" }] }],
    ["a negative index", { items: [{ i: -1, category: "food" }] }],
    ["a fractional index", { items: [{ i: 1.5, category: "food" }] }],
    ["duplicate indices", { items: [{ i: 1, category: "food" }, { i: 1, category: "transport" }] }],
    ["an unexpected person field", { items: [{ i: 1, category: "food", person: "مروان" }] }],
    ["an incompatible subcategory", { items: [{ i: 1, category: "food", sub: "بنزين" }] }],
  ])("survives %s without inventing a fact", (_label, raw) => {
    const result = validateClassifierReply(raw, 2);

    expect(Array.isArray(result.items)).toBe(true);
    for (const row of result.items) {
      expect(Number.isInteger(row.i)).toBe(true);
      expect(row.i).toBeGreaterThanOrEqual(1);
      expect(row.i).toBeLessThanOrEqual(2);
      expect(typeof row.category).toBe("string");
    }
    // Every incomplete reply says so; nothing is silently treated as complete.
    if (result.items.length < 2) expect(result.problems.length).toBeGreaterThan(0);
  });

  it("drops an invalid category instead of resolving it by substring", () => {
    // "business" is not a category. It contains "bus", which is an alias of transport,
    // so the free-text resolver answered مواصلات and the invented category became a
    // real one nobody chose.
    const result = validateClassifierReply({ items: [{ i: 1, category: "business" }] }, 1);
    expect(result.items).toHaveLength(0);
    expect(result.problems[0]).toContain("not a category");
  });

  it("still repairs a category the model named in Arabic (positive control)", () => {
    const result = validateClassifierReply({ items: [{ i: 1, category: "أكل وشرب" }] }, 1);
    expect(result.items[0].category).toBe("food");
    expect(result.problems[0]).toContain("repaired");
  });

  it("does not promote a model-named person into a recorded fact", () => {
    const validated = validateClassifierReply(
      { items: [{ i: 1, category: "family", sub: "أخي", person: "شخص مخترع" }] },
      1,
    );
    const merged = mergeCategoryDecisions(
      [clause("حولت 500 لحد", [item({ amount: 500, category: "أصدقاء" })], 1)],
      validated.items,
    );

    expect(merged.items[0].person_mentioned).toBeUndefined();
    expect(merged.items[0].needsReview).toBe(true);
  });

  it("falls back to the neutral subcategory rather than the first plausible one", () => {
    const merged = mergeCategoryDecisions(
      [clause("دفعت 100 حاجة", [item({ category: "متنوعات" })], 1)],
      [{ i: 1, category: "food" }],
    );
    expect(merged.items[0].subCategory).toBe("عام");
  });

  it("does not drop the other clauses when one answer is missing", () => {
    const merged = mergeCategoryDecisions(
      [
        clause("حاجة أولى", [item({ amount: 100 })], 1),
        clause("حاجة تانية", [item({ amount: 200 })], 2),
      ],
      [{ i: 2, category: "transport" }],
    );

    expect(merged.items.map((x) => x.amount)).toEqual([100, 200]);
    expect(merged.unansweredClauseIds).toEqual([1]);
    expect(merged.items[0].reviewReasons).toContain("category_reply_unresolved");
  });

  it("reports a clause with no extracted event instead of fabricating one", () => {
    const merged = mergeCategoryDecisions(
      [clause("حاجة مالهاش مبلغ", [], 1)],
      [{ i: 1, category: "food" }],
    );

    expect(merged.items).toEqual([]);
    expect(merged.unresolvedClauseIds).toEqual([1]);
  });

  it("does not let an invalid reply become a silent save through the pipeline", async () => {
    io.llm.mockResolvedValue({
      text: "this is not json at all",
      totalTokens: 40,
      cachedTokens: 0,
      attempts: [{ slug: "test", model: mapModelName("flash"), ok: true, latencyMs: 2 }],
      route: { slug: "test", model: mapModelName("flash") },
      degradedSchema: true,
    });

    const result = await classify("دفعت 250 لحاجة مجهولة");
    expect(result.decision).not.toBe("auto_save");
  });
});

// ───────────────────────── 11 & 12. Controls ─────────────────────────

describe("A1 — safety was not bought by refusing everything", () => {
  it.each([
    ["دفعت ٢٠٠ جنيه بنزين", 200, "مواصلات"],
    ["دفعت 200 جنيه بنزين", 200, "مواصلات"],
    ["بنزين ب 200 جنيه", 200, "مواصلات"],
    ["جبت أكل للبيت بمية وخمسين", 150, "أكل وشرب"],
    ["اشتريت أكل للبيت ب150", 150, "أكل وشرب"],
  ])("classifies %s locally and completely", async (text, amount, category) => {
    const result = await classify(text);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ amount, category, type: "expense" });
    // Local evidence is sufficient here — paying a model for it is a cost regression.
    expect(io.llm).not.toHaveBeenCalled();
    expect(result.tokensUsed).toBe(0);
  });

  it("still auto-saves at least one ordinary transaction", async () => {
    const outcomes = await Promise.all(
      ["دفعت 200 بنزين", "دفعت 150 أكل", "دفعت 100 مواصلات"].map((t) => classify(t)),
    );
    expect(outcomes.some((r) => r.decision === "auto_save")).toBe(true);
  });

  it("does not answer every sentence with a question", async () => {
    const outcomes = await Promise.all(
      ["دفعت 200 بنزين", "دفعت 150 أكل", "دفعت 80 قهوة"].map((t) => classify(t)),
    );
    expect(outcomes.every((r) => r.decision === "clarify")).toBe(false);
  });

  it("gives the same answer for the same meaning across wordings and numerals", async () => {
    const variants = ["دفعت 200 بنزين", "دفعت ٢٠٠ بنزين", "بنزين 200", "صرفت 200 على بنزين"];
    const results = await Promise.all(variants.map((t) => classify(t)));

    for (const [index, result] of results.entries()) {
      expect(result.items, variants[index]).toHaveLength(1);
      expect(result.items[0].amount, variants[index]).toBe(200);
      expect(result.items[0].type, variants[index]).toBe("expense");
    }
    const categories = new Set(results.map((r) => r.items[0].category));
    expect(categories.size, `categories diverged: ${[...categories].join(", ")}`).toBe(1);
  });

  it("scales with the value rather than matching it", async () => {
    for (const amount of [50, 200, 1250]) {
      const result = await classify(`دفعت ${amount} بنزين`);
      expect(result.items[0].amount).toBe(amount);
      expect(result.items[0].category).toBe("مواصلات");
    }
  });
});
