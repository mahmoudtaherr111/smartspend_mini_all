import { describe, it, expect } from "vitest";
import {
  CATEGORY_IDS,
  CATEGORY_CLASSIFIER_SCHEMA,
  buildFullTaxonomy,
  resolveSubcategory,
  validateClassifierReply,
} from "./classifier-contract";
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  buildClassificationUserPrompt,
} from "./classification-prompt";
import { CATEGORIES } from "./category-registry";

describe("classifier contract", () => {
  it("offers every category, not a filtered subset", () => {
    // The old prompt showed 11 of 26. An answer outside those 11 was unreachable: the
    // model was told to choose "literally from the attached taxonomy only", and the
    // right answer was not in it.
    expect(CATEGORY_IDS).toHaveLength(CATEGORIES.length);
    expect(CATEGORY_IDS).toContain("food");
    expect(CATEGORY_IDS).toContain("home");
    expect(CATEGORY_IDS).toContain("investment");
  });

  it("does not contradict itself the way the old prompt did", () => {
    // Rule 4 of the old prompt forbade categories its own worked examples used —
    // أكل وشرب, استثمار and سكن were all demonstrated and all filtered out.
    const taxonomy = buildFullTaxonomy();
    for (const shown of ["أكل وشرب", "استثمار", "سكن", "مواصلات", "فواتير"]) {
      expect(taxonomy, `${shown} must be offered`).toContain(shown);
    }
  });

  it("constrains the category field to real ids", () => {
    const field = (CATEGORY_CLASSIFIER_SCHEMA.properties.items.items.properties as never as {
      category: { enum: string[] };
    }).category;
    expect(field.enum).toEqual([...CATEGORY_IDS]);
  });

  it("has no field for the things the model is worse at", () => {
    // Removing the field is stronger than instructing against it: what does not exist
    // cannot be filled in wrongly. Segmentation, amount, direction and confidence are
    // all measured better locally.
    const props = CATEGORY_CLASSIFIER_SCHEMA.properties.items.items.properties as Record<
      string,
      unknown
    >;
    for (const gone of ["amount", "type", "confidence", "reasoning", "decomposed_sentences"]) {
      expect(props[gone], `${gone} must not be requested`).toBeUndefined();
    }
  });
});

describe("validating what comes back", () => {
  it("accepts a well-formed reply", () => {
    const r = validateClassifierReply(
      { items: [{ i: 1, category: "food", sub: "مطعم" }] },
      3,
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].category).toBe("food");
    expect(r.problems).toHaveLength(0);
  });

  it("repairs a category named in Arabic instead of by id", () => {
    // Only Gemini enforces the enum. NVIDIA strips response_format on a 400 and answers
    // anyway, so a valid answer in the wrong notation has to be recovered, not discarded.
    const r = validateClassifierReply({ items: [{ i: 1, category: "أكل وشرب" }] }, 1);
    expect(r.items[0].category).toBe("food");
    expect(r.problems[0]).toContain("repaired");
  });

  it("drops an invented category rather than storing it", () => {
    const r = validateClassifierReply({ items: [{ i: 1, category: "zzz_not_a_thing" }] }, 1);
    expect(r.items).toHaveLength(0);
    expect(r.problems[0]).toContain("not a category");
  });

  it("drops an answer for a clause that does not exist", () => {
    // An index past the end is the model inventing a transaction. Dropping it is safe
    // now in a way it never was: the amount was never the model's to give, so the clause
    // keeps its local answer instead of vanishing.
    const r = validateClassifierReply({ items: [{ i: 7, category: "food" }] }, 3);
    expect(r.items).toHaveLength(0);
    expect(r.problems[0]).toContain("out-of-range");
  });

  it("keeps only the first answer when the model splits one clause into two", () => {
    const r = validateClassifierReply(
      {
        items: [
          { i: 1, category: "food", sub: "مطعم" },
          { i: 1, category: "transport" },
        ],
      },
      1,
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].category).toBe("food");
    expect(r.problems[0]).toContain("duplicate");
  });

  it("survives a reply that is not the shape we asked for", () => {
    expect(validateClassifierReply(null, 2).items).toEqual([]);
    expect(validateClassifierReply({ items: "nope" }, 2).items).toEqual([]);
    expect(validateClassifierReply({}, 2).problems[0]).toContain("no items array");
  });

  it("returns answers in clause order however they arrive", () => {
    const r = validateClassifierReply(
      { items: [{ i: 3, category: "food" }, { i: 1, category: "transport" }] },
      3,
    );
    expect(r.items.map((x) => x.i)).toEqual([1, 3]);
  });
});

describe("subcategory resolution", () => {
  it("matches an exact subcategory", () => {
    expect(resolveSubcategory("food", "مطعم")).toBe("مطعم");
  });

  it("falls back inside the chosen category, never outside it", () => {
    const resolved = resolveSubcategory("food", "حاجة مش موجودة");
    const foodSubs = CATEGORIES.find((c) => c.id === "food")!.subcategories.map(
      (s) => s.name_ar,
    );
    expect(foodSubs).toContain(resolved);
  });

  it("keeps a person's name verbatim for person categories", () => {
    // These carry an individual's name, not a taxonomy value — matching it against a
    // subcategory list would replace the person with a category.
    expect(resolveSubcategory("friends_transactions", "مروان صاحبك")).toBe("مروان صاحبك");
  });

  it("does not invent a subcategory for an unknown category", () => {
    expect(resolveSubcategory("no_such_category", "أي حاجة")).toBe("عام");
  });
});

describe("the prompt itself", () => {
  const ctx = {
    clauses: [
      { index: 1, text: "فطرت بـ 50", amount: 50, direction: "expense" as const },
      { index: 2, text: "قبضت 5000", amount: 5000, direction: "income" as const },
    ],
  };

  it("states amount and direction as settled, so they are not re-derived", () => {
    const user = buildClassificationUserPrompt(ctx);
    expect(user).toContain("50 جنيه · مصروف");
    expect(user).toContain("5000 جنيه · دخل");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("محسومة");
  });

  it("never asks the model to segment", () => {
    // The instruction that cost the most: our decomposer is 100% exact on monologues,
    // the model 0%, and we were paying to be told the wrong answer.
    expect(CLASSIFICATION_SYSTEM_PROMPT).not.toContain("decomposed_sentences");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("لا تحسبها ولا تراجعها");
  });

  it("demands exactly one answer per clause", () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("لا أكثر ولا أقل");
  });

  it("keeps the system half free of request-specific text, so it can be cached", () => {
    // The old "system" prompt embedded a taxonomy computed from the user's own sentence,
    // so it changed every request and no provider could cache any of it.
    const a = CLASSIFICATION_SYSTEM_PROMPT;
    expect(a).not.toContain("فطرت");
    expect(a).not.toContain("5000");
  });

  it("treats user history as a tie-breaker, never as a filter", () => {
    const user = buildClassificationUserPrompt({
      ...ctx,
      frequentCategories: ["أكل وشرب", "مواصلات"],
    });
    expect(user).toContain("ترجيح عند التساوي");
    expect(user).toContain("كل الفئات متاحة");
  });

  it("costs less than the prompt it replaces while showing more categories", () => {
    const user = buildClassificationUserPrompt(ctx);
    // The old system prompt measured 1926 tokens and offered 11 categories; this one is
    // static (so cacheable) and offers all 26.
    expect(CLASSIFICATION_SYSTEM_PROMPT.length * 0.5).toBeLessThan(1600);
    expect(user.length * 0.5).toBeLessThan(200);
  });
});
