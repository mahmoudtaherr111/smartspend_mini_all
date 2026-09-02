/**
 * Structural invariants of the category registry.
 *
 * These guard the class of defect that is invisible at runtime: an alias pointing at
 * an id that does not exist, a duplicate alias key where insertion order silently
 * decides the winner, or a hand-maintained id list drifting from the registry.
 *
 * Every assertion here failed before the storage-integrity fix — that is why it exists.
 */
import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  EXTRA_ALIASES_TO_ID,
  canonicalCategoryId,
  arabicDisplayName,
  storageCategoryName,
  getCategoryAliasesById,
  comparableArabic,
} from "./category-registry";
import { CATEGORIES as DERIVED_TAXONOMY } from "./taxonomy-ssot";

const REGISTRY_IDS = new Set(CATEGORIES.map((c) => c.id));
const VIRTUAL_IDS = new Set(["income", "saving", "uncategorized"]);

describe("category registry integrity", () => {
  it("every alias points at a real category id", () => {
    const dangling = EXTRA_ALIASES_TO_ID.filter(([, id]) => !REGISTRY_IDS.has(id));
    expect(
      dangling,
      `أسماء بديلة تشير لفئات غير موجودة: ${dangling.map(([a, id]) => `"${a}" -> ${id}`).join(", ")}`,
    ).toEqual([]);
  });

  it("no alias key is declared twice", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [alias, id] of EXTRA_ALIASES_TO_ID) {
      const key = comparableArabic(alias);
      const prior = seen.get(key);
      if (prior !== undefined && prior !== id) {
        duplicates.push(`"${alias}": ${prior} ثم ${id}`);
      }
      seen.set(key, id);
    }
    expect(
      duplicates,
      `أسماء بديلة مكررة بوجهات مختلفة — ترتيب الإدراج يقرر الفائز صامتاً: ${duplicates.join(" · ")}`,
    ).toEqual([]);
  });

  it("every category id renders as an Arabic label, never as the raw id", () => {
    for (const c of CATEGORIES) {
      expect(arabicDisplayName(c.id), `الفئة ${c.id} تعرض معرّفها الخام`).toBe(c.name_ar);
      expect(arabicDisplayName(c.id)).not.toBe(c.id);
    }
  });

  it("storageCategoryName always returns a storable Arabic name", () => {
    const names = new Set(CATEGORIES.map((c) => c.name_ar));
    const probes = [
      "food",
      "أكل وشرب",
      "كافيهات",
      "بلايستيشن",
      "saving",
      "income",
      "uncategorized",
      "نص مالوش أي معنى",
      "",
      null,
      undefined,
    ];
    for (const probe of probes) {
      const out = storageCategoryName(probe as string);
      expect(names.has(out), `"${probe}" أنتج "${out}" وهو ليس اسم فئة مخزّن`).toBe(true);
    }
  });

  it("no category resolves to a virtual aggregate id when stored", () => {
    for (const virtual of VIRTUAL_IDS) {
      const stored = storageCategoryName(virtual);
      expect(REGISTRY_IDS.has(stored)).toBe(false);
      expect(CATEGORIES.some((c) => c.name_ar === stored)).toBe(true);
    }
  });

  it("every category exposes at least its own names as aliases", () => {
    for (const c of CATEGORIES) {
      const aliases = getCategoryAliasesById(c.id);
      expect(aliases.length, `الفئة ${c.id} بلا أسماء بديلة`).toBeGreaterThanOrEqual(2);
      expect(aliases).toContain(c.name_ar);
    }
  });

  it("the derived taxonomy view matches the registry exactly", () => {
    expect(DERIVED_TAXONOMY.map((c) => c.id)).toEqual(CATEGORIES.map((c) => c.id));
    for (const view of DERIVED_TAXONOMY) {
      expect(REGISTRY_IDS.has(view.id)).toBe(true);
      expect(
        view.aliases.length,
        `الفئة ${view.id} تصل لمحرك النية بصفر أسماء بديلة فلا تطابق شيئاً`,
      ).toBeGreaterThan(0);
    }
  });

  it("resolves the aliases migrated from the old taxonomy view", () => {
    const expected: Array<[string, string]> = [
      ["سايس", "transport"],
      ["قهوجي", "food"],
      ["swvl", "transport"],
      ["thndr", "investment"],
      ["بواب", "home"],
      ["كوافير", "shopping"],
      ["روشتة", "health"],
      ["نتفليكس", "subscriptions"],
      ["ديون", "liabilities_and_gam3eyat"],
    ];
    for (const [alias, id] of expected) {
      expect(canonicalCategoryId(alias), `"${alias}" لم تُحلّ إلى ${id}`).toBe(id);
    }
  });

  it("keeps the registry mapping where the old view disagreed", () => {
    // The migrated view wanted these elsewhere; the registry's answer is the better one.
    expect(canonicalCategoryId("ركنة")).toBe("car_services");
    expect(canonicalCategoryId("netflix")).toBe("subscriptions");
    expect(canonicalCategoryId("جيم")).toBe("entertainment");
  });
});
