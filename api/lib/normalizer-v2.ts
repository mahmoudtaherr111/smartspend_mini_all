/**
 * SmartSpend v2 — Normalizer V2
 * ══════════════════════════════
 * Dual-output text normalizer that produces:
 *   1. forRules — Aggressive normalization (existing behavior for rule engine)
 *   2. forAI   — Light normalization preserving Arabic semantics (for Gemini)
 *
 * Key insight: The AI (Gemini) understands original Egyptian Arabic BETTER
 * than aggressively normalized text. Normalizing ة→ه, إ→ا etc. destroys
 * information that helps the LLM understand intent and context.
 */

import { applySttCorrections } from "./stt-corrections";
import {
  arabicToEnglishNumbers,
  normalizeText as normalizeTextV1,
} from "./text-normalizer";

// ─── Types ────────────────────────────────────────────────────────

export interface NormalizerV2Output {
  /** Aggressively normalized text (for rule engine, keyword matching) */
  forRules: string;
  /** Lightly normalized text (for AI — preserves Arabic semantics) */
  forAI: string;
  /** Detected language */
  detectedLanguage: "ar" | "en" | "mixed";
  /** Does the text contain multiple amounts? */
  hasMultipleAmounts: boolean;
  /** Does the text contain narrative connectors? */
  hasNarrativeConnectors: boolean;
  /** Estimated complexity level */
  estimatedComplexity: "simple" | "moderate" | "complex";
}

// ─── Narrative Connectors ─────────────────────────────────────────

const NARRATIVE_CONNECTORS = [
  "وبعدين",
  "وكمان",
  "بعدها",
  "بعد كده",
  "ومنهم",
  "ومنه",
  "وبعد كده",
  "بعدين",
  "كمان",
  "غير كده",
];

// ─── Word-to-Number Maps (for forAI conversion) ──────────────────

const WORD_NUMBERS: Record<string, number> = {
  // واحد: 1, // Commented out to prevent "واحد صاحبي" -> amount 1
  اتنين: 2,
  تلاته: 3,
  تلاتة: 3,
  اربعة: 4,
  أربعة: 4,
  خمسة: 5,
  خمسه: 5,
  ستة: 6,
  سته: 6,
  سبعة: 7,
  سبعه: 7,
  تمانية: 8,
  تمنية: 8,
  تمانيه: 8,
  تسعة: 9,
  تسعه: 9,
  عشرة: 10,
  عشره: 10,
  عشرين: 20,
  تلاتين: 30,
  ثلاثين: 30,
  اربعين: 40,
  أربعين: 40,
  خمسين: 50,
  ستين: 60,
  سبعين: 70,
  تمانين: 80,
  ثمانين: 80,
  تسعين: 90,
  مائة: 100,
  ميتين: 200,
  متين: 200,
  تلتمية: 300,
  تلتميه: 300,
  ربعمية: 400,
  ربعميه: 400,
  خمسمية: 500,
  خمسميه: 500,
  ستمية: 600,
  ستميه: 600,
  سبعمية: 700,
  سبعميه: 700,
  تمنمية: 800,
  تمنميه: 800,
  تسعمية: 900,
  تسعميه: 900,
  الف: 1000,
  ألف: 1000,
  الفين: 2000,
  ألفين: 2000,
};

const COLLOQUIAL_NUMBERS: Record<string, number> = {
  "نص ألف": 500,
  "نص الف": 500,
  "نصف ألف": 500,
  "ربع ألف": 250,
  "ربع الف": 250,
  "خمس تلاف": 5000,
  "عشر تلاف": 10000,
  "عشرتلاف": 10000,
  "خمستلاف": 5000,
  "خمستالاف": 5000,
  "تلاتلاف": 3000,
  "اربعتلاف": 4000,
  "باكو ونص": 1500,
  "أرنب ونص": 1500000,
  "ارنب ونص": 1500000,
  "نص باكو": 500,
  "نص أرنب": 500000,
  "نص ارنب": 500000,
  "ربع باكو": 250,
  "ربع أرنب": 250000,
  "ربع ارنب": 250000,
  "باكوين": 2000,
  "باكو": 1000,
  "أرنب": 1000000,
  "ارنب": 1000000,
};

// ─── Amount Counting ──────────────────────────────────────────────

function countAmounts(text: string): number {
  const matches = text.match(/\d+(?:[.,]\d+)?/g);
  return matches ? matches.length : 0;
}

// ─── Language Detection ───────────────────────────────────────────

function detectLanguage(text: string): "ar" | "en" | "mixed" {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const total = arabicChars + englishChars;

  if (total === 0) return "ar"; // Mostly numbers/symbols
  if (arabicChars > total * 0.7) return "ar";
  if (englishChars > total * 0.7) return "en";
  return "mixed";
}

