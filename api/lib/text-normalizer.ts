/**
 * SmartSpend Text Normalizer (Step 1)
 * Normalizes Arabic/Egyptian text for financial parsing
 * Enhanced with STT error correction (Phase 1 of Intelligence Plan)
 */

import { applySttCorrections } from "./stt-corrections";
import { parseArabicNumbers } from "./arabic-number-parser";

/**
 * Franco-Arab (Arabizi) Converter
 * Converts Egyptian Franco-Arab text (Latin + digits as Arabic letters) to Arabic.
 * Only processes words that mix Latin letters with specific digits — standalone
 * numbers (amounts) are never touched.
 * Common patterns: "7awalte" → حولت, "dafa3t" → دفعت, "kahraba" → كهربا
 */
const FRANCO_DIGIT_TO_ARABIC: Record<string, string> = {
  "2": "ء", "3": "ع", "5": "خ", "6": "ط", "7": "ح", "8": "غ", "9": "ق",
};

const FRANCO_LETTER_TO_ARABIC: Record<string, string> = {
  a: "ا", b: "ب", c: "ك", d: "د", e: "ي", f: "ف", g: "ج", h: "ه",
  i: "ي", j: "ج", k: "ك", l: "ل", m: "م", n: "ن", o: "و", p: "ب",
  q: "ق", r: "ر", s: "س", t: "ت", u: "و", v: "ف", w: "و", x: "ك",
  y: "ي", z: "ز",
};

const FRANCO_ARAB_DICT: Record<string, string> = {
  "7awalte": "حولت", "7awalt": "حولت", "7awalteh": "حولت",
  "dafa3t": "دفعت", "dafaat": "دفعت", "dafa't": "دفعت",
  "kahraba": "كهربا", "kahrb": "كهربا", "kahriba": "كهربا",
  "el": "ال", "elkahraba": "الكهربا",
  "3agbni": "عجبني", "3agbnii": "عجبني",
  "5od": "خد", "5odi": "خدي",
  "7atet": "حطيت", "7atyt": "حطيت",
  "salafte": "سلفت", "salaf": "سلف",
  "akalt": "اكلت", "akaltu": "اكلت",
  "shribt": "شربت", "sh8rbt": "شربت",
  "3la": "على", "ala": "على",
  "feen": "فين", "fen": "فين",
  "3ashan": "عشان", "ashan": "عشان",
  "3ala": "على",
  "masry": "مصري", "masri": "مصري",
  "flous": "فلوس", "floos": "فلوس",
  "gneh": "جنيه", "geneh": "جنيه",
  "benzin": "بنزين", "banzeen": "بنزين",
  "kahwa": "قهوة", "qahwa": "قهوة",
  "akl": "أكل", "akel": "أكل",
  "atm": "ATM", "ATM": "ATM",
  "3": "ع", "7": "ح", "5": "خ", "6": "ط", "8": "غ", "9": "ق",

  // Names and brands, which letter-by-letter transliteration mangles beyond recognition:
  // "Ahmed" came out "اهميد" and "instapay" came out "ينستاباي", so the person was never
  // resolved and the wallet was never recognised — "7awalt 500 gneh l Ahmed 3ala
  // instapay" lost both the friend and the rail it went over.
  "ahmed": "أحمد", "a7med": "أحمد", "ahmad": "أحمد",
  "mohamed": "محمد", "mohammed": "محمد", "m7amed": "محمد", "mo7amed": "محمد",
  "mahmoud": "محمود", "ma7moud": "محمود", "mahmod": "محمود",
  "mostafa": "مصطفى", "mustafa": "مصطفى", "mos6afa": "مصطفى",
  "ali": "علي", "3ali": "علي", "omar": "عمر", "3omar": "عمر",
  "khaled": "خالد", "5aled": "خالد", "hassan": "حسن", "7assan": "حسن",
  "hussein": "حسين", "7ussein": "حسين", "7osseen": "حسين",
  "youssef": "يوسف", "yousef": "يوسف", "yusuf": "يوسف",
  "ibrahim": "إبراهيم", "3abdo": "عبده", "abdo": "عبده",
  "amr": "عمرو", "3amr": "عمرو", "tarek": "طارق", "6arek": "طارق",
  "sherif": "شريف", "cherif": "شريف", "ashraf": "أشرف",
  "sameh": "سامح", "wael": "وائل", "yasser": "ياسر", "ayman": "أيمن",
  "ehab": "إيهاب", "magdy": "مجدي", "nader": "نادر", "sami": "سامي",
  "tamer": "تامر", "walid": "وليد", "waleed": "وليد", "ziad": "زياد",
  "marwan": "مروان", "seif": "سيف", "saif": "سيف", "hamza": "حمزة",
  "emad": "عماد", "3emad": "عماد", "adel": "عادل", "karim": "كريم",
  "sara": "سارة", "sarah": "سارة", "mariam": "مريم", "maryam": "مريم",
  "nour": "نور", "menna": "منة", "salma": "سلمى", "hana": "هنا",
  "mona": "منى", "heba": "هبة", "dina": "دينا", "aya": "آية",
  "esraa": "إسراء", "asmaa": "أسماء", "fatma": "فاطمة", "zeinab": "زينب",
  "amira": "أميرة", "hoda": "هدى", "nada": "ندى", "rana": "رنا", "rania": "رانيا",

  "instapay": "انستاباي", "insta pay": "انستاباي",
  "fawry": "فوري", "fawri": "فوري",
  "telda": "تيلدا", "valu": "فاليو", "aman": "أمان", "meeza": "ميزة",
  "vodafone": "فودافون", "vf": "فودافون", "orange": "اورنج",
  "etisalat": "اتصالات", "we": "وي",
  "uber": "اوبر", "careem": "كريم", "swvl": "سويفل", "didi": "ديدي",
  "indrive": "اندرايف", "talabat": "طلبات", "breadfast": "بريدفاست",
  "halan": "هالان", "rabbit": "رابت",
};

