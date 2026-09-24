import { CATEGORIES } from "@contracts/categories";

/**
 * The category picker's options, read from the one taxonomy the server uses
 * (`contracts/categories.ts`). This file used to be a hand-kept copy of the server's
 * list, updated separately and checked by a contract test.
 */
export const CATEGORY_OPTIONS: readonly string[] = CATEGORIES.map((category) => category.name_ar);

export const SUB_CATEGORY_OPTIONS: Record<string, string[]> = Object.fromEntries(
  CATEGORIES.map((category) => [
    category.name_ar,
    category.subcategories.map((subCategory) => subCategory.name_ar),
  ]),
);

/**
 * The categories of one kind of transaction, for pickers that filter by type. The
 * current category stays listed even when it belongs to another type, so a picker never
 * shows a value it cannot hold.
 */
export function getCategoryOptionsForType(type: string, current?: string | null): string[] {
  const options = CATEGORIES.filter((category) => category.type === type).map((category) => category.name_ar);
  if (options.length === 0) return [...CATEGORY_OPTIONS];
  if (current && !options.includes(current)) options.unshift(current);
  return options;
}

export function getSubCategoryOptions(category: string): string[] {
  return SUB_CATEGORY_OPTIONS[category] || ["عام"];
}

/** The subcategory a newly picked category starts with: its general one when it has one. */
export function defaultSubCategory(category: string): string {
  const options = getSubCategoryOptions(category);
  return options.includes("عام") ? "عام" : options[0] || "عام";
}

/** Icon and colour of a stored category, from the taxonomy; unknown names get the neutral pair. */
export function getCategoryAppearance(category: string | null | undefined): { icon: string; color: string } {
  const found = CATEGORIES.find((entry) => entry.name_ar === category);
  return found ? { icon: found.icon, color: found.color } : { icon: "📦", color: "#94a3b8" };
}
