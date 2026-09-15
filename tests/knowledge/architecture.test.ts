/**
 * The architecture rules from AGENTS.md, checked on the atlas graph. The rules live in
 * scripts/knowledge/architecture-rules.ts, so `npm run agent:finish` and the agent hooks run the same code.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildAtlasGraph } from "../../scripts/atlas/graph";
import { ARCHITECTURE_RULES, checkArchitecture } from "../../scripts/knowledge/architecture-rules";
import type { RuleResult } from "../../scripts/knowledge/types";

let results = new Map<string, RuleResult>();

beforeAll(async () => {
  results = new Map(checkArchitecture(await buildAtlasGraph()).map((result) => [result.id, result]));
}, 300_000);

describe("architecture rules from AGENTS.md", () => {
  for (const rule of ARCHITECTURE_RULES) {
    it(rule.title, () => {
      expect(results.get(rule.id)?.violations, rule.fix).toEqual([]);
    });
  }
});