/**
 * Single-letter franco particles. The word pattern deliberately requires two letters, so
 * these were left as Latin text in the middle of an Arabic sentence — "l Ahmed" kept an
 * "l" that no downstream layer could read.
 */
const FRANCO_PARTICLES: Record<string, string> = {
  l: "ل", w: "و", b: "بـ",
};

function convertFrancoArab(text: string): string {
  // Match: (1) words with digits (7awalte), (2) known Franco words without digits (el, kahraba)
  const converted = text.replace(/[a-zA-Z][a-zA-Z0-9']*[0-9][a-zA-Z0-9']*|[0-9][a-zA-Z0-9']*[a-zA-Z][a-zA-Z0-9']*|[a-zA-Z]{2,}/g, (word) => {
    const lower = word.toLowerCase();
    if (FRANCO_ARAB_DICT[lower]) return FRANCO_ARAB_DICT[lower];
    let result = "";
    for (const char of lower) {
      if (FRANCO_DIGIT_TO_ARABIC[char]) {
        result += FRANCO_DIGIT_TO_ARABIC[char];
      } else if (FRANCO_LETTER_TO_ARABIC[char]) {
        result += FRANCO_LETTER_TO_ARABIC[char];
      } else {
        result += char;
      }
    }
    return result;
  });

  // Only once the sentence is already Arabic — so a stray "a" or "I" in an English note
  // is never rewritten. The particle attaches to the word after it, the way it is written.
  if (!/[؀-ۿ]/.test(converted)) return converted;
  return converted.replace(
    /(^|\s)([lwb])\s+(?=[؀-ۿ])/gi,
    (_match, space: string, letter: string) => space + FRANCO_PARTICLES[letter.toLowerCase()],
  );
}

/** Convert Arabic-Indic numerals (٠١٢...) to Western Arabic (012...) */
export function arabicToEnglishNumbers(str: string): string {
  return str.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
}

/** Word-based number mappings (Egyptian Arabic) */

/** Multiplier keywords */
const MULTIPLIERS: Record<string, number> = {
  الف: 1000,
  ألف: 1000,
  k: 1000,
  K: 1000,
  مليون: 1000000,
};

/** Colloquial number expressions */

/**
 * Metaphorical slang normalizer (Strategy 4: Negative Keywords Engine)
 * ────────────────────────────────────────────────────────────────────
 * Egyptian colloquial idioms that contain words which mislead the AI:
 * - "طلعت عيني" contains "طلعت" → AI thinks "outing/travel"
 * - "خربت بيتي" contains "خربت بيت" → AI thinks "home maintenance"
 * - "طيرت" / "نسفت" → AI may interpret as entertainment
 * We replace these with literal, neutral financial verbs.
 */
