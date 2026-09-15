/**
 * The documents agents read must not point at things that do not exist, and must not quote facts that
 * drift. The rules live in scripts/knowledge/docs-rules.ts, shared with `npm run agent:finish`.
 */
import { describe, expect, it } from "vitest";
import { checkDocs } from "../../scripts/knowledge/docs-rules";

describe("hand-written documentation", () => {
  for (const rule of checkDocs()) {
    it(rule.title, () => {
      expect(rule.violations, rule.fix).toEqual([]);
    });
  }
});
