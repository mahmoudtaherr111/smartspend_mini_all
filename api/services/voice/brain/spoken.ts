/**
 * How a number is said in Egyptian Arabic — the one piece of wording the call writes for the model.
 *
 * Tools return `spoken` forms built here, so the model says "تمن آلاف وربعمية" rather than
 * "ثمانية آلاف وأربعمائة", and the spoken-number validator reads them back with
 * `api/lib/arabic-number-parser.ts`, the app's single place where speech becomes a digit. Every form this file
 * produces must parse back to the value it names (see spoken.test.ts).
 */

const UNITS: Record<number, string> = {
  1: "واحد", 2: "اتنين", 3: "تلاتة", 4: "أربعة", 5: "خمسة",
  6: "ستة", 7: "سبعة", 8: "تمانية", 9: "تسعة", 10: "عشرة",
  11: "حداشر", 12: "اتناشر", 13: "تلاتاشر", 14: "أربعتاشر", 15: "خمستاشر",
  16: "ستاشر", 17: "سبعتاشر", 18: "تمنتاشر", 19: "تسعتاشر",
};

const TENS: Record<number, string> = {
  2: "عشرين", 3: "تلاتين", 4: "أربعين", 5: "خمسين", 6: "ستين", 7: "سبعين", 8: "تمانين", 9: "تسعين",
};

/** Hundreds said on their own ("خمسمية") and before a counted noun ("خمسميت ألف"). */
const HUNDREDS: Record<number, { alone: string; counted: string }> = {
  1: { alone: "مية", counted: "ميت" },
  2: { alone: "ميتين", counted: "ميتين" },
  3: { alone: "تلتمية", counted: "تلتميت" },
  4: { alone: "ربعمية", counted: "ربعميت" },
  5: { alone: "خمسمية", counted: "خمسميت" },
  6: { alone: "ستمية", counted: "ستميت" },
  7: { alone: "سبعمية", counted: "سبعميت" },
  8: { alone: "تمنمية", counted: "تمنميت" },
  9: { alone: "تسعمية", counted: "تسعميت" },
};

/** 3–10 before "آلاف": "تلات آلاف", "تمن آلاف". */
const THOUSANDS_COUNT: Record<number, string> = {
  3: "تلات", 4: "أربع", 5: "خمس", 6: "ست", 7: "سبع", 8: "تمن", 9: "تسع", 10: "عشر",
};

/** 1–99. */
function belowHundred(n: number): string {
  if (n < 20) return UNITS[n];
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  return unit === 0 ? TENS[tens] : `${UNITS[unit]} و${TENS[tens]}`;
}

/** 1–999; `counted` when a noun follows ("خمسميت ألف", "خمسميت جنيه"). */
function belowThousand(n: number, counted = false): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return belowHundred(rest);
  if (rest === 0) return counted ? HUNDREDS[hundreds].counted : HUNDREDS[hundreds].alone;
  return `${HUNDREDS[hundreds].alone} و${belowHundred(rest)}`;
}

function thousandsPhrase(count: number): string {
  if (count === 1) return "ألف";
  if (count === 2) return "ألفين";
  if (count <= 10) return `${THOUSANDS_COUNT[count]} آلاف`;
  return `${belowThousand(count, true)} ألف`;
}

function millionsPhrase(count: number): string {
  if (count === 1) return "مليون";
  if (count === 2) return "مليونين";
  return `${belowThousand(count, true)} مليون`;
}

/** An exact whole number in words, as said on its own. Negative numbers get "سالب". */
export function spellInteger(value: number, options: { counted?: boolean } = {}): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return "صفر";
  const sign = value < 0 ? "سالب " : "";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions > 0) parts.push(millionsPhrase(millions));
  if (thousands > 0) parts.push(thousandsPhrase(thousands));
  if (rest > 0) parts.push(belowThousand(rest, options.counted === true && parts.length === 0));
  return sign + parts.join(" و");
}

/**
 * Rounding for speech, the rule the validator also allows:
 * under 1,000 exact, then to the nearest 100, 500, 1,000 and 10,000 as the amount grows.
 */
export function roundForSpeech(value: number): { value: number; approximate: boolean; step: number } {
  const abs = Math.abs(value);
  const step = abs < 10 ? 0.5 : abs < 1000 ? 1 : abs < 10_000 ? 100 : abs < 100_000 ? 500 : abs < 1_000_000 ? 1000 : 10_000;
  const rounded = Math.round(value / step) * step;
  return { value: rounded, approximate: Math.abs(rounded - value) >= 0.005, step };
}

