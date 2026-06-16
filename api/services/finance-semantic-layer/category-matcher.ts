const CATEGORY_ALIASES: Record<string, string[]> = {
  food: [
    "food",
    "اكل وشرب",
    "أكل وشرب",
    "اكل",
    "أكل",
    "restaurant",
    "\u0627\u0643\u0644",
    "\u0623\u0643\u0644",
    "\u0645\u0637\u0639\u0645",
    "\u0645\u0637\u0627\u0639\u0645",
    "\u0642\u0647\u0648\u0647",
    "\u0642\u0647\u0648\u0629",
    "\u0633\u0648\u0628\u0631 \u0645\u0627\u0631\u0643\u062a",
    "سوبرماركت",
    "ماركت",
    "هايبر",
    "هايبر ماركت",
    "كارفور",
    "خضار",
    "فاكهة",
    "لحمة",
    "لحمه",
    "فراخ",
    "دليفري",
    "طلبات",
    "talabat",
  ],
  transport: [
    "transport",
    "تنقلات",
    "uber",
    "\u0645\u0648\u0627\u0635\u0644\u0627\u062a",
    "\u0627\u0648\u0628\u0631",
    "\u0643\u0631\u064a\u0645",
    "\u0628\u0646\u0632\u064a\u0646",
    "\u062a\u0627\u0643\u0633\u064a",
    "\u0645\u062a\u0631\u0648",
  ],
  shopping: [
    "shopping",
    "تسوق وملابس",
    "\u062a\u0633\u0648\u0642",
    "\u0644\u0628\u0633",
    "\u0645\u0644\u0627\u0628\u0633",
    "\u0645\u0634\u062a\u0631\u064a\u0627\u062a",
  ],
  health: [
    "health",
    "صحة",
    "صحه",
    "صيدلية",
    "صيدليه",
    "دوا",
    "دواء",
    "علاج",
    "كشف",
    "دكتور",
  ],
  bills: [
    "bills",
    "فواتير",
    "فاتورة",
    "فاتوره",
    "قسط",
    "اقساط",
    "كهربا",
    "غاز",
    "مياه",
    "نت",
    "انترنت",
  ],
  income: [
    "income",
    "دخل",
    "مرتب",
    "راتب",
    "قبض",
    "salary",
  ],
  saving: [
    "saving",
    "ادخار",
    "تحويش",
    "جمعية",
    "جمعيه",
  ],
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  food: "\u0627\u0644\u0623\u0643\u0644",
  transport: "\u0627\u0644\u0645\u0648\u0627\u0635\u0644\u0627\u062a",
  shopping: "\u0627\u0644\u062a\u0633\u0648\u0642",
  health: "\u0627\u0644\u0635\u062d\u0629",
  bills: "\u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631",
  income: "\u0627\u0644\u062f\u062e\u0644",
  saving: "\u0627\u0644\u0627\u062f\u062e\u0627\u0631",
  uncategorized: "\u063a\u064a\u0631 \u0645\u0635\u0646\u0641",
};

const CATEGORY_INFERENCE_PRIORITY = [
  "food",
  "transport",
  "health",
  "bills",
  "saving",
  "shopping",
  "income",
];

export function normalizeFinanceText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064a")
    .replace(/\u0649/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCategoryAliases(category: string): string[] {
  const normalized = normalizeFinanceText(category);
  const direct = CATEGORY_ALIASES[normalized];
  if (direct) return [...new Set([category, ...direct])];

  const matched = Object.values(CATEGORY_ALIASES).find((aliases) =>
    aliases.some((alias) => normalizeFinanceText(alias) === normalized),
  );
  return matched ? [...new Set([category, ...matched])] : [category];
}

export function canonicalCategoryForRow(
  rowCategory: unknown,
  rowSubCategory?: unknown,
  ...extraFields: unknown[]
): string {
  const categoryText = String(rowCategory ?? "").trim();
  const normalizedCategory = normalizeFinanceText(categoryText);
  const extraHaystack = [rowSubCategory, ...extraFields]
    .map((value) => normalizeFinanceText(value))
    .join(" ");

  for (const key of CATEGORY_INFERENCE_PRIORITY) {
    if (getCategoryAliases(key).some((alias) => extraHaystack.includes(normalizeFinanceText(alias)))) {
      return key;
    }
  }

  for (const key of Object.keys(CATEGORY_ALIASES)) {
    if (getCategoryAliases(key).some((alias) => normalizeFinanceText(alias) === normalizedCategory)) {
      return key;
    }
  }

  const haystack = [rowCategory, rowSubCategory, ...extraFields]
    .map((value) => normalizeFinanceText(value))
    .join(" ");
  for (const key of Object.keys(CATEGORY_ALIASES)) {
    if (getCategoryAliases(key).some((alias) => haystack.includes(normalizeFinanceText(alias)))) {
      return key;
    }
  }

  return categoryText || "uncategorized";
}

export function displayFinanceCategory(category: unknown): string {
  const key = String(category ?? "").trim();
  return CATEGORY_DISPLAY_NAMES[key] ?? (key || CATEGORY_DISPLAY_NAMES.uncategorized);
}

export function matchesCategory(
  rowCategory: unknown,
  rowSubCategory: unknown,
  category: string,
  ...extraFields: unknown[]
): boolean {
  const haystack = [rowCategory, rowSubCategory, ...extraFields]
    .map((value) => normalizeFinanceText(value))
    .join(" ");
  return getCategoryAliases(category).some((alias) => haystack.includes(normalizeFinanceText(alias)));
}
