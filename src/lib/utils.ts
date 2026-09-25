import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CATEGORIES } from "@contracts/categories";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Colours by category, from the taxonomy (`contracts/categories.ts`). */
const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((category) => [category.name_ar, category.color]),
);

const DEFAULT_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f43f5e",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#6366f1",
];

export function getCategoryColor(categoryName: string, index?: number): string {
  if (CATEGORY_COLORS[categoryName]) {
    return CATEGORY_COLORS[categoryName];
  }
  if (typeof index === "number") {
    return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  }
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
}
