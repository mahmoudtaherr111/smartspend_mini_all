import { describe, expect, it } from "vitest";
import { appHelpTool } from "./app-help";
import { marketPriceTool } from "./market-price";
import { memoryTool } from "./memory";
import { moneyQuery } from "./money-query";
import { cancelTool, changeDraftTool, confirmTool, recordDraftTool } from "./record";
import { thinkTool } from "./think";

const TOOLS = [moneyQuery, recordDraftTool, changeDraftTool, confirmTool, cancelTool, memoryTool, appHelpTool, thinkTool, marketPriceTool];

/** Paths of schema nodes without a type; Google's Live API refuses the whole session for one of them. */
function untyped(schema: Record<string, unknown>, path: string): string[] {
  const found = typeof schema.type === "string" ? [] : [path];
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  for (const [name, child] of Object.entries(properties)) found.push(...untyped(child, `${path}.${name}`));
  if (schema.items && typeof schema.items === "object") found.push(...untyped(schema.items as Record<string, unknown>, `${path}[]`));
  return found;
}

describe("the call's tool declarations", () => {
  it("give every field a type", () => {
    const missing = TOOLS.flatMap((tool) => untyped(tool.declaration.parameters as Record<string, unknown>, tool.declaration.name));
    expect(missing).toEqual([]);
  });

  it("stay small, because they are billed again on every turn", () => {
    const chars = TOOLS.reduce((sum, tool) => sum + JSON.stringify(tool.declaration).length, 0);
    expect(chars).toBeLessThan(6_500);
  });
});
