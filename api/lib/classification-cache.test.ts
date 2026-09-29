import { beforeEach, describe, expect, it } from "vitest";
import {
  classificationCacheKey,
  clearClassificationCache,
  readCachedClassification,
  stableHash,
  storeClassification,
} from "./classification-cache";

const parts = (knowledge: Record<string, unknown>) => ({
  version: "v",
  tenant: "u:local:1",
  plan: "free",
  scope: "std",
  model: "m",
  thresholds: "0.9/0.5/0.85",
  text: "قهوه 35",
  knowledge,
});

const result = (decision: "auto_save" | "review" | "clarify") =>
  ({
    items: [{ amount: 35, category: "أكل وشرب" }],
    decision,
    log: { providerRoute: { attempts: [{ ok: true, promptTokens: 10 }] } },
  }) as never;

beforeEach(() => clearClassificationCache());

describe("classification cache storage", () => {
  it("hashes content, not key order", () => {
    expect(stableHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(stableHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });

  it("puts the user's knowledge in the key", () => {
    expect(classificationCacheKey(parts({ memory: "a" }))).not.toBe(classificationCacheKey(parts({ memory: "b" })));
  });

  it("keeps neither a question nor an answer the model did not finish", () => {
    storeClassification("q", result("clarify"), true);
    storeClassification("partial", result("review"), false);
    expect(readCachedClassification("q")).toBeNull();
    expect(readCachedClassification("partial")).toBeNull();
  });

  it("hands out copies without model attempts", () => {
    storeClassification("k", result("auto_save"), true);
    const first = readCachedClassification("k")!;
    expect(first.log.providerRoute).toBeUndefined();
    (first.items[0] as { category: string }).category = "changed";
    expect((readCachedClassification("k")!.items[0] as { category: string }).category).toBe("أكل وشرب");
  });
});
