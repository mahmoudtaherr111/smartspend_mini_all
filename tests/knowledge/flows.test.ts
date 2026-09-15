/**
 * Every step of a hand-drawn flow in docs/architecture/flows must exist in the code. The rules live in
 * scripts/knowledge/flows-rules.ts, shared with `npm run agent:finish`.
 */
import { describe, expect, it } from "vitest";
import { checkFlows } from "../../scripts/knowledge/flows-rules";

describe("architecture flows (docs/architecture/flows)", () => {
  for (const rule of checkFlows()) {
    it(rule.title, () => {
      expect(rule.violations, rule.fix).toEqual([]);
    });
  }
});
