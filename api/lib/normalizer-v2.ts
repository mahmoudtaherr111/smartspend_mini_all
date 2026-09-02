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
import { parseArabicNumbers } from "./arabic-number-parser";

// ─── Franco-Arab (Arabizi) Light Converter for AI ────────────────
const FRANCO_DIGIT_MAP: Record<string, string> = {
  "2": "ء", "3": "ع", "5": "خ", "6": "ط", "7": "ح", "8": "غ", "9": "ق",
};
const FRANCO_LETTER_MAP: Record<string, string> = {
  a: "ا", b: "ب", c: "ك", d: "د", e: "ي", f: "ف", g: "ج", h: "ه",
  i: "ي", j: "ج", k: "ك", l: "ل", m: "م", n: "ن", o: "و", p: "ب",
  q: "ق", r: "ر", s: "س", t: "ت", u: "و", v: "ف", w: "و", x: "ك",
  y: "ي", z: "ز",
};
const FRANCO_LIGHT_DICT: Record<string, string> = {
  "dafa3t": "دفعت", "dafaat": "دفعت",
  "kahraba": "كهربا", "kahriba": "كهربا",
  "el": "ال", "3la": "على", "ala": "على",
  "benzin": "بنزين", "banzeen": "بنزين",
  "kahwa": "قهوة", "qahwa": "قهوة",
  "akl": "أكل", "akel": "أكل",
  "atm": "ATM",
  "flous": "فلوس", "floos": "فلوس",
  "gneh": "جنيه", "geneh": "جنيه",
};

function convertFrancoArabLight(text: string): string {
  return text.replace(/[a-zA-Z][a-zA-Z0-9']*[0-9][a-zA-Z0-9']*|[0-9][a-zA-Z0-9']*[a-zA-Z][a-zA-Z0-9']*|[a-zA-Z]{2,}/g, (word) => {
    const lower = word.toLowerCase();
    if (FRANCO_LIGHT_DICT[lower]) return FRANCO_LIGHT_DICT[lower];
    let result = "";
    for (const char of lower) {
      if (FRANCO_DIGIT_MAP[char]) result += FRANCO_DIGIT_MAP[char];
      else if (FRANCO_LETTER_MAP[char]) result += FRANCO_LETTER_MAP[char];
      else result += char;
    }
    return result;
  });
}

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

  // 0. Convert Franco-Arab (Arabizi) to Arabic — AI understands Arabic better
  result = convertFrancoArabLight(result);

  // 1. Apply STT corrections (fix speech-to-text typos)
  result = applySttCorrections(result);

  // 2. Convert Arabic-Indic numerals (٠١٢) to Western (012)
  result = arabicToEnglishNumbers(result);

  // 3. Remove extra whitespace
  result = result.replace(/\s+/g, " ");

  // 4. Spoken numbers -> digits, via the compositional engine.
  //
  // This used to be two local substitution tables applied word by word, which tore
  // compound numerals apart: "ميتين وخمسين" became "200 و 50" and "خمستاشر الف وخمسمية"
  // became "خمستاشر 1000 و 500". The decomposer then read each fragment as its own
  // transaction, so a single spoken amount produced several phantom rows.
  // arabic-number-parser composes instead of substituting, and is now the only place
  // this logic lives.
  result = parseArabicNumbers(result);

  // 5. "X ألف" / "X k" shorthand that follows a digit rather than a word.
  result = result.replace(/(\d+)\s*(الف|ألف)/g, (_, num) => String(parseFloat(num) * 1000));
  result = result.replace(/(\d+)\s*[kK](?=\s|$)/g, (_, num) => String(parseFloat(num) * 1000));

  // 6. Remove weird symbols but keep Arabic text as-is (NO character normalization)
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
