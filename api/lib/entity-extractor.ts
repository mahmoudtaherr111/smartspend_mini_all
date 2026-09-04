/**
 * SmartSpend Entity Extractor (Step 2)
 * Extracts amounts, currencies, people, merchants from normalized text
 */

import { extractCurrency } from "./text-normalizer";
import { isLikelyPersonName, isKareemPersonContext } from "./egyptian-names-dictionary";
import { matchArabicPhrase } from "./fuzzy-match";
import { parseNumericLiteral, parseArabicNumbers } from "./arabic-number-parser";
import { NON_PERSON_TERMS } from "./person-resolver";

export interface ExtractedAmount {
  amount: number;
  index: number;
  length: number;
  rawMatch: string;
}

export interface ExtractedEntities {
  amounts: ExtractedAmount[];
  currency: string;
  people: string[];
  merchants: string[];
  hasMultipleTransactions: boolean;
  places: string[];
  paymentMethods: string[];
  dateHints: string[];
}

/** Known merchant patterns */
export const MERCHANT_PATTERNS: Record<string, string> = {
  ماكدونالدز: "McDonald's",
  كنتاكي: "KFC",
  هارديز: "Hardee's",
  "بيتزا هت": "Pizza Hut",
  "برجر كينج": "Burger King",
  بافلو: "Buffalo Burger",
  كشري: "Koshary",
  الشبراوي: "El Shabrawy",
  "ابو طارق": "Abu Tarek",
  اوبر: "Uber",
  كريم: "Careem",
  سويفل: "Swvl",
  نتفلكس: "Netflix",
  سبوتيفاي: "Spotify",
  شاهد: "Shahid",
  فودافون: "Vodafone",
  اورنج: "Orange",
  اتصالات: "Etisalat",
  وي: "WE",
  فوري: "Fawry",
  انستاباي: "Instapay",
  فاليو: "valu",
  زارا: "Zara",
  اديداس: "Adidas",
  نايكي: "Nike",
  كارفور: "Carrefour",
  سبينيس: "Spinneys",
};


const TRANSFER_VERBS = [
  "اديت", "أديت", "إديت", "حولت", "بعت", "سلفت", "بعتت", 
  "عطيت", "عطي", "حولي", "حولولي", "بعتلي", 
  "اداني", "إداني", "جابلي", "عزمت", "دعيت",
  "خدت", "اخدت", "أخدت", "خد", "اخد", "أخد", "استلمت", "قبضت", "استلفت"
];

const PLACE_PATTERNS = [
  "كورنيش",
  "سينما",
  "كافيه",
  "جيم",
  "مكتب",
  "جامعة",
  "مدرسة",
  "بيت",
  "شغل",
];

const PAYMENT_METHOD_PATTERNS = [
  "كاش",
  "فيزا",
  "ماستر",
  "محفظة",
  "انستاباي",
  "فودافون كاش",
  "تحويل",
];

const DATE_HINT_PATTERNS = [
  "النهاردة",
  "امبارح",
  "أول امبارح",
  "اول امبارح",
  "بكرة",
  "آخر الشهر",
  "بداية الشهر",
  "نص الشهر",
  "الاسبوع ده",
];

/**
 * Check if the number match is in a valid financial context
 */
