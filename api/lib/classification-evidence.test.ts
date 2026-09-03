import { describe, it, expect } from "vitest";
import {
  bucketKey,
  buildReliabilityTable,
  calibrate,
  emptyEvidence,
  matchFamily,
  type Evidence,
} from "./classification-evidence";

const ev = (over: Partial<Evidence>): Evidence => ({ ...emptyEvidence(), ...over });

describe("classification evidence and calibration", () => {
  it("groups match kinds into families that behave alike", () => {
    expect(matchFamily("user_dictionary")).toBe("exact");
    expect(matchFamily("merchant_registry")).toBe("exact");
    expect(matchFamily("subcat_trigram")).toBe("strong_rule");
    expect(matchFamily("subcat_bigram")).toBe("weak_rule");
    expect(matchFamily("fuzzy")).toBe("weak");
    expect(matchFamily("llm")).toBe("model");
  });

  it("separates corroborated, disputed and ambiguous evidence", () => {
    expect(bucketKey(ev({ matchKind: "subcat_trigram" }))).toBe("strong_rule:single");
    expect(bucketKey(ev({ matchKind: "subcat_trigram", agreement: 1 }))).toBe(
      "strong_rule:corroborated",
    );
    expect(bucketKey(ev({ matchKind: "subcat_trigram", disagreement: 1 }))).toBe(
      "strong_rule:disputed",
    );
    // Ambiguity outranks the rest: a word with several readings is the dominant fact.
    expect(
      bucketKey(ev({ matchKind: "subcat_trigram", agreement: 2, hasAmbiguityPenalty: true })),
    ).toBe("strong_rule:ambiguous");
  });

  it("falls back to the raw score when no table is loaded", () => {
    const r = calibrate(ev({ matchKind: "fuzzy", rawStrength: 55 }), null);
    expect(r.probability).toBeCloseTo(0.55, 2);
    expect(r.fellBackToPrior).toBe(true);
  });

  it("reports observed accuracy once a bucket has data", () => {
    const table = buildReliabilityTable(
      [
        ...Array.from({ length: 40 }, () => ({
          evidence: ev({ matchKind: "subcat_trigram" }),
          correct: true,
        })),
        ...Array.from({ length: 40 }, () => ({
          evidence: ev({ matchKind: "fuzzy" }),
          correct: false,
        })),
      ],
      { version: "t", source: "test", generatedAt: "now" },
    );

    const strong = calibrate(ev({ matchKind: "subcat_trigram" }), table);
    const weak = calibrate(ev({ matchKind: "fuzzy" }), table);

    expect(strong.probability).toBeGreaterThan(0.9);
    expect(weak.probability).toBeLessThan(0.2);
    expect(strong.support).toBe(40);
  });

  it("shrinks a thin bucket toward the prior instead of trusting it", () => {
    // Five out of five is not proof of certainty. Without shrinkage this bucket would
    // report 1.0 and auto-save everything that landed in it.
    const table = buildReliabilityTable(
      [
        ...Array.from({ length: 5 }, () => ({
          evidence: ev({ matchKind: "embedding" }),
          correct: true,
        })),
        ...Array.from({ length: 45 }, () => ({
          evidence: ev({ matchKind: "fuzzy" }),
          correct: false,
        })),
      ],
      { version: "t", source: "test", generatedAt: "now" },
    );

    const thin = calibrate(ev({ matchKind: "embedding" }), table);
    expect(thin.support).toBe(5);
    expect(thin.probability).toBeLessThan(1);
    // Pulled well below the raw 100% its five samples would suggest.
    expect(thin.probability).toBeLessThan(0.75);
  });

  it("never reports certainty in either direction", () => {
    const table = buildReliabilityTable(
      Array.from({ length: 500 }, () => ({
        evidence: ev({ matchKind: "user_dictionary" }),
        correct: true,
      })),
      { version: "t", source: "test", generatedAt: "now" },
    );
    const r = calibrate(ev({ matchKind: "user_dictionary" }), table);
    expect(r.probability).toBeLessThanOrEqual(0.99);
    expect(r.probability).toBeGreaterThan(0.9);
  });

  it("uses the prior for a bucket it has never seen", () => {
    // A deliberately imperfect corpus, so the prior is not 1.0 and the clamp is not
    // what the assertion ends up measuring.
    const table = buildReliabilityTable(
      [
        ...Array.from({ length: 15 }, () => ({
          evidence: ev({ matchKind: "user_dictionary" }),
          correct: true,
        })),
        ...Array.from({ length: 5 }, () => ({
          evidence: ev({ matchKind: "user_dictionary" }),
          correct: false,
        })),
      ],
      { version: "t", source: "test", generatedAt: "now" },
    );
    expect(table.prior).toBeCloseTo(0.75, 5);

    const unseen = calibrate(ev({ matchKind: "llm" }), table);
    expect(unseen.support).toBe(0);
    expect(unseen.fellBackToPrior).toBe(true);
    expect(unseen.probability).toBeCloseTo(table.prior, 5);
  });
});