const METAPHOR_NORMALIZATIONS: Array<{ pattern: RegExp; replacement: string }> =
  [
    // "طلعت عيني / روحي في X" → removes misleading "طلعت" (which triggers خروجة/ترفيه)
    {
      pattern: /طلعت\s+(?:عيني|روحي|عينيا|روحيا)\s+(?:في|ف)\s*/g,
      replacement: "تعبت في ",
    },
    // "خربت بيتي / الدنيا في X" → removes misleading "خربت بيت" (triggers سكن/صيانة)
    {
      pattern: /خربت\s+(?:بيتي|الدنيا|الدنيه)\s+(?:في|ف|على)\s*/g,
      replacement: "صرفت كتير على ",
    },
    // "طيرت فلوس على X" → "صرفت على X"
    {
      pattern: /طيرت\s+(?:فلوس|مصاري|فلوسي)\s+(?:على|في|ف)\s*/g,
      replacement: "صرفت على ",
    },
    // Standalone verbs: "بعزقت / فرتكت / نسفت" → "صرفت"
    {
      pattern: /(?:^|\s)(بعزقت|فرتكت|نسفت|بددت)(?=\s|$)/g,
      replacement: " صرفت",
    },
    // "شطبت X" → "خلصت X" (avoids confusion with construction)
    { pattern: /(?:^|\s)شطبت(?=\s)/g, replacement: " خلصت" },
    // "راحت عليا في X" → "دفعت في X" (removes misleading "راحت")
    {
      pattern: /راحت\s+(?:عليا|عليه|علي)\s+(?:في|ف)\s*/g,
      replacement: "دفعت في ",
    },
    // "ضربت X بـ" → "اشتريت X بـ" (removes violence connotation)
    { pattern: /ضربت\s+(\S+)\s+(?:بـ|ب)\s*/g, replacement: "اشتريت $1 بـ " },
    // "اتنصبت في X" → "دفعت في X" (removes misleading negative connotation)
    { pattern: /اتنصبت\s+(?:في|ف)\s*/g, replacement: "دفعت في " },
  ];

/** Negation normalizations */
const NEGATION_NORMALIZATIONS: Array<{ pattern: RegExp; replacement: string }> =
  [
    // "مفيش غير 50 جنيه" -> "50 جنيه"
    { pattern: /(?:^|\s)مفيش\s+(?:غير|الا|إلا)\s*/g, replacement: " " },
    // "مش دافع غير 50" -> "دفعت 50"
    {
      pattern: /(?:^|\s)مش\s+(?:دافع|دفع|هدفع)\s+(?:غير|الا|إلا)\s*/g,
      replacement: " دفعت ",
    },
    // "مش صارف غير" -> "صرفت"
    {
      pattern: /(?:^|\s)مش\s+(?:صارف|هاصرف|هصرف)\s+(?:غير|الا|إلا)\s*/g,
      replacement: " صرفت ",
    },
    // "مادفعناش غير"
    {
      pattern:
        /(?:^|\s)(?:مادفعناش|مدفعناش|مادفعتش|مدفعتش)\s+(?:غير|الا|إلا)\s*/g,
      replacement: " دفعت ",
    },
  ];

/** Common Egyptian filler words */
const FILLER_WORDS = [
  "بقى",
  "بقي",
  "كده",
  "كدا",
  "يعني",
  "أصل",
  "اصل",
  "والله",
  "بص",
  "شوف",
  "طب",
  "عموما",
  "اساسا",
  "أساسا",
  "المهم",
  "بتاع",
  "بتاعة",
];

const COMMON_PHRASE_NORMALIZATIONS: Record<string, string> = {
  "فكيت بنزين": "دفعت بنزين",
  "حطيت للسايس": "دفعت سايس",
  "حطيت للراجل بتاع الركنة": "دفعت ركنة",
  "جددت الباقة": "دفعت باقة انترنت",
  "شحنت رصيد": "دفعت شحن رصيد",
  "دفعت عربون": "دفعت عربون",
  "حطيت فلوس في الكارت": "حولت فلوس كارت",
  "حاسبت على المشاريب": "دفعت قهوة ومشاريب",
  "خلصت قسط": "دفعت قسط",
  "قطعت تذكرة": "دفعت تذكرة",
  "لمينا من بعض": "جمعيه",
  "قبضت الجمعية": "قبضت جمعيه",
  "دفعت الجمعية": "دفعت جمعيه",
  "كلنا بره": "اكلت في مطعم",
  "خرجنا ناكل": "اكلت في مطعم",
  "جبت طلبات البيت": "اشتريت سوبر ماركت",
  "نزلت السوق": "اشتريت خضار وفاكهة",
  "قفلت الحساب": "دفعت الحساب",
  "سوقت العربيه": "بنزين",
  "جبت هدوم": "اشتريت ملابس",
  "صرفت على المكنه": "صيانة سيارة",
  "عمرت المكنه": "صيانة سيارة",
  "شحنت كارت الكهربا": "دفعت فاتورة الكهرباء",
  "شحنت كارت الميه": "دفعت فاتورة المياه",
  "شحنت كارت الغاز": "دفعت فاتورة الغاز",
};

