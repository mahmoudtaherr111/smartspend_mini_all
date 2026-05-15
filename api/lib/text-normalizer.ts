/**
 * SmartSpend Text Normalizer (Step 1)
 * Normalizes Arabic/Egyptian text for financial parsing
 */

/** Convert Arabic-Indic numerals (٠١٢...) to Western Arabic (012...) */
export function arabicToEnglishNumbers(str: string): string {
  return str.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
}

/** Word-based number mappings (Egyptian Arabic) */
const WORD_NUMBERS: Record<string, number> = {
  // Units
  "واحد": 1, "اتنين": 2, "تلاته": 3, "تلاتة": 3, "اربعة": 4, "أربعة": 4,
  "خمسة": 5, "خمسه": 5, "ستة": 6, "سته": 6, "سبعة": 7, "سبعه": 7,
  "تمانية": 8, "تمنية": 8, "تمانيه": 8, "تسعة": 9, "تسعه": 9,
  // Tens
  "عشرة": 10, "عشره": 10, "عشرين": 20, "تلاتين": 30, "ثلاثين": 30,
  "اربعين": 40, "أربعين": 40, "خمسين": 50, "ستين": 60,
  "سبعين": 70, "تمانين": 80, "ثمانين": 80, "تسعين": 90,
  // Hundreds
  "مية": 100, "مائة": 100, "ميه": 100, "ميتين": 200, "متين": 200,
  "تلتمية": 300, "تلتميه": 300, "ربعمية": 400, "ربعميه": 400,
  "خمسمية": 500, "خمسميه": 500, "ستمية": 600, "ستميه": 600,
  "سبعمية": 700, "سبعميه": 700, "تمنمية": 800, "تمنميه": 800,
  "تسعمية": 900, "تسعميه": 900,
  // Thousands
  "الف": 1000, "ألف": 1000, "الفين": 2000, "ألفين": 2000,
  // Colloquial
  "نص": 0.5, "ربع": 0.25, "تلت": 0.333,
};

/** Multiplier keywords */
const MULTIPLIERS: Record<string, number> = {
  "الف": 1000, "ألف": 1000, "k": 1000, "K": 1000,
  "مليون": 1000000,
};

/** Colloquial number expressions */
const COLLOQUIAL_NUMBERS: Record<string, number> = {
  "نص ألف": 500, "نص الف": 500, "نصف ألف": 500,
  "ربع ألف": 250, "ربع الف": 250,
  "خمس تلاف": 5000, "عشر تلاف": 10000, "عشرتلاف": 10000,
  "خمستلاف": 5000, "خمستالاف": 5000,
  "تلاتلاف": 3000, "اربعتلاف": 4000,
};

const COMMON_PHRASE_NORMALIZATIONS: Record<string, string> = {
  "فكيت بنزين": "دفعت بنزين",
  "حطيت للسايس": "دفعت سايس",
  "حطيت للراجل بتاع الركنة": "دفعت ركنة",
  "جددت الباقة": "دفعت باقة انترنت",
  "شحنت رصيد": "دفعت شحن رصيد",
  "دفعت عربون": "دفعت عربون",
  "حطيت فلوس في الكارت": "حولت فلوس كارت",
};

/**
 * Full text normalization pipeline
 */
export function normalizeText(text: string): string {
  let result = text.trim();

  // 1. Convert Arabic-Indic numerals
  result = arabicToEnglishNumbers(result);

  // 2. Remove extra whitespace
  result = result.replace(/\s+/g, " ");

  // 2.5 Normalize frequent Egyptian colloquial phrases before token-level normalization
  for (const [source, target] of Object.entries(COMMON_PHRASE_NORMALIZATIONS)) {
    const regex = new RegExp(source, "gi");
    result = result.replace(regex, target);
  }

  // 3. Remove weird symbols but keep Arabic, English, numbers, basic punctuation
  result = result.replace(/[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9\s.,،؟?!٪%\-\/]/g, "");

  // 4. Normalize Arabic characters
  result = result
    .replace(/[إأآٱ]/g, "ا")    // Normalize alef variants
    .replace(/ى$/g, "ي")        // Final ya
    .replace(/ة/g, "ه")         // Ta marbuta
    .replace(/ؤ/g, "و")         // Waw hamza
    .replace(/ئ/g, "ي");        // Ya hamza

  // 5. Replace colloquial number expressions first (before word numbers)
  for (const [expr, num] of Object.entries(COLLOQUIAL_NUMBERS)) {
    const regex = new RegExp(`(?:^|\\s)(ب|بـ|و)?${expr}(?=\\s|$)`, "g");
    result = result.replace(regex, (_, prefix) => {
      return (prefix ? ` ${prefix} ` : " ") + num.toString() + " ";
    });
  }

  // 6. Replace word numbers
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    const regex = new RegExp(`(?:^|\\s)(ب|بـ|و)?${word}(?=\\s|$)`, "g");
    result = result.replace(regex, (_, prefix) => {
      return (prefix ? ` ${prefix} ` : " ") + num.toString() + " ";
    });
  }

  // 7. Handle "X ألف" patterns (e.g., "5 ألف" → "5000")
  result = result.replace(/(\d+)\s*(الف|ألف)/g, (_, num) => {
    return (parseFloat(num) * 1000).toString();
  });

  // 8. Handle "X k" patterns
  result = result.replace(/(\d+)\s*[kK]/g, (_, num) => {
    return (parseFloat(num) * 1000).toString();
  });

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

export { WORD_NUMBERS, MULTIPLIERS, COLLOQUIAL_NUMBERS };
