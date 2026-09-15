import { describe, expect, it } from "vitest";
import { unparenthesizedOrFragments } from "../../scripts/knowledge/sql-fragments";

const file = "api/example.ts";

describe("raw sql fragments with OR (api/AGENTS.md rule 3)", () => {
  it("flags an OR that and() would leave outside the user filter", () => {
    const text = [
      "const where = and(",
      "  eq(expenses.userId, userId),",
      "  sql`${expenses.category} LIKE ${q} OR ${expenses.rawText} LIKE ${q}`,",
      ");",
    ].join("\n");

    expect(unparenthesizedOrFragments(file, text)).toEqual([`${file}:3`]);
  });

  it("accepts an OR inside parentheses, inside a quoted string or inside a whole statement", () => {
    const text = [
      "const a = sql`(${expenses.status} IS NULL OR ${expenses.status} = 'confirmed')`;",
      "const b = sql`${expenses.note} = 'this OR that'`;",
      "const c = sql`SELECT id FROM expenses WHERE a = 1 OR b = 2`;",
      "const d = sql<number>`COALESCE(SUM(${expenses.amount}), 0)`;",
      "const e = sqlTag`${expenses.category} LIKE ${q} ORDER BY id`;",
    ].join("\n");

    expect(unparenthesizedOrFragments(file, text)).toEqual([]);
  });
});