// ─── Complexity Estimation ────────────────────────────────────────

function estimateComplexity(
  text: string,
  amountCount: number,
  hasConnectors: boolean,
): "simple" | "moderate" | "complex" {
  const wordCount = text.trim().split(/\s+/).length;

  // Simple: ≤5 words, ≤1 amount, no connectors
  if (wordCount <= 5 && amountCount <= 1 && !hasConnectors) return "simple";

  // Complex: >15 words AND (>2 amounts OR narrative connectors)
  if (wordCount > 15 && (amountCount > 2 || hasConnectors)) return "complex";

  // Moderate: everything else
  if (wordCount > 5 || amountCount >= 2 || hasConnectors) return "moderate";

  return "simple";
}

// ─── Light Normalizer (for AI) ────────────────────────────────────

/**
 * Light normalization that ONLY fixes clear errors and converts numbers.
 * Preserves original Arabic characters (ة, إ, أ, ى, etc.) for AI.
 */
function normalizeLightForAI(text: string): string {
  let result = text.trim();

  // 1. Apply STT corrections (fix speech-to-text typos)
  result = applySttCorrections(result);

  // 2. Convert Arabic-Indic numerals (٠١٢) to Western (012)
  result = arabicToEnglishNumbers(result);

  // 3. Remove extra whitespace
  result = result.replace(/\s+/g, " ");

  // 4. Convert colloquial number expressions to digits
  for (const [expr, num] of Object.entries(COLLOQUIAL_NUMBERS)) {
    const regex = new RegExp(`(?:^|\\s)(ب|بـ|و)?${expr}(?=\\s|$)`, "g");
    result = result.replace(regex, (_, prefix) => {
      return (prefix ? ` ${prefix} ` : " ") + num.toString() + " ";
    });
  }

  // 6. Handle "X ألف" patterns
  result = result.replace(/(\d+)\s*(الف|ألف)/g, (_, num) => {
    return (parseFloat(num) * 1000).toString();
  });

  // 7. Handle "X k" patterns
  result = result.replace(/(\d+)\s*[kK]/g, (_, num) => {
    return (parseFloat(num) * 1000).toString();
  });

  // 5. Convert word numbers to digits
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    // Handle attached forms like "بعشرين"
    const attached = new RegExp(`ب${word}(?=\\s|جنيه|ج\\.م|ج|$)`, "g");
    result = result.replace(attached, ` ${num} `);
    
    // Bypass converting "واحد" to "1" if it is followed by common people/relation terms (indefinite pronoun usage)
    if (word === "واحد") {
      const regex = new RegExp(`(?:^|\\s)(ب|بـ|و)?واحد(?=\\s+(?:صاحب|صديق|زميل|أخ|اخ|أخت|اخت|قريب|سواق|بواب|شغال|موظف|مدير|حد|شخص|راجل|ست))`, "g");
      result = result.replace(regex, (match) => match.replace("واحد", "___واحد___"));
    }

    // Handle standalone
    const regex = new RegExp(`(?:^|\\s)(ب|بـ|و)?${word}(?=\\s|$)`, "g");
    result = result.replace(regex, (_, prefix) => {
      return (prefix ? ` ${prefix} ` : " ") + num.toString() + " ";
    });

    if (word === "واحد") {
      result = result.replace(/___واحد___/g, "واحد");
    }
  }

  // 8. Remove weird symbols but keep Arabic text as-is (NO character normalization)
  result = result.replace(
    /[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9\s.,،؟?!٪%\-\/]/g,
    "",
  );

  return result.trim();
}

// ─── Main Export ──────────────────────────────────────────────────

/**
 * Normalize text for both rule engine (aggressive) and AI (light).
 * Returns both versions plus metadata about the text.
 */
export function normalizeV2(text: string): NormalizerV2Output {
  const forRules = normalizeTextV1(text);
  const forAI = normalizeLightForAI(text);

  // Count amounts in the AI-normalized version (more reliable than raw)
  const amountCount = countAmounts(forAI);
  const hasMultipleAmounts = amountCount > 1;

  // Check for narrative connectors in original text
  const hasNarrativeConnectors = NARRATIVE_CONNECTORS.some((c) =>
    text.includes(c),
  );

  return {
    forRules,
    forAI,
    detectedLanguage: detectLanguage(text),
    hasMultipleAmounts,
    hasNarrativeConnectors,
    estimatedComplexity: estimateComplexity(
      text,
      amountCount,
      hasNarrativeConnectors,
    ),
  };
}
