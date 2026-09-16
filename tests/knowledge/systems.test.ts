/**
 * Every system in docs/architecture/systems.json keeps an explanation that was checked after its code last
 * changed, and a plain Arabic page that was checked after that explanation (scripts/knowledge/systems-docs.ts).
 * Ownership itself (every module, procedure, screen, route and job in exactly one system) is checked by the
 * atlas: gaps become generator warnings, which tests/knowledge/architecture.test.ts fails on.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildAtlasGraph } from "../../scripts/atlas/graph";
import { checkSystemDocs } from "../../scripts/knowledge/systems-docs";
import type { RuleResult } from "../../scripts/knowledge/types";

let results: RuleResult[] = [];

beforeAll(async () => {
  results = checkSystemDocs(await buildAtlasGraph());
}, 300_000);

describe("system documentation", () => {
  for (const id of ["system-docs-exist", "system-docs-checked", "system-plain-docs-checked"]) {
    it(id, () => {
      const rule = results.find((result) => result.id === id);
      expect(rule, `rule ${id} is defined`).toBeDefined();
      expect(rule!.violations, `${rule!.title}. ${rule!.fix}`).toEqual([]);
    });
  }
});
