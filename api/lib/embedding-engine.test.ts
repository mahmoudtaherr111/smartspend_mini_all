/**
 * Embedding Engine Tests
 * Tests complexity scoring, segment splitting, and the calibration logic
 */

import { describe, it, expect } from "vitest";
import { computeComplexity, splitSegments } from "./embedding-engine";

describe("Embedding Engine – Complexity Scoring", () => {
  it("simple short phrase should have low complexity", () => {
    const { score, features } = computeComplexity("بيتزا بـ 100 جنيه");
    expect(score).toBeLessThan(35);
    expect(features.amountCount).toBe(1);
    expect(features.hasConjunctions).toBe(false);
    expect(features.hasAmbiguity).toBe(false);
  });

  it("compound sentence with 'و' should have high complexity", () => {
    const { score, features } = computeComplexity(
      "أكلت بيتزا بـ 100 وركبت أوبر بـ 50",
    );
    expect(score).toBeGreaterThanOrEqual(35);
    expect(features.hasConjunctions).toBe(true);
    expect(features.amountCount).toBe(2);
  });

  it("ambiguous text should increase complexity", () => {
    const { score, features } = computeComplexity("حوالي 200 جنيه تقريبا");
    expect(features.hasAmbiguity).toBe(true);
    expect(score).toBeGreaterThanOrEqual(20);
  });

  it("very long text should be complex", () => {
    const longText =
      "أنا النهاردة صرفت كتير أوي الصبح ركبت أوبر بـ 50 وبعدين أكلت فطار بـ 30 وكمان اشتريت موبايل بـ 5000";
    const { score } = computeComplexity(longText);
    expect(score).toBeGreaterThanOrEqual(50);
  });
});

describe("Embedding Engine – Segment Splitting", () => {
  it("should not split a single-transaction text", () => {
    const segments = splitSegments("أكلت بيتزا بـ 100 جنيه");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toContain("بيتزا");
  });

  it("should split compound text on 'و' when both segments have amounts", () => {
    const segments = splitSegments("أكلت بيتزا بـ 100 و ركبت أوبر بـ 50");
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  it("should split on 'وبعدين'", () => {
    const segments = splitSegments("دفعت 200 كهرباء وبعدين 100 مياه");
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  it("should NOT split when only one side has amounts", () => {
    const segments = splitSegments("أكلت بيتزا و شربت عصير");
    // Neither side has a numeric amount, so should stay as one
    expect(segments).toHaveLength(1);
  });
});
