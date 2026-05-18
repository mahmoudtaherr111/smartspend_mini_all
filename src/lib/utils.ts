import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CATEGORY_COLORS: Record<string, string> = {
  "أكل وشرب": "#8b5cf6", // violet-500
  "مواصلات": "#f43f5e", // rose-500
  "فواتير": "#06b6d4", // cyan-500
  "سكن": "#10b981", // emerald-500
  "تسوق": "#ec4899", // pink-500
  "صحة": "#3b82f6", // blue-500
  "تعليم": "#f59e0b", // amber-500
  "ترفيه": "#6366f1", // indigo-500
  "هدايا وصدقات": "#84cc16", // lime-500
  "استثمار": "#14b8a6", // teal-500
  "متنوعات": "#64748b", // slate-500
  "أخرى": "#94a3b8", // slate-400
};

const DEFAULT_COLORS = [
  "#10b981", "#3b82f6", "#f43f5e", "#f59e0b", "#8b5cf6", 
  "#06b6d4", "#ec4899", "#84cc16", "#6366f1"
];

export function getCategoryColor(categoryName: string, index?: number): string {
  if (CATEGORY_COLORS[categoryName]) {
    return CATEGORY_COLORS[categoryName];
  }
  if (typeof index === 'number') {
    return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  }
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
}
