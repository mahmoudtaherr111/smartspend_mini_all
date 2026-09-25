/**
 * Finance Semantic Layer — Category Matcher
 * Delegates to the unified taxonomy in category-registry.ts.
 * Internal canonical = English ID (e.g., "food").
 * Display = Arabic name (e.g., "أكل وشرب").
 */
import {
  CATEGORIES,
  canonicalCategoryId,
  arabicDisplayName,
  getCategoryAliasesById,
  comparableArabic,
} from "../../lib/category-registry";

/**
 * Query expansion: asking about "فواتير" should also sweep related categories.
 * This is intentionally NOT an id registry — a member that is only an alias
 * (daily_commitments) or a retired category (outings) is harmless here because
 * allCanonicalIds() is derived independently.
 */
const AGGREGATE_GROUP_MAP: Record<string, string[]> = {
  income: ["salary", "freelance", "investment_income", "gifts_received", "other_income"],
  saving: ["transfer"],
  bills: ["bills", "daily_commitments"],
  transport: ["transport"],
  entertainment: ["entertainment", "outings"],
};

function expandAggregate(id: string): string[] {
  if (AGGREGATE_GROUP_MAP[id]) return AGGREGATE_GROUP_MAP[id];
  return [id];
}

export function normalizeFinanceText(value: unknown): string {
  return comparableArabic(String(value ?? ""));
}

export function getCategoryAliases(category: string): string[] {
  const ids = expandAggregate(category);
  const aliases = new Set<string>([category]);
  for (const id of ids) {
    for (const alias of getCategoryAliasesById(id)) {
      aliases.add(alias);
    }
  }
  return [...aliases];
}

export function canonicalCategoryForRow(
  rowCategory: unknown,
  rowSubCategory?: unknown,
  ...extraFields: unknown[]
): string {
  const categoryText = String(rowCategory ?? "").trim();
  const extraHaystack = [rowSubCategory, ...extraFields]
    .map((v) => normalizeFinanceText(v))
    .join(" ");

  // Step 1: the stored category is the answer the user saw and kept (or corrected), so it
  // is what every screen counts. The description used to be read first, and a row filed
  // under تسوق could be totalled under another category in the chat than on Home. Only a
  // row stored as uncategorized or متنوعات is still read from its text.
  const direct = categoryText ? canonicalCategoryId(categoryText) : "uncategorized";
  if (direct !== "uncategorized" && direct !== "miscellaneous") return direct;

  // Step 2: infer from the text of a row that has no real category.
  if (extraHaystack) {
    const inferred = inferCategoryFromHaystack(extraHaystack);
    if (inferred && inferred !== "uncategorized") return inferred;
  }
  if (direct !== "uncategorized") return direct;

  // Step 3: Try full haystack (category + extra)
  const fullHaystack = normalizeFinanceText(categoryText) + " " + extraHaystack;
  const inferred = inferCategoryFromHaystack(fullHaystack);
  if (inferred) return inferred;

  return categoryText || "uncategorized";
}

function inferCategoryFromHaystack(haystack: string): string | null {
  if (!haystack) return null;
  for (const [alias, id] of aliasEntries()) {
    if (alias.length >= 3 && haystack.includes(alias)) {
      return id;
    }
  }
  return null;
}

let cachedAliasEntries: Array<[string, string]> | null = null;
function aliasEntries(): Array<[string, string]> {
  if (cachedAliasEntries) return cachedAliasEntries;
  const entries: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const catId of allCanonicalIds()) {
    for (const alias of getCategoryAliasesById(catId)) {
      const normalized = normalizeFinanceText(alias);
      if (normalized && normalized.length >= 3 && !seen.has(normalized)) {
        entries.push([normalized, catId]);
        seen.add(normalized);
      }
    }
  }
  entries.sort((a, b) => b[0].length - a[0].length);
  cachedAliasEntries = entries;
  return entries;
}

/**
 * Derived from the registry rather than hand-listed, so it cannot drift.
 *
 * The previous hand-written list had drifted three ways: it omitted
 * `government_services` (so government-fee rows could never be alias-matched by the
 * semantic layer at all) and carried two phantoms, `daily_commitments` and `outings`,
 * which are aliases and a deleted category respectively.
 */
function allCanonicalIds(): string[] {
  return [...CATEGORIES.map((c) => c.id), "income", "saving", "uncategorized"];
}

const categoryIds = new Map<string, string>();

/**
 * A category as a caller names it ("أكل", "المواصلات", "food") as the id rows are compared with. A name the registry
 * does not know stays as it is, so it matches nothing rather than every uncategorized row. Memoized: filters call it
 * once per row.
 */
export function financeCategoryId(category: string): string {
  let id = categoryIds.get(category);
  if (id === undefined) {
    const canonical = canonicalCategoryId(category);
    id = canonical === "uncategorized" ? category : canonical;
    if (categoryIds.size >= 1_000) categoryIds.clear();
    categoryIds.set(category, id);
  }
  return id;
}

/** Words for income as a whole, which the registry would otherwise read as "other income". */
const ALL_INCOME = new Set(["income", "دخل", "الدخل", "دخلي"]);

/** Every id a named category covers: a group ("income", "فواتير") sweeps its members. */
export function financeCategoryIds(category: string): string[] {
  const raw = category.trim().toLowerCase();
  if (AGGREGATE_GROUP_MAP[raw]) return AGGREGATE_GROUP_MAP[raw];
  if (ALL_INCOME.has(raw)) return AGGREGATE_GROUP_MAP.income;
  return expandAggregate(financeCategoryId(category));
}

export function displayFinanceCategory(category: unknown): string {
  const id = String(category ?? "").trim();
  return arabicDisplayName(id);
}

export function matchesCategory(
  rowCategory: unknown,
  rowSubCategory: unknown,
  category: string,
  ...extraFields: unknown[]
): boolean {
  const rowCanonical = canonicalCategoryForRow(rowCategory, rowSubCategory, ...extraFields);
  const targetIds = expandAggregate(category);
  if (targetIds.includes(rowCanonical)) return true;

  const haystack = [rowCategory, rowSubCategory, ...extraFields]
    .map((v) => normalizeFinanceText(v))
    .join(" ");
  return getCategoryAliases(category).some(
    (alias) => alias.length >= 3 && haystack.includes(normalizeFinanceText(alias)),
  );
}