/** "ألفين ونص", "تلات آلاف ونص", "مليون ونص": the half said the Egyptian way. */
function withHalf(n: number): string | null {
  if (n >= 1_000_000 && n % 1_000_000 === 500_000) {
    return `${millionsPhrase(Math.floor(n / 1_000_000))} ونص`;
  }
  if (n >= 1000 && n < 1_000_000 && n % 1000 === 500) {
    return `${thousandsPhrase(Math.floor(n / 1000))} ونص`;
  }
  return null;
}

export interface SpokenAmount {
  /** What the model should say, e.g. "حوالي تلات آلاف ونص". */
  text: string;
  /** The value that text names (after rounding). */
  value: number;
  approximate: boolean;
}

/**
 * A money amount for speech. `exact` is for confirming a recording or when the user asked "بالظبط";
 * otherwise the amount is rounded by {@link roundForSpeech} and prefixed with "حوالي" when that changed it.
 * The currency word is left to the model, which usually does not need it.
 */
export function spellAmount(amount: number, options: { exact?: boolean } = {}): SpokenAmount {
  if (!Number.isFinite(amount)) return { text: "", value: amount, approximate: false };

  if (options.exact) {
    const abs = Math.abs(amount);
    const pounds = Math.trunc(abs);
    const piastres = Math.round((abs - pounds) * 100);
    const sign = amount < 0 ? "سالب " : "";
    if (piastres === 0) return { text: sign + spellInteger(pounds), value: amount, approximate: false };
    if (piastres === 50 && pounds < 10) {
      return { text: `${sign}${pounds === 0 ? "نص" : `${spellInteger(pounds)} ونص`}`, value: amount, approximate: false };
    }
    const poundsText = pounds === 0 ? "" : `${spellInteger(pounds)} جنيه و`;
    return { text: `${sign}${poundsText}${spellInteger(piastres)} قرش`, value: amount, approximate: false };
  }

  const rounded = roundForSpeech(amount);
  const n = Math.abs(rounded.value);
  const sign = rounded.value < 0 ? "سالب " : "";
  let words: string;
  if (n < 10 && !Number.isInteger(n)) {
    const whole = Math.trunc(n);
    words = whole === 0 ? "نص" : `${spellInteger(whole)} ونص`;
  } else {
    words = withHalf(n) ?? spellInteger(n);
  }
  const text = `${rounded.approximate ? "حوالي " : ""}${sign}${words}`;
  return { text, value: rounded.value, approximate: rounded.approximate };
}

/** A share of something: "ربع", "حوالي تلت", else "اتناشر في المية". */
export function spellPercent(percent: number): string {
  if (!Number.isFinite(percent)) return "";
  const p = Math.round(percent);
  const fractions: Array<[number, string]> = [[25, "ربع"], [33, "تلت"], [50, "نص"], [67, "تلتين"], [75, "تلات تربع"]];
  for (const [target, word] of fractions) {
    if (Math.abs(percent - target) < 0.5) return word;
    if (Math.abs(percent - target) <= 2) return `حوالي ${word}`;
  }
  if (p === 100) return "كله";
  return `${spellInteger(p)} في المية`;
}

/** A count of things with the noun in the form Arabic gives each count: "عمليتين", "تمن عمليات", "حداشر عملية". */
export function spellCount(count: number, forms: { one: string; two: string; few: string; many: string }): string {
  const n = Math.round(Math.abs(count));
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${THOUSANDS_COUNT[n]} ${forms.few}`;
  return `${spellInteger(n)} ${forms.many}`;
}

/** A count of days: "يوم واحد", "يومين", "تلات أيام", "حداشر يوم". */
export function spellDays(count: number): string {
  return spellCount(count, { one: "يوم واحد", two: "يومين", few: "أيام", many: "يوم" });
}

function dayNumber(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** A calendar day relative to today, both as YYYY-MM-DD business days: "امبارح", "كمان تسع أيام". */
export function spellRelativeDay(targetKey: string, todayKey: string): string {
  const diff = dayNumber(targetKey) - dayNumber(todayKey);
  if (diff === 0) return "النهارده";
  if (diff === 1) return "بكرة";
  if (diff === -1) return "امبارح";
  if (diff === 2) return "بعد بكرة";
  if (diff === -2) return "أول امبارح";
  return diff > 0 ? `كمان ${spellDays(diff)}` : `من ${spellDays(-diff)}`;
}