/** Ambiguous single words that confuse the AI because of Standard Arabic vs Egyptian Slang */
const AMBIGUOUS_WORDS_NORMALIZATIONS: Array<{ pattern: RegExp; replacement: string }> = [
  // "غدا" means lunch in Egyptian, but "tomorrow" in Standard Arabic
  { pattern: /(?:^|\s)غدا(?=\s|$)/g, replacement: " وجبة غداء " },
  { pattern: /(?:^|\s)عشا(?=\s|$)/g, replacement: " وجبة عشاء " },
  { pattern: /(?:^|\s)فطار(?=\s|$)/g, replacement: " وجبة إفطار " },
];

/**
 * Full text normalization pipeline
 */
export function normalizeText(text: string): string {
  let result = text.trim();

  // 0. Apply STT corrections FIRST (fix speech-to-text errors before anything)
  result = applySttCorrections(result);

  // 0.1 Convert Franco-Arab (Arabizi) to Arabic — before any other processing
  result = convertFrancoArab(result);

  // 0.5 Apply metaphorical slang normalizer (Strategy 4: Negative Keywords Engine)
  // Must run BEFORE phrase normalization to catch idioms like "طلعت عيني في تصليح العربية"
  for (const { pattern, replacement } of METAPHOR_NORMALIZATIONS) {
    result = result.replace(pattern, replacement);
  }

  // 1. Convert Arabic-Indic numerals
  result = arabicToEnglishNumbers(result);

  // 2. Remove extra whitespace
  result = result.replace(/\s+/g, " ");

  // 2.5 Normalize frequent Egyptian colloquial phrases before token-level normalization
  for (const [source, target] of Object.entries(COMMON_PHRASE_NORMALIZATIONS)) {
    const regex = new RegExp(source, "gi");
    result = result.replace(regex, target);
  }

  // 2.5.5 Normalize ambiguous single words (e.g. غدا -> وجبة غداء)
  for (const { pattern, replacement } of AMBIGUOUS_WORDS_NORMALIZATIONS) {
    result = result.replace(pattern, replacement);
  }

  // 2.6 Handle complex expressions & negations (e.g. "مش دافع غير", "مفيش غير")
  for (const { pattern, replacement } of NEGATION_NORMALIZATIONS) {
    result = result.replace(pattern, replacement);
  }

  // 2.7 Strip out common Egyptian filler words that confuse the classifier
  const fillerRegex = new RegExp(
    `(?:^|\\s)(?:${FILLER_WORDS.join("|")})(?=\\s|$)`,
    "gi",
  );
  result = result.replace(fillerRegex, " ");

  // 3. Remove weird symbols but keep Arabic, English, numbers, basic punctuation
  result = result.replace(
    /[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9\s.,،؟?!٪%\-\/]/g,
    "",
  );

  // 4. Normalize Arabic characters
  result = result
    .replace(/[إأآٱ]/g, "ا") // Normalize alef variants
    .replace(/ى/g, "ي") // Final ya
    .replace(/ة/g, "ه") // Ta marbuta
    .replace(/ؤ/g, "و") // Waw hamza
    .replace(/ئ/g, "ي"); // Ya hamza

  // 5. Spoken numbers -> digits, via the compositional engine.
  //
  // This was a second copy of the word-number tables applied one word at a time, which
  // split compound numerals ("ميتين وخمسين" -> "200 و 50"). arabic-number-parser is now
  // the single place that logic lives, and it composes rather than substitutes.
  result = parseArabicNumbers(result);

  // 6. "X ألف" / "X k" shorthand that follows a digit rather than a word.
  result = result.replace(/(\d+)\s*(الف|ألف)/g, (_, num) => String(parseFloat(num) * 1000));
  result = result.replace(/(\d+)\s*[kK](?=\s|$)/g, (_, num) => String(parseFloat(num) * 1000));

  return result.trim();
}

/**
 * Extract currency from text
 */
export function extractCurrency(text: string): string {
  if (/دولار|\$|dollar/i.test(text)) return "USD";
  if (/يورو|€|euro/i.test(text)) return "EUR";
  if (/ريال|riyal/i.test(text)) return "SAR";
  if (/درهم|dirham/i.test(text)) return "AED";
  // Default Egyptian Pound
  return "EGP";
}

// The word-number tables moved to arabic-number-parser.ts, which composes numerals
// instead of substituting them word by word. Nothing outside this file imported them.
export { MULTIPLIERS };
