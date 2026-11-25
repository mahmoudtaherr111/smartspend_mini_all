import { describe, expect, it } from "vitest";
import families from "./synthetic-families.json";
import { loadSet, type EvalCase } from "./set";
import { join } from "node:path";

const difficulties = ["easy", "medium", "hard", "strange"] as const;
const arms = ["typed", "gold-transcript"] as const;
const load = (name: string) => loadSet(join(import.meta.dirname, name));
const textKey = (input: string) => input.normalize("NFKC").replace(/[\p{P}\s]+/gu, "").toLowerCase();
const gold = ({ expect, events }: EvalCase) => ({ expect, events: events.map((event) => JSON.stringify(event)).sort() });

describe("synthetic Egyptian recording exam", () => {
  it.each(arms)("%s has complete, balanced contrast families with valid taxonomy labels", (arm) => {
    const set = load(families.arms[arm]);
    expect(set.warnings).toEqual([]);
    const groups = families.families.filter((group) => group.arm === arm);
    const idsInFamilies = new Set<string>();
    const cases = new Map(set.cases.map((item) => [item.id, item]));
    for (const group of groups) {
      const ids = ["base", "same", "edit"].map((suffix) => `${group.id}-${suffix}`);
      const [base, same, edit] = ids.map((id) => cases.get(id)!);
      for (const id of ids) expect(idsInFamilies.has(id), id).toBe(false);
      for (const id of ids) idsInFamilies.add(id);
      expect(new Set([base.text, same.text, edit.text].map(textKey)).size, group.id).toBe(3);
      expect(gold(same), group.id).toEqual(gold(base));
      expect(gold(edit), group.id).not.toEqual(gold(base));
      expect(same.context, group.id).toEqual(base.context);
      expect(edit.context, group.id).toEqual(base.context);
    }
    for (const difficulty of difficulties) {
      expect(groups.filter((group) => group.difficulty === difficulty), difficulty).toHaveLength(3);
    }
    expect(idsInFamilies).toEqual(new Set(cases.keys()));
  });

  it("keeps text unique across both arms and the existing development and locked sets", () => {
    const seen = new Set(["dev-set.json", "locked-set.json"].flatMap((name) => load(name).cases.map((item) => textKey(item.text))));
    for (const arm of arms) {
      for (const item of load(families.arms[arm]).cases) {
        const key = textKey(item.text);
        expect(seen.has(key), item.id).toBe(false);
        seen.add(key);
      }
    }
    expect(families.arms["real-audio"]).toBeNull();
  });
});
