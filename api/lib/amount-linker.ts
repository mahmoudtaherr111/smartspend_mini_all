/**
 * SmartSpend v2 — Amount Linker
 * ══════════════════════════════
 * Context-aware amount extraction that links each amount to its
 * surrounding words (verb, noun, person). This solves the v1 problem
 * where amounts were extracted as standalone numbers with no context.
 *
 * Example:
 *   "أكلت بـ 50 وشربت بـ 30"
 *   → [{amount: 50, linkedVerb: "أكلت", linkedNoun: null, contextBefore: "أكلت بـ"},
 *      {amount: 30, linkedVerb: "شربت", linkedNoun: null, contextBefore: "شربت بـ"}]
 */

// ─── Types ────────────────────────────────────────────────────────

export interface LinkedAmount {
  /** The numeric amount */
  amount: number;
  /** Currency (default EGP) */
  currency: string;
  /** Text immediately before the amount (~3-5 words) */
  contextBefore: string;
  /** Text immediately after the amount (~3-5 words) */
  contextAfter: string;
  /** Nearest financial verb (دفعت, جالي, etc.) */
  linkedVerb: string | null;
  /** The thing being paid for (أكل, بنزين, إيجار, etc.) */
  linkedNoun: string | null;
  /** Character positions in original text */
  position: { start: number; end: number };
}

// ─── Financial Verb Categories ────────────────────────────────────

const EXPENSE_VERBS_SET = new Set([
  "دفعت",
  "صرفت",
  "اشتريت",
  "جبت",
  "ركبت",
  "اكلت",
  "أكلت",
  "شربت",
  "طلبت",
  "حجزت",
  "شحنت",
  "حاسبت",
  "سلكت",
  "طيرت",
  "خلصت",
  "سددت",
  "نزلت",
  "عزمت",
  "حولت",
  "اديت",
  "أديت",
  "وزعت",
  "جددت",
  "دفعنا",
  "صرفنا",
  "اشترينا",
  "ركبنا",
  "اكلنا",
  "شربنا",
  "طلبنا",
  "عملت",
  "غيرت",
  "صلحت",
  "قطعت",
  "وديت",
  "خرجت",
  "اتعشيت",
  "اتغديت",
  "فطرت",
  "قعدت",
  "قعدنا",
  "ضربت",
  "روحت",
  "لعبت",
  "لعبنا",
  "حجزنا",
  "شحنا",
  "حاسبنا",
  "صلحنا",
  "خرجنا",
  "اتعشينا",
  "اتغدينا",
  "فطرنا",
  "سافرنا",
  "سافرت",
  "اتفسحت",
  "اتفسحنا",
  "ضربنا",
]);

const INCOME_VERBS_SET = new Set([
  "جالي",
  "إداني",
  "اداني",
  "بعتلي",
  "وصلني",
  "وصلتلي",
  "حولولي",
  "حولوليه",
  "قبضت",
  "استلمت",
  "رجعلي",
  "رجعولي",
  "نزل",
  "اتحولتلي",
  "خدت",
  "اخدت",
]);

const ALL_VERBS = [...EXPENSE_VERBS_SET, ...INCOME_VERBS_SET];

// ─── Financial Noun Dictionary ────────────────────────────────────

const FINANCIAL_NOUNS = new Set([
  // Food
  "أكل",
  "اكل",
  "فطار",
  "غدا",
  "غداء",
  "عشا",
  "عشاء",
  "شاورما",
  "برجر",
  "بيتزا",
  "كشري",
  "سندوتش",
  "وجبة",
  "وجبه",
  "حلويات",
  "مشروبات",
  "قهوة",
  "قهوه",
  "شاي",
  "عصير",
  "نسكافيه",
  "كابتشينو",
  // Transport
  "بنزين",
  "تفويلة",
  "تفويله",
  "أوبر",
  "اوبر",
  "كريم",
  "مترو",
  "تاكسي",
  "تكسي",
  "توكتوك",
  "ركنة",
  "ركنه",
  "سايس",
  "كارتة",
  "كارته",
  // Bills
  "كهرباء",
  "كهربا",
  "ميه",
  "مياه",
  "غاز",
  "نت",
  "انترنت",
  "إنترنت",
  "رصيد",
  "شحن",
  "قسط",
  "أقساط",
  "اقساط",
  "فاتورة",
  "فاتوره",
  "تأمين",
  // Home
  "إيجار",
  "ايجار",
  "اجار",
  "عفش",
  "أثاث",
  // Shopping
  "هدوم",
  "لبس",
  "ملابس",
  "موبايل",
  "لاب",
  "جزمة",
  "جزمه",
  // Health
  "دكتور",
  "صيدلية",
  "صيدليه",
  "علاج",
  "دوا",
  "كشف",
  "تحاليل",
  // Education
  "كورس",
  "كورسات",
  "درس",
  "دروس",
  "مدرسة",
  "مدرسه",
  "جامعة",
  "جامعه",
  // Smoking
  "سجاير",
  "سجائر",
  "فيب",
  "شيشة",
  "شيشه",
  "معسل",
  // Financial
  "مرتب",
  "راتب",
  "مكافأة",
  "مكافاه",
  "بونص",
  "جمعية",
  "جمعيه",
  "سلفة",
  "سلفه",
  "دين",
  // Savings/Investment
  "ذهب",
  "دهب",
  "سبيكة",
  "سبيكه",
  "شهادة",
  "شهاده",
  "أسهم",
  "اسهم",
]);

