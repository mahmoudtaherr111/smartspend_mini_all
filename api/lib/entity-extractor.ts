/**
 * SmartSpend Entity Extractor (Step 2)
 * Extracts amounts, currencies, people, merchants from normalized text
 */

import { extractCurrency } from "./text-normalizer";

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
  "ماكدونالدز": "McDonald's", "كنتاكي": "KFC", "هارديز": "Hardee's",
  "بيتزا هت": "Pizza Hut", "برجر كينج": "Burger King", "بافلو": "Buffalo Burger",
  "كشري": "Koshary", "الشبراوي": "El Shabrawy", "ابو طارق": "Abu Tarek",
  "اوبر": "Uber", "كريم": "Careem", "سويفل": "Swvl",
  "نتفلكس": "Netflix", "سبوتيفاي": "Spotify", "شاهد": "Shahid",
  "فودافون": "Vodafone", "اورنج": "Orange", "اتصالات": "Etisalat", "وي": "WE",
  "فوري": "Fawry", "انستاباي": "Instapay", "فاليو": "valu",
  "زارا": "Zara", "اديداس": "Adidas", "نايكي": "Nike",
  "كارفور": "Carrefour", "سبينيس": "Spinneys",
};

/** Person name detection (simple: after لـ / ل / من) */
const PERSON_PATTERNS = [
  /(?:حولت|اديت|سلفت|بعتت)\s+(?:ل|لـ)\s*(\S+)/g,
  /(?:من|عند)\s+(\S+)/g,
  /(?:حولي|حولولي|بعتلي)\s+(\S+)/g,
];

const PLACE_PATTERNS = [
  "كورنيش", "سينما", "كافيه", "جيم", "مكتب", "جامعة", "مدرسة", "بيت", "شغل",
];

const PAYMENT_METHOD_PATTERNS = [
  "كاش", "فيزا", "ماستر", "محفظة", "انستاباي", "فودافون كاش", "تحويل",
];

const DATE_HINT_PATTERNS = [
  "النهاردة", "امبارح", "أول امبارح", "اول امبارح", "بكرة", "آخر الشهر", "بداية الشهر", "نص الشهر", "الاسبوع ده",
];

/**
 * Extract all amounts from text
 */
export function extractAmounts(text: string): ExtractedAmount[] {
  const amounts: ExtractedAmount[] = [];
  const amountPattern = /(\d+(?:\.\d+)?)\s*(جنيه|ج\.م|ج|الف|ألف)?/g;
  let match;

  while ((match = amountPattern.exec(text)) !== null) {
    let amount = parseFloat(match[1]);
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
 * Extract people names from text
 */
export function extractPeople(text: string): string[] {
  const people: string[] = [];
  for (const pattern of PERSON_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length >= 2 && !/^\d+$/.test(name)) {
        people.push(name);
      }
    }
  }
  return [...new Set(people)];
}

/**
 * Extract merchant names from text
 */
export function extractMerchants(text: string): string[] {
  const merchants: string[] = [];
  for (const [ar, en] of Object.entries(MERCHANT_PATTERNS)) {
    if (text.includes(ar)) {
      merchants.push(en);
    }
  }
  return merchants;
}

function extractPlaces(text: string): string[] {
  return PLACE_PATTERNS.filter((p) => text.includes(p));
}

function extractPaymentMethods(text: string): string[] {
  return PAYMENT_METHOD_PATTERNS.filter((p) => text.includes(p));
}

function extractDateHints(text: string): string[] {
  return DATE_HINT_PATTERNS.filter((p) => text.includes(p));
}

/**
 * Full entity extraction
 */
export function extractEntities(normalizedText: string): ExtractedEntities {
  const amounts = extractAmounts(normalizedText);
  const currency = extractCurrency(normalizedText);
  const people = extractPeople(normalizedText);
  const merchants = extractMerchants(normalizedText);

  // Detect multi-transaction indicators
  const multiIndicators = ["و", "وكمان", "وبعدين", "بعدها", "ومنهم", "ومنه"];
  const hasMultipleTransactions = amounts.length > 1 ||
    multiIndicators.some(ind => normalizedText.includes(` ${ind} `));
  const places = extractPlaces(normalizedText);
  const paymentMethods = extractPaymentMethods(normalizedText);
  const dateHints = extractDateHints(normalizedText);

  return { amounts, currency, people, merchants, hasMultipleTransactions, places, paymentMethods, dateHints };
}
