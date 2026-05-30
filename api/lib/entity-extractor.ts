/**
 * SmartSpend Entity Extractor (Step 2)
 * Extracts amounts, currencies, people, merchants from normalized text
 */

import { extractCurrency } from "./text-normalizer";
import { isLikelyPersonName } from "./egyptian-names-dictionary";
import { matchArabicPhrase } from "./fuzzy-match";
import { parseArabicNumbers } from "./arabic-number-parser";

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
const MERCHANT_PATTERNS: Record<string, string> = {
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

const PERSON_PATTERNS = [
  /(?:^|\s)(?:حولت|اديت|سلفت|بعتت|عطيت|عطي)\s+(?:ل|لـ|الى|إلى)\s*([ا-ي]{2,})/g,
  /(?:^|\s)(?:حولت|اديت|سلفت|بعتت|عطيت|عطي)\s+([ا-ي]{3,})/g,
  /(?:^|\s)(?:من|عند)\s+([ا-ي]{3,})/g,
  /(?:^|\s)(?:حولي|حولولي|بعتلي|اداني|جابلي)\s+([ا-ي]{2,})/g,
  /(?:^|\s)(?:ادفع|صرفت|اشتريت|جبت)\s+(?:ل|لـ|على)\s*([ا-ي]{2,})/g,
  /(?:^|\s)(?:عزمت|دعيت)\s+([ا-ي]{3,})/g,
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
 * Extract all amounts from text
 */
export function extractAmounts(text: string): ExtractedAmount[] {
  text = parseArabicNumbers(text);
  const amounts: ExtractedAmount[] = [];
  const amountPattern = /(\d+(?:[.,]\d+)?(?:[.,]\d+)?)\s*(جنيه|ج\.م|ج|الف|ألف)?/g;
  let match;

  while ((match = amountPattern.exec(text)) !== null) {
    let cleanNum = match[1];
    if (cleanNum.includes(",") && cleanNum.split(",")[1].length === 3) {
      cleanNum = cleanNum.replace(/,/g, "");
    } else {
      cleanNum = cleanNum.replace(",", ".");
    }
    let amount = parseFloat(cleanNum);
    const suffix = match[2]?.trim();
    if (suffix === "الف" || suffix === "ألف") amount *= 1000;
    if (amount <= 0 || amount > 50000000) continue;
    amounts.push({
      amount,
      index: match.index,
      length: match[0].length,
      rawMatch: match[0],
    });
  }

  return amounts;
}

/**
 * Extract people names from text with profile context and dictionary
 */
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

  // 2. Pattern-based extraction
  for (const pattern of PERSON_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      let name = match[1]?.trim();
      // clean prefixes if matched dynamically
      if (
        name.startsWith("ل") &&
        name.length > 2 &&
        !isLikelyPersonName(name) &&
        isLikelyPersonName(name.substring(1))
      ) {
        name = name.substring(1);
      }
      if (name && name.length >= 2 && !/^\d+$/.test(name)) {
        people.add(name);
      }
    }
  }

  // 3. Dictionary-based extraction (if a word is a known name and isn't a merchant)
  const words = text.split(/\s+/);
  for (const word of words) {
    let cleanWord = word.replace(/[^ا-ي]/g, ""); // strip punctuation
    if (
      !isLikelyPersonName(cleanWord) &&
      cleanWord.length > 3 &&
      /^[بلف]/.test(cleanWord)
    ) {
      if (isLikelyPersonName(cleanWord.substring(1))) {
        cleanWord = cleanWord.substring(1);
      }
    }
    if (isLikelyPersonName(cleanWord)) {
      people.add(cleanWord);
    }
  }

  // Filter out definitely NOT people (like merchants misclassified by "من كارفور")
  const filtered = Array.from(people).filter((name) => {
    // We already added it if it's in knownNames, keep it regardless
    if (knownNames.includes(name)) return true;

    // If it's a known merchant, it's NOT a person
    if (
      Object.keys(MERCHANT_PATTERNS).some((k) => k === name || name.includes(k))
    ) {
      return false;
    }

    // Exclude common verbs, pronouns, and filler words that get caught by patterns
    const EXCLUDED = [
      "انا", "انت", "هو", "هي", "احنا", "هما", 
      "اديت", "خدت", "بعت", "حولت", "صرفت", "جبت", "اخدت", "دفعت", "عطيت",
      "عشان", "عشانك", "علشان", "نفسي", "بتاع", "بتاعتي",
      "الشغل", "البيت", "المحل", "السوبر", "ماركت", "كورة", "فلوس", "جنيه", 
      "الف", "سلف", "ديون", "دين", "جمعية", "قسط", "ايجار", "الايجار", "كهربا", "ميه", "غاز"
    ];
    if (EXCLUDED.includes(name)) {
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