// ─── Amount Extraction ────────────────────────────────────────────

/** Main amount pattern — matches digits with optional decimals and thousands separators */
const AMOUNT_PATTERN = /(\d+(?:[.,]\d{3})*(?:[.,]\d+)?)/g;

/** Currency indicators that follow an amount */
const CURRENCY_SUFFIX = /^\s*(?:جنيه|ج\.م|ج(?:\s|$)|دولار|\$|يورو|€|ريال|درهم)/;

/** Prefix patterns (بـ50, بـ 50) */
const AMOUNT_PREFIX = /(?:بـ?\s*|لـ?\s*)$/;

/**
 * Extract amounts with their surrounding context from text.
 * Links each amount to the nearest financial verb and noun.
 */
export function extractLinkedAmounts(text: string): LinkedAmount[] {
  const amounts: LinkedAmount[] = [];
  let match: RegExpExecArray | null;

  // Reset regex
  AMOUNT_PATTERN.lastIndex = 0;

  while ((match = AMOUNT_PATTERN.exec(text)) !== null) {
    let numStr = match[1];
    // Handle thousands separator (comma followed by exactly 3 digits) vs decimal comma
    if (numStr.includes(",") && numStr.split(",")[1].length === 3) {
      numStr = numStr.replace(/,/g, "");
    } else {
      numStr = numStr.replace(",", ".");
    }
    const amount = parseFloat(numStr);

    if (isNaN(amount) || amount <= 0) continue;

    const start = match.index;
    const end = start + match[0].length;

    // Extract context before (up to 40 chars / ~5 words)
    const beforeStart = Math.max(0, start - 40);
    const rawBefore = text.slice(beforeStart, start).trim();
    const contextBefore = rawBefore.split(/\s+/).slice(-5).join(" ");

    // Extract context after (up to 40 chars / ~5 words)
    const afterEnd = Math.min(text.length, end + 40);
    const rawAfter = text.slice(end, afterEnd).trim();
    const contextAfter = rawAfter.split(/\s+/).slice(0, 5).join(" ");

    // Detect currency
    let currency = "EGP";
    if (/دولار|\$/i.test(contextAfter)) currency = "USD";
    else if (/يورو|€/.test(contextAfter)) currency = "EUR";
    else if (/ريال/.test(contextAfter)) currency = "SAR";
    else if (/درهم/.test(contextAfter)) currency = "AED";

    // Find nearest verb (search in context before first, then after)
    const linkedVerb =
      findNearestVerb(contextBefore) || findNearestVerb(contextAfter);

    // Find nearest financial noun
    const linkedNoun =
      findNearestNoun(contextBefore) || findNearestNoun(contextAfter);

    amounts.push({
      amount,
      currency,
      contextBefore,
      contextAfter,
      linkedVerb,
      linkedNoun,
      position: { start, end },
    });
  }

  return amounts;
}

/**
 * Find the nearest financial verb in a text fragment.
 */
function findNearestVerb(text: string): string | null {
  if (!text) return null;
  const words = text.split(/\s+/);

  // Search from end to beginning (nearest to the amount)
  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i];
    if (EXPENSE_VERBS_SET.has(word) || INCOME_VERBS_SET.has(word)) {
      return word;
    }
  }

  // Try partial match (handles attached particles like "واشتريت")
  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i];
    for (const verb of ALL_VERBS) {
      if (word.includes(verb) && verb.length >= 3) return verb;
    }
  }

  return null;
}

/**
 * Find the nearest financial noun in a text fragment.
 */
function findNearestNoun(text: string): string | null {
  if (!text) return null;
  const words = text.split(/\s+/);

  // Search from end to beginning
  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i].replace(/^ال/, ""); // Remove definite article
    if (FINANCIAL_NOUNS.has(word) || FINANCIAL_NOUNS.has(words[i])) {
      return words[i];
    }
  }

  return null;
}

/**
 * Map each extracted amount to the segment it most likely belongs to.
 * Uses text position overlap to determine association.
 */
export function linkAmountsToSegments(
  amounts: LinkedAmount[],
  segmentTexts: string[],
  originalText: string,
): Map<number, LinkedAmount[]> {
  const result = new Map<number, LinkedAmount[]>();

  // Initialize empty arrays for each segment
  for (let i = 0; i < segmentTexts.length; i++) {
    result.set(i, []);
  }

  // Find each segment's position in the original text
  const segmentPositions: Array<{ start: number; end: number }> = [];
  let searchFrom = 0;
  for (const segText of segmentTexts) {
    const idx = originalText.indexOf(segText.trim(), searchFrom);
    if (idx >= 0) {
      segmentPositions.push({ start: idx, end: idx + segText.trim().length });
      searchFrom = idx + 1;
    } else {
      segmentPositions.push({
        start: searchFrom,
        end: searchFrom + segText.length,
      });
    }
  }

  // Assign each amount to the best-matching segment
  for (const amount of amounts) {
    let bestSegment = 0;
    let bestOverlap = -1;

    for (let i = 0; i < segmentPositions.length; i++) {
      const seg = segmentPositions[i];
      // Check if the amount position overlaps with this segment
      if (
        amount.position.start >= seg.start &&
        amount.position.start <= seg.end
      ) {
        const overlap =
          Math.min(amount.position.end, seg.end) - amount.position.start;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestSegment = i;
        }
      }
    }

    result.get(bestSegment)!.push(amount);
  }

  return result;
}
