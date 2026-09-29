/**
 * Patterns learned from classification logs written before the current taxonomy must not
 * bring the old categories back (docs/decisions/0008-money-movements-and-taxonomy.md).
 */
import { describe, expect, it, vi } from "vitest";

const { logs, saved } = vi.hoisted(() => ({ logs: [] as unknown[], saved: [] as unknown[] }));

vi.mock("../queries/connection", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  // The logs query ends in `.limit()`; the saved-rows query is awaited after `.where()`.
  const filtered = {
    orderBy: self,
    limit: async () => logs,
    then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(saved).then(resolve),
  };
  Object.assign(chain, { from: self, where: () => filtered, orderBy: self, limit: async () => logs });
  return { db: { select: self } };
});

import { muscleMemoryLookup } from "./muscle-memory";

/**
 * A log of an auto-saved parse, and the row it became. The row carries the category it
 * has today (the taxonomy migration moved saved rows); the log keeps the old one.
 */
function autoSaved(
  text: string,
  category: string,
  subCategory: string,
  type: string,
  savedAs: { category: string; subCategory: string } | null = null,
) {
  const id = logs.length + saved.length + 1;
  if (savedAs) saved.push({ classificationLogId: id, ...savedAs, type });
  return {
    id,
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
    saved.length = 0;
    const now = { category: "مواصلات", subCategory: "صيانة عربية" };
    logs.push(
      autoSaved("غيرت زيت العربية 900", "خدمات سيارات", "تغيير زيت", "expense", now),
      autoSaved("غيرت زيت العربية 850", "خدمات سيارات", "تغيير زيت", "expense", now),
    );
    const match = await muscleMemoryLookup("غيرت زيت العربية 950", 41001, "local");
    expect(match?.pattern.category).toBe("مواصلات");
    expect(match?.pattern.subCategory).toBe("صيانة عربية");
  });

  it("does not learn a money movement that was booked as spending", async () => {
    logs.length = 0;
    saved.length = 0;
    logs.push(
      autoSaved("دفعت قسط الجمعية 1000", "التزامات وجمعيات", "قسط جمعية", "expense"),
      autoSaved("دفعت قسط الجمعية 1000", "التزامات وجمعيات", "قسط جمعية", "expense"),
    );
    expect(await muscleMemoryLookup("دفعت قسط الجمعية 1000", 41002, "local")).toBeNull();
  });

  it("learns nothing from parses the user never saved, or saved differently", async () => {
    logs.length = 0;
    saved.length = 0;
    // Parsed twice and never saved: a wrong answer shown twice is not a habit.
    logs.push(
      autoSaved("قهوة من كوستا 90", "أكل وشرب", "قهوة وكافيه", "expense"),
      autoSaved("قهوة من كوستا 85", "أكل وشرب", "قهوة وكافيه", "expense"),
    );
    expect(await muscleMemoryLookup("قهوة من كوستا 95", 41003, "local")).toBeNull();

    logs.length = 0;
    saved.length = 0;
    const changed = { category: "ترفيه", subCategory: "خروجة" };
    logs.push(
      autoSaved("قهوة من كوستا 90", "أكل وشرب", "قهوة وكافيه", "expense", changed),
      autoSaved("قهوة من كوستا 85", "أكل وشرب", "قهوة وكافيه", "expense", changed),
    );
    expect(await muscleMemoryLookup("قهوة من كوستا 95", 41004, "local")).toBeNull();
  });
});
