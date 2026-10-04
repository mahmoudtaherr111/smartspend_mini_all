import type { UiLanguage } from "./language";

const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "إبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const ENGLISH_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Formats a currency amount according to the current UI language.
 * In Arabic: "1,250 ج.م"
 * In English: "1,250 EGP"
 */
export function formatCurrency(
  value: number | string | null | undefined,
  language: UiLanguage = "ar",
): string {
  const num = Number(value || 0);
  const formatted = num.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
  return language === "en" ? `${formatted} EGP` : `${formatted} ج.م`;
}

/**
 * Formats a "YYYY-MM" string into localized month + year.
 * e.g. "2026-10" -> "أكتوبر 2026" (ar) or "October 2026" (en).
 */
export function formatMonthLabel(
  monthStr: string,
  language: UiLanguage = "ar",
): string {
  if (!monthStr || !monthStr.includes("-")) return monthStr;
  const [yearStr, monthPart] = monthStr.split("-");
  const monthIndex = Number(monthPart) - 1;
  const year = Number(yearStr);
  if (monthIndex < 0 || monthIndex > 11 || Number.isNaN(year)) return monthStr;

  const names = language === "en" ? ENGLISH_MONTHS : ARABIC_MONTHS;
  return `${names[monthIndex]} ${year}`;
}
