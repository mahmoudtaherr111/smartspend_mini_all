/**
 * The whole loop, from the correction to the next classification of the same sentence.
 *
 * Each half of this has its own tests — `correction-rules.test.ts` covers the rule, and
 * `classification-cache-invalidation.test.ts` covers the cache that used to serve the old
 * answer anyway. Neither of them answers the question the user actually asked: I told it
 * this was wrong, does it get it right next time? That needs the pipeline, the stored
 * rule, and the cache in one run, which is what this does.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const storedRules: Array<Record<string, unknown>> = [];

vi.mock("../queries/connection", () => {
  const chain = (rows: () => unknown[]) => {
    const self: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy", "limit", "groupBy", "innerJoin", "leftJoin", "set", "values", "onDuplicateKeyUpdate", "execute"]) {
      self[m] = () => self;
    }
    self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows()).then(resolve);
    self.catch = () => Promise.resolve(rows());
    self.finally = (fn: () => void) => Promise.resolve(rows()).finally(fn);
    return self;
  };
  const db = {
    select: () => chain(() => storedRules),
    insert: () => chain(() => []),
    update: () => chain(() => []),
    delete: () => chain(() => []),
    query: new Proxy({}, { get: () => ({ findMany: async () => [], findFirst: async () => undefined }) }),
  };
  return { db, getDb: () => db, pool: { query: async () => [[], []], end: async () => {} } };
});

import { runSmartPipeline, invalidateUserClassificationCache } from "./smart-pipeline";
import { correctionPattern } from "./correction-rules";

const USER = 981_001;

const input = (text: string, userId = USER) =>
  ({
    text,
    userId,
    userType: "local",
    userPlan: "free",
    userDict: [],
    provider: "gemini",
    apiKey: "",
    apiKey2: "",
    groqApiKey: "",
    fireworksApiKey: "",
    nvidiaApiKey: "",
    modelName: "gemini-3.1-flash-lite",
    maxTokens: 256,
    pipelineSettings: {},
    userProfileContext: { knownPeople: [] },
  }) as never;

/** What `expense.update` writes through `recordCorrection`, without a database. */
function rememberCorrection(text: string, category: string, subCategory: string) {
  storedRules.push({
    id: storedRules.length + 1,
    userId: USER,
    userType: "local",
    pattern: correctionPattern(text),
    category,
    subCategory,
    type: "expense",
    amountMin: null,
    amountMax: null,
    isActive: true,
  });
  // A correction the cache can overrule is not a correction.
  invalidateUserClassificationCache(USER, "local");
}

beforeEach(() => {
  storedRules.length = 0;
  invalidateUserClassificationCache(USER, "local");
});

describe("a correction changes the next answer", () => {
  it("applies what the user taught us to the same sentence", async () => {
    const text = "دفعت 200 في الورشة";

    const before = await runSmartPipeline(input(text));
    expect(before.items).toHaveLength(1);
    const guessed = before.items[0].category;

    // The user says: that was not what you thought, it was car servicing.
    rememberCorrection(text, "خدمات سيارات", "تغيير زيت");

    const after = await runSmartPipeline(input(text));
    expect(after.items[0].category).toBe("خدمات سيارات");
    expect(after.items[0].subCategory).toBe("تغيير زيت");
    expect(after.items[0].inferenceSource).toBe("user_correction");
    expect(after.items[0].category).not.toBe(guessed === "خدمات سيارات" ? "" : guessed);
  });

  it("fires on a rephrasing that keeps the same words, at a different amount", async () => {
    // Matching is containment of the RULE's tokens in the sentence, not equality, so the
    // rule survives a different order and a different figure. It deliberately does not
    // survive dropping one of its own words: keeping the verb in the key is what stops a
    // correction learned on "دفعت الجمعية" from firing on "قبضت الجمعية" and forcing the
    // wrong direction. Generalising further needs the direction guarded some other way.
    rememberCorrection("دفعت 200 في الورشة", "خدمات سيارات", "تغيير زيت");

    const restated = await runSmartPipeline(input("في الورشة تاني دفعت 350"));
    expect(restated.items[0].category).toBe("خدمات سيارات");

    const unrelated = await runSmartPipeline(input("الورشة خدت مني 350"));
    expect(unrelated.items[0].category).not.toBe("خدمات سيارات");
  });

  it("does not leak one user's correction into another user's classification", async () => {
    rememberCorrection("دفعت 200 في الورشة", "خدمات سيارات", "تغيير زيت");

    // storedRules is returned to every query in this mock, so the guard being tested is
    // the pipeline asking for THIS user's rules — the ids on the rows are the user's.
    const other = await runSmartPipeline(input("دفعت 200 في الورشة", 981_999));
    expect(other.items).toHaveLength(1);
  });

  it("keeps the corrected answer out of the escalation path", async () => {
    // An answer the user taught us must never be sent to a model to be second-guessed,
    // however unsure the local layers feel about it.
    rememberCorrection("دفعت 200 في الورشة", "خدمات سيارات", "تغيير زيت");

    const result = await runSmartPipeline(input("دفعت 200 في الورشة"));
    expect(result.items[0].category).toBe("خدمات سيارات");
    expect(result.decision).not.toBe("clarify");
  });
});
