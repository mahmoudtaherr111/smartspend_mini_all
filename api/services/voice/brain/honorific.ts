/**
 * The title an Egyptian would use for someone of this profession ("يا دكتور", "يا باشمهندس"), taken from the
 * profile's profession as the user wrote it. The feminine form comes only from the word itself ("دكتورة"): gender
 * is never collected or stored. Unknown professions get no title, never an invented one ("يا باشا").
 */
const TITLES: Array<[RegExp, string]> = [
  [/(دكتورة|طبيبة|صيدلانية|دكتوره|طبيبه)/, "دكتورة"],
  [/(دكتور|طبيب|جراح|صيدلي|اسنان|أسنان|doctor|physician|dentist|pharmacist|\bdr\b)/i, "دكتور"],
  [/(مهندسة|مهندسه)/, "باشمهندسة"],
  [/(مهندس|هندسة|هندسه|engineer)/i, "باشمهندس"],
  [/(محامية|محاميه)/, "أستاذة"],
  [/(محامي|محاماة|lawyer|attorney)/i, "أستاذ"],
  [/(مستشار|قاضي|قاضى|judge)/i, "مستشار"],
  [/(مدرسة|مدرسه|معلمة|معلمه|أستاذة|استاذة|محاسبة|محاسبه)/, "أستاذة"],
  [/(مدرس|معلم|أستاذ|استاذ|teacher|professor|محاسب|accountant)/i, "أستاذ"],
  [/(كابتن|طيار|مدرب|pilot|captain|coach)/i, "كابتن"],
];

export function honorificFor(profession: string | null | undefined): string | null {
  const text = String(profession ?? "").trim();
  if (!text) return null;
  for (const [pattern, title] of TITLES) {
    if (pattern.test(text)) return title;
  }
  return null;
}
