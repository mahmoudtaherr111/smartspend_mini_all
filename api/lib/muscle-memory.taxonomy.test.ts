/**
 * Patterns learned from classification logs written before the current taxonomy must not
 * bring the old categories back (docs/decisions/0008-money-movements-and-taxonomy.md).
 */
import { describe, expect, it, vi } from "vitest";

const { logs } = vi.hoisted(() => ({ logs: [] as unknown[] }));

vi.mock("../queries/connection", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, { from: self, where: self, orderBy: self, limit: async () => logs });
  return { db: { select: self } };
});

import { muscleMemoryLookup } from "./muscle-memory";

function autoSaved(text: string, category: string, subCategory: string, type: string) {
  return {
    id: logs.length + 1,
    originalText: text,
    normalizedText: text,
    finalResult: [{ category, subCategory, type }],
    confidence: 95,
    wasCorrected: false,
    decision: "auto_save",
    parsedBy: "rule_engine",
    createdAt: new Date(),
  };
}

describe("muscle memory and the old taxonomy", () => {
  it("answers a pattern learned under a retired category with its current place", async () => {
    logs.length = 0;
    logs.push(
      autoSaved("غيرت زيت العربية 900", "خدمات سيارات", "تغيير زيت", "expense"),
      autoSaved("غيرت زيت العربية 850", "خدمات سيارات", "تغيير زيت", "expense"),
    );
    const match = await muscleMemoryLookup("غيرت زيت العربية 950", 41001, "local");
    expect(match?.pattern.category).toBe("مواصلات");
    expect(match?.pattern.subCategory).toBe("صيانة عربية");
  });

  it("does not learn a money movement that was booked as spending", async () => {
    logs.length = 0;
    logs.push(
      autoSaved("دفعت قسط الجمعية 1000", "التزامات وجمعيات", "قسط جمعية", "expense"),
      autoSaved("دفعت قسط الجمعية 1000", "التزامات وجمعيات", "قسط جمعية", "expense"),
    );
    expect(await muscleMemoryLookup("دفعت قسط الجمعية 1000", 41002, "local")).toBeNull();
  });
});
