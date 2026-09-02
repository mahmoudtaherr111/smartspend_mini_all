/**
 * Benchmark fixture barrel.
 *
 * assertFixtureIntegrity() is the single guard that makes it impossible to write a
 * fixture asserting a category the app cannot store. It runs at the top of both the
 * offline suite and the live runner, and throws loudly rather than silently scoring
 * against an impossible target.
 */
import type { BenchmarkCase, CaseFilter } from "./classification-cases.types";
import { CORE_CASES } from "./classification-cases.core";
import { MONOLOGUE_CASES } from "./classification-cases.monologues";
import { NOISE_CASES } from "./classification-cases.noise";
import { checkTaxonomyPair, isKnownCategory } from "../../lib/benchmark-taxonomy-assert";
import { normalizeArabicCompact } from "../../lib/unified-normalizer";

export type {
  BenchmarkCase,
  BenchBucket,
  BenchTier,
  CaseFilter,
  Decision,
  ExpectedItem,
  KnownPersonFixture,
  TxType,
} from "./classification-cases.types";

export const ALL_BENCHMARK_CASES: readonly BenchmarkCase[] = Object.freeze([
  ...CORE_CASES,
  ...NOISE_CASES,
  ...MONOLOGUE_CASES,
]);

export function assertFixtureIntegrity(
  cases: readonly BenchmarkCase[] = ALL_BENCHMARK_CASES,
): void {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const seenTexts = new Map<string, string>();

  for (const c of cases) {
    if (seenIds.has(c.id)) problems.push(`معرّف مكرر: ${c.id}`);
    seenIds.add(c.id);

    // Duplicate normalized text would collide in the pipeline's own LRU cache and
    // make one of the two cases unmeasurable.
    const key = normalizeArabicCompact(c.text);
    const prior = seenTexts.get(key);
    if (prior) {
      problems.push(`نص مكرر بين ${prior} و ${c.id} — سيتصادمان في الكاش`);
    } else {
      seenTexts.set(key, c.id);
    }

    if (!c.text.trim()) problems.push(`${c.id}: نص فارغ`);

    for (let i = 0; i < c.expectedItems.length; i++) {
      const item = c.expectedItems[i];
      const where = `${c.id} #${i + 1}`;

      if (!Number.isFinite(item.amount) || item.amount <= 0) {
        problems.push(`${where}: مبلغ غير صالح (${item.amount})`);
      }

      const pair = checkTaxonomyPair(item.category, item.subCategory);
      if (!pair.legal) problems.push(`${where}: ${pair.reason}`);

      for (const alt of item.categoryAnyOf ?? []) {
        if (!isKnownCategory(alt)) {
          problems.push(`${where}: بديل فئة غير موجود في السجل: "${alt}"`);
        }
      }
      for (const alt of item.subCategoryAnyOf ?? []) {
        if (!checkTaxonomyPair(item.category, alt).legal) {
          problems.push(`${where}: بديل فرعية غير شرعي: "${alt}"`);
        }
      }

      // A categoryAnyOf list that omits the primary category is a typo, not a choice.
      if (item.categoryAnyOf && !item.categoryAnyOf.includes(item.category)) {
        problems.push(
          `${where}: categoryAnyOf لا يحتوي الفئة الأساسية "${item.category}"`,
        );
      }
      if (item.typeAnyOf && !item.typeAnyOf.includes(item.type)) {
        problems.push(`${where}: typeAnyOf لا يحتوي النوع الأساسي "${item.type}"`);
      }
    }

    for (const p of c.knownPeople ?? []) {
      if (!isKnownCategory(p.category)) {
        problems.push(`${c.id}: فئة شخص غير موجودة: "${p.category}"`);
      }
    }

    if (c.expectedItemCount !== undefined && c.expectedItems.length > 0) {
      if (c.expectedItemCount !== c.expectedItems.length) {
        problems.push(
          `${c.id}: expectedItemCount=${c.expectedItemCount} لا يطابق ${c.expectedItems.length} عنصراً`,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `فحص سلامة حالات القياس فشل (${problems.length}):\n  - ` + problems.join("\n  - "),
    );
  }
}

export function getBenchmarkCases(filter: CaseFilter = {}): BenchmarkCase[] {
  let out = [...ALL_BENCHMARK_CASES];

  if (filter.ids && filter.ids.length > 0) {
    const wanted = new Set(filter.ids);
    out = out.filter((c) => wanted.has(c.id));
  }
  if (filter.buckets && filter.buckets.length > 0) {
    const wanted = new Set(filter.buckets);
    out = out.filter((c) => wanted.has(c.bucket));
  }
  if (filter.tiers && filter.tiers.length > 0) {
    const wanted = new Set(filter.tiers);
    out = out.filter((c) => wanted.has(c.tier));
  }
  if (filter.tags && filter.tags.length > 0) {
    const wanted = new Set(filter.tags);
    out = out.filter((c) => c.tags.some((t) => wanted.has(t)));
  }
  if (filter.mode === "offline") {
    out = out.filter((c) => !c.offlineSkip);
  }
  if (filter.limit !== undefined && filter.limit > 0) {
    out = out.slice(0, filter.limit);
  }
  return out;
}

export function summarizeFixtures(cases: readonly BenchmarkCase[] = ALL_BENCHMARK_CASES): {
  total: number;
  items: number;
  byBucket: Record<string, number>;
  byTier: Record<string, number>;
} {
  const byBucket: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  let items = 0;
  for (const c of cases) {
    byBucket[c.bucket] = (byBucket[c.bucket] || 0) + 1;
    byTier[c.tier] = (byTier[c.tier] || 0) + 1;
    items += c.expectedItems.length;
  }
  return { total: cases.length, items, byBucket, byTier };
}