export function isFinancialContext(text: string, matchIndex: number, matchLength: number): boolean {
  const precedingStr = text.substring(0, matchIndex).trim();
  const followingStr = text.substring(matchIndex + matchLength).trim();

  // Get last word of preceding string
  const precedingWords = precedingStr.split(/\s+/);
  const lastPrecedingWord = precedingWords[precedingWords.length - 1] || "";
  
  // Get first word of following string
  const followingWords = followingStr.split(/\s+/);
  const firstFollowingWord = followingWords[0] || "";

  const normalizeWord = (w: string) => {
    return w
      .replace(/[^\u0600-\u06FFa-zA-Z]/g, "") // Keep only Arabic and English letters
      .replace(/^[وفبل]/, "") // Strip prefixes
      .replace(/^ال/, "") // Strip definite article
      .replace(/[إأآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .trim();
  };

  const normPreceding = normalizeWord(lastPrecedingWord);
  const normFollowing = normalizeWord(firstFollowingWord);

  const PRECEDING_NON_FINANCIAL = [
    "شقة", "شقه", "دور", "الدور", "شارع", "سنة", "سنه", "عام", "رقم", "تليفون", "موبايل", "بوابة", "بوابه", "كود", "رمز", "سنتين", "يومين", "ساعتين", "شهرين",
    "room", "flat", "apt", "apartment", "floor", "street", "st", "year", "yr", "no", "number", "phone", "mobile", "gate", "code", "pin"
  ].map(w => w.replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase());

  const FOLLOWING_NON_FINANCIAL = [
    "ساعة", "ساعه", "ساعات", "يوم", "ايام", "أيام", "مرة", "مره", "مرات", "سنة", "سنه", "عام", "بوابة", "بوابه", "دقيقة", "دقيقه", "دقايق", "شهر", "شهور",
    "سنتين", "يومين", "ساعتين", "دقيقتين", "شهرين", "اسبوع", "أسبوع", "اسابيع", "أسابيع", "اسبوعين", "أسبوعين",
    "hour", "hours", "hr", "hrs", "day", "days", "d", "time", "times", "year", "years", "yr", "yrs", "gate", "gates",
    "minute", "minutes", "min", "mins", "month", "months", "mo", "mos", "week", "weeks", "wk", "wks", "second", "seconds", "sec", "secs"
  ].map(w => w.replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase());

  // "الساعة خمسة" is a clock time, not five pounds. Requires the definite article and a
  // plausible clock value, so a wristwatch — "اشتريت ساعة بـ 500" — is still an amount.
  const rawPreceding = lastPrecedingWord.replace(/[^؀-ۿ]/g, "");
  if (/^(?:و|ف)?ال(?:ساعة|ساعه)$/.test(rawPreceding)) {
    const value = parseFloat(text.substr(matchIndex, matchLength).replace(/[^\d.]/g, ""));
    if (Number.isFinite(value) && value >= 1 && value <= 24) return false;
  }

  if (PRECEDING_NON_FINANCIAL.includes(normPreceding)) {
    return false;
  }

  if (FOLLOWING_NON_FINANCIAL.includes(normFollowing)) {
    return false;
  }

  return true;
}

/**
 * Extract all amounts from text
 */
export function extractAmounts(rawText: string): ExtractedAmount[] {
  let text = rawText;
  const amounts: ExtractedAmount[] = [];

  // The compositional engine sees the text FIRST, and whole.
  //
  // A six-entry substitution table used to run before it: "ألفين" and "خمسمية" were
  // each found by `indexOf`, recorded as separate amounts, and blanked out — so
  // "الفين وخمسمية" reached the engine as an empty string and produced 2000 and 500,
  // two transactions from one. Every entry in that table (ألفين, ميتين, مائتين,
  // ألفين ونص) is something the engine already composes correctly on its own; the
  // table's only effect was to pre-empt it.
  //
  // This is the third such table. An earlier commit claimed to have replaced "three
  // substitution tables" with one engine and removed two — this one survived, and
  // being first in the pipeline it overrode the engine that replaced it.
  text = parseArabicNumbers(text);
  const amountPattern = /(\d+(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(جنيه|ج\.م|ج|الف|ألف)?/g;
  let match;

  while ((match = amountPattern.exec(text)) !== null) {
    // One implementation of "what does a comma mean", shared with the number engine.
    // Keeping a second copy here is what let the two drift apart.
    let amount = parseNumericLiteral(match[1]);
    const suffix = match[2]?.trim();
    if (suffix === "الف" || suffix === "ألف") amount *= 1000;
    if (amount <= 0 || amount > 10000000) continue;
    // The pattern captures digits only, so a leading minus sign is invisible to it and
    // "صرفت -50" used to become a 50 EGP expense. A negative amount is malformed input,
    // not a transaction.
    if (/-\s*$/.test(text.slice(0, match.index))) continue;
    if (amount < 100 && !suffix && !isFinancialContext(text, match.index, match[0].length)) continue;
    amounts.push({
      amount,
      index: match.index,
      length: match[0].length,
      rawMatch: match[0],
    });
  }

  amounts.sort((a, b) => a.index - b.index);

  return amounts;
}

/**
 * Extract people names from text with profile context and dictionary
 */
/**
 * If a candidate starts with "عبد" but is NOT followed by an inline "ال"-prefixed
 * theophoric component (e.g. "عبدالرحمن" already in the dictionary), try to
 * greedily consume the next word from the source text when it begins with "ال",
 * forming the canonical multi-word name "عبد الرحمن".
 *
 * This preserves the most common Arabic name pattern without fragmenting it
 * into "عبد" + "الرحمن" (the latter of which would be rejected by `ال` prefix guard).
 *
 * Returns the (possibly extended) candidate or the original if no extension applies.
 */
function tryExtendTheophoric(
  candidate: string,
  words: string[],
  candidateIndex: number,
): string {
  if (!candidate) return candidate;
  // Only extend bare "عبد" tokens that aren't already recognised as a name on their own.
  if (candidate !== "عبد" && candidate !== "عبده") return candidate;
  // Look at the next word in the SOURCE text (candidateIndex points to the token
  // in `words` from which `candidate` was derived).
  const nextRaw = words[candidateIndex + 1];
  if (!nextRaw) return candidate;
  const nextClean = nextRaw.replace(/[^\u0600-\u06FF]/g, "");
  if (!nextClean) return candidate;
  if (nextClean.startsWith("ال") && nextClean.length > 3) {
    const combined = `${candidate} ${nextClean}`;
    return combined;
  }
  return candidate;
}

export function extractPeople(
  text: string,
  knownNames: string[] = [],
): string[] {
  const people: Set<string> = new Set();

  // 1. Direct match with known names from profile (no pattern needed)
  for (const name of knownNames) {
    if (name && matchArabicPhrase(text, name)) {
      people.add(name);
    }
  }

  // 2. Context-Aware Windowing for dynamic extraction
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const cleanWord = words[i].replace(/[^\u0600-\u06FF]/g, "");
    const baseWord = cleanWord.replace(/^[وف]/, "");
    
    if (TRANSFER_VERBS.includes(cleanWord) || TRANSFER_VERBS.includes(baseWord)) {
      // Look ahead up to 5 words
      const windowSize = Math.min(words.length - i - 1, 5);
      for (let j = 1; j <= windowSize; j++) {
        let rawCandidate = words[i + j].replace(/[^\u0600-\u06FF]/g, "");
        if (!rawCandidate) continue;

        let candidateWithoutPrefix = rawCandidate.replace(/^[وف]/, "");
        let candidatesToTest = [rawCandidate, candidateWithoutPrefix];

        for (let c of candidatesToTest) {
          let candidate = c;

          // Clean "لـ" or "ل" prefixes
          if (candidate.startsWith("لـ") && candidate.length > 2) {
            candidate = candidate.substring(2);
          } else if (candidate.startsWith("ل") && candidate.length > 3) {
            if (!isLikelyPersonName(candidate) && isLikelyPersonName(candidate.substring(1))) {
              candidate = candidate.substring(1);
            }
          }

          if (candidate.length >= 2 && !/^[\d\u0660-\u0669\u06F0-\u06F9]+$/.test(candidate)) {
            // Exclude words starting with "ال" (definite article) unless they are known contacts
            if (candidate.startsWith("ال") && !knownNames.includes(candidate)) {
              continue;
            }

            const NON_PEOPLE = ["الجمعية", "الجمعيه", "جمعية", "جمعيه", "مقاول", "سباك", "كهربائي", "صنايعي", "دكتور"];
            if (NON_PEOPLE.includes(candidate) || (NON_PERSON_TERMS.has(candidate) && !knownNames.includes(candidate))) {
                continue;
            }

            // Multi-word theophoric names: "عبد الرحمن", "عبد الله", " عبد الكريم"
            // recognised via greedy extension of bare "عبد".
            candidate = tryExtendTheophoric(candidate, words, i + j);

            const isKnownName = knownNames.includes(candidate) || knownNames.some((kn) => kn === candidate || matchArabicPhrase(kn, candidate));
            if (isLikelyPersonName(candidate) || isLikelyPersonName(candidate.replace(/\s+/g, "")) || isKnownName) {
              people.add(candidate);
              break; // Found a valid person for THIS candidate string, but we want to process other words
            }
          }
        }
      }
    }
  }

  // 3. Scan for preposition-prefixed person names (e.g., لعلي, لمروان, لأحمد, للوالد, مع مروان)
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let rawWord = word.replace(/[^\u0600-\u06FF]/g, "");
    if (!rawWord) continue;
    
    let candidate = "";
    let candidateSourceIndex = i; // index in `words` that produced `candidate`
    if (rawWord.startsWith("لـ") && rawWord.length > 2) {
      candidate = rawWord.substring(2);
    } else if (rawWord.startsWith("لل") && rawWord.length > 3) {
      candidate = rawWord.substring(2);
    } else if (rawWord.startsWith("ل") && rawWord.length > 2) {
      candidate = rawWord.substring(1);
    } else if (rawWord.startsWith("من") && rawWord.length > 3) {
      candidate = rawWord.substring(2);
    } else if (rawWord.startsWith("مع") && rawWord.length > 3) {
      candidate = rawWord.substring(2);
    } else if (rawWord === "من" || rawWord === "مع") {
      if (i + 1 < words.length) {
        candidate = words[i + 1].replace(/[^\u0600-\u06FF]/g, "");
        candidateSourceIndex = i + 1;
      }
    }
    
    if (candidate) {
      let cleanCandidate = candidate.replace(/^[وف]/, "");
      const candidatesToTest = [candidate, cleanCandidate];
      for (const c of candidatesToTest) {
        if (c.length >= 2 && !/^[\d\u0660-\u0669\u06F0-\u06F9]+$/.test(c)) {
          if (c.startsWith("ال") && !knownNames.includes(c)) {
            continue;
          }

          // Multi-word theophoric names — extend bare "عبد" with next "ال"-prefixed token.
          const extended = tryExtendTheophoric(c, words, candidateSourceIndex);
          const variants = extended === c ? [c] : [extended, c];

          for (const v of variants) {
            if (v.length < 2 || /^[\d\u0660-\u0669\u06F0-\u06F9]+$/.test(v)) continue;
            if (v.startsWith("ال") && !knownNames.includes(v)) continue;
            const isKnownName = knownNames.includes(v) || knownNames.some((kn) => kn === v || matchArabicPhrase(kn, v));
            if (isLikelyPersonName(v) || isLikelyPersonName(v.replace(/\s+/g, "")) || isKnownName) {
              people.add(v);
              break;
            }
          }
        }
      }
    }
  }

  // Filter out definitely NOT people (like merchants misclassified)
  const filtered = Array.from(people).filter((name) => {
    // We already added it if it's in knownNames, keep it regardless
    if (knownNames.includes(name)) return true;

    // If it's a known merchant, it's NOT a person
    if (
      Object.keys(MERCHANT_PATTERNS).some((k) => k === name || (name.includes(k) && !name.startsWith("عبد ")))
    ) {
      // Context-aware disambiguation for "كريم"
      if (name === "كريم" || name === "كرييم") {
        if (isKareemPersonContext(text)) return true;
      }
      return false;
    }

    // Explicitly ignore places
    if (PLACE_PATTERNS.some((p) => p === name || name.includes(p))) {
      return false;
    }

    // Exclude common verbs, pronouns, and filler words using the unified NON_PERSON_TERMS
    if (NON_PERSON_TERMS.has(name) || NON_PERSON_TERMS.has(name.toLowerCase())) {
      const reg = new RegExp(`(?:^|\\s)(?:ل|لل|من|مع|ب)${name}(?:\\s|$)`);
      if ((name === "علي" || name === "على") && reg.test(text)) {
         return true;
      }
      return false;
    }
    const norm = name.replace(/[إأآٱ]/g, "ا").replace(/ة/g, "ه");
    if (NON_PERSON_TERMS.has(norm)) {
      const reg = new RegExp(`(?:^|\\s)(?:ل|لل|من|مع|ب)${norm}(?:\\s|$)`);
      if ((norm === "علي" || norm === "على") && reg.test(text)) {
         return true;
      }
      return false;
    }

    return true;
  });

  return filtered;
}

/**
 * Extract merchant names from text
 */
export function extractMerchants(text: string): string[] {
  const merchants: string[] = [];
  for (const [ar, en] of Object.entries(MERCHANT_PATTERNS)) {
    if (matchArabicPhrase(text, ar)) {
      merchants.push(en);
    }
  }
  return merchants;
}

function extractPlaces(text: string): string[] {
  return PLACE_PATTERNS.filter((p) => matchArabicPhrase(text, p));
}

function extractPaymentMethods(text: string): string[] {
  return PAYMENT_METHOD_PATTERNS.filter((p) => matchArabicPhrase(text, p));
}

function extractDateHints(text: string): string[] {
  return DATE_HINT_PATTERNS.filter((p) => matchArabicPhrase(text, p));
}

/**
 * Full entity extraction
 */
export function extractEntities(
  normalizedText: string,
  knownNames: string[] = [],
): ExtractedEntities {
  const amounts = extractAmounts(normalizedText);
  const currency = extractCurrency(normalizedText);
  const people = extractPeople(normalizedText, knownNames);
  const merchants = extractMerchants(normalizedText);

  // Detect multi-transaction indicators
  const multiIndicators = ["و", "وكمان", "وبعدين", "بعدها", "ومنهم", "ومنه"];
  const hasMultipleTransactions =
    amounts.length > 1 ||
    multiIndicators.some((ind) => normalizedText.includes(` ${ind} `));
  const places = extractPlaces(normalizedText);
  const paymentMethods = extractPaymentMethods(normalizedText);
  const dateHints = extractDateHints(normalizedText);

  return {
    amounts,
    currency,
    people,
    merchants,
    hasMultipleTransactions,
    places,
    paymentMethods,
    dateHints,
  };
}
