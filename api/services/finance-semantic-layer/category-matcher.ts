/**
 * Finance Semantic Layer — Category Matcher
 * Delegates to the unified taxonomy in category-registry.ts.
 * Internal canonical = English ID (e.g., "food").
 * Display = Arabic name (e.g., "أكل وشرب").
 */
import {
  canonicalCategoryId,
  arabicDisplayName,
  getCategoryAliasesById,
  comparableArabic,
} from "../../lib/category-registry";

const AGGREGATE_GROUP_MAP: Record<string, string[]> = {
  income: ["salary", "freelance", "investment_income"],
  saving: ["transfer"],
  bills: ["bills", "daily_commitments"],
  transport: ["transport", "car_services"],
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

  // Step 1: Infer from extra fields FIRST (description is more reliable than stored category)
  if (extraHaystack) {
    const inferred = inferCategoryFromHaystack(extraHaystack);
    if (inferred && inferred !== "uncategorized") return inferred;
  }

  // Step 2: Try direct category match
  if (categoryText) {
    const direct = canonicalCategoryId(categoryText);
    if (direct !== "uncategorized") return direct;
  }

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

function allCanonicalIds(): string[] {
  const ids = new Set<string>([
    "food", "transport", "shopping", "health", "bills", "home",
    "education", "entertainment", "subscriptions", "smoking", "gifts",
    "pets", "work", "salary", "freelance", "investment_income",
    "transfer", "investment", "daily_commitments", "digital_services",
    "car_services", "outings", "family_transactions", "friends_transactions",
    "employees_transactions", "liabilities_and_gam3eyat", "miscellaneous",
    "income", "saving", "uncategorized",
  ]);
  return [...ids];
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
