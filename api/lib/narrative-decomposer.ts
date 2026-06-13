/**
 * SmartSpend v2 — Narrative Decomposer
 * ═════════════════════════════════════
 * THE key innovation: splits Egyptian Arabic narrative text into
 * individual financial transaction segments BEFORE classification.
 *
 * Strategies:
 *   1. decomposeHeuristic()    — 0 tokens, ~80% accuracy
 *   2. decomposeWithAI()       — ~150 tokens, ~95% accuracy (Pro)
 *   3. decomposeHybridFree()   — 0-100 tokens, ~88% accuracy (Free)
 *
 * Examples handled:
 *   "أكلت بـ 50 وركبت أوبر بـ 30"                → 2 segments
 *   "أبويا إداني 100 جنيه، أكلت بـ 40"            → 2 segments (1 income + 1 expense)
 *   "قبضت المرتب 15000 ودفعت الإيجار 5000"        → 2 segments (1 income + 1 expense)
 *   "بنزين 200"                                    → 1 segment (simple)
 */

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { isLikelyPersonName } from "./egyptian-names-dictionary";
import { extractAmounts } from "./entity-extractor";
import { SUB_CATEGORY_MAP } from "./rule-engine";
import { CATEGORY_DICTIONARY } from "./egyptian-dictionary";

// ─── Types ────────────────────────────────────────────────────────

export interface DecomposedSegment {
  /** Original text fragment */
  text: string;
  /** Extracted amount if found */
  amount: number | null;
  /** Financial direction */
  direction: "income" | "expense" | "transfer" | "investment" | "unknown";
  /** The financial verb driving this segment */
  linkedVerb: string | null;
  /** Person mentioned (أبويا, أحمد, البواب, etc.) */
  personMentioned: string | null;
  /** Segment index in the narrative */
  segmentIndex: number;
}

export interface DecompositionResult {
  segments: DecomposedSegment[];
  method: "simple" | "heuristic" | "ai" | "hybrid";
  /** Was the original text complex (multi-transaction narrative)? */
  isComplex: boolean;
}

// ─── Financial Verbs Dictionary ────────────────────────────────────

/** Egyptian Arabic financial action verbs (both formal and colloquial) */
const EXPENSE_VERBS = [
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
  "اديت",
  "أديت",
  "دخلت",
  "كشف",
  "فاتورة",
  "مصاريف",
  "هدية",
  "هديه",
  "صدقة",
  "علبة",
  "علبه",
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
  "فرتكت",
  "ضيعت",
  "طيرت",
  "خرشت",
  "حاسبت",
  "خربت",
  "بوظت",
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
];

const INCOME_VERBS = [
  "جالي",
  "إداني",
  "اداني",
  "اديتني",
  "أديتني",
  "أبويا إداني",
  "جاني",
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
  "كسبت",
  "دخللي",
];

const TRANSFER_VERBS = ["حولت", "سحبت", "شلت", "سلت", "حطيت", "سلفت", "ودعت", "بعت", "بعتت", "رجعت", "فكيت"];

const INVESTMENT_VERBS = [
  "اشتريت ذهب",
  "اشتريت دهب",
  "حطيت في شهادة",
  "استثمرت",
];

/** All financial verbs (for splitting detection) */
const ALL_FINANCIAL_VERBS = [
  ...EXPENSE_VERBS,
  ...INCOME_VERBS,
  ...TRANSFER_VERBS,
];

// ─── Person Detection ─────────────────────────────────────────────

const PERSON_PATTERNS = [
  // Family
  /(?:^|\s)(?:[وبفل]|ال)?(أبو(?:يا|ه|ي)|ابو(?:يا|ه|ي)|والد(?:ي|ه|تي|ته)|بابا|الوالد)(?=\s|$|[.,!?])/i,
  /(?:^|\s)(?:[وبفل]|ال)?(أم(?:ي|ه|ا)|ام(?:ي|ه|ا)|والدت(?:ي|ه)|ماما|الوالده)(?=\s|$|[.,!?])/i,
  /(?:^|\s)(?:[وبفل]|ال)?(أخو(?:يا|ه|ي)|اخو(?:يا|ه|ي)|أخت(?:ي|ه)|اخت(?:ي|ه))(?=\s|$|[.,!?])/i,
  /(?:^|\s)(?:[وبفل]|ال)?(جوز(?:ي|ها)|زوج(?:ي|تي|ها|ته))(?=\s|$|[.,!?])/i,
  /(?:^|\s)(?:[وبفل]|ال)?(خال(?:ي|ه|تي|ته)|عم(?:ي|ه|تي|ته))(?=\s|$|[.,!?])/i,
  /(?:^|\s)(?:[وبفل]|ال)?(ابن(?:ي|ه|ها)|بنت(?:ي|ه|ها))(?=\s|$|[.,!?])/i,
  /(?:^|\s)(?:[وبفل]|ال)?(جد(?:ي|ه|و|تي|ته)|تيت(?:ه|ا))(?=\s|$|[.,!?])/i,
  // Service people
  /(?:^|\s)(?:[وبفل]|ال)?(البواب|الشغال(?:ه|ة)?|السواق|السائق|الفراش|الحارس|السايس|السايق|الميكانيكي)(?=\s|$|[.,!?])/i,
];

// ─── Narrative Connectors ──────────────────────────────────────────

/** Always-split connectors (these ALWAYS indicate a new financial event) */
const STRONG_CONNECTORS = [
  "وبعدين",
  "وكمان",
  "بعدها",
  "بعد كده",
  "ومنهم",
  "ومنه",
  "وبعد كده",
  "بعدين",
  "كمان",
  "وكمان كنت",
  "غير كده",
];

/** Sentence boundary characters */
const SENTENCE_BOUNDARIES = /[.!؟?\n;،,]/;

// ─── Amount Extraction (lightweight) ───────────────────────────────

const AMOUNT_REGEX =
  /(?:بـ?\s*)?(\d+(?:[.,]\d+)?)\s*(?:جنيه|ج\.م|ج(?:\s|$)|ألف|الف)?/g;

function extractFirstAmount(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const num = parseFloat(match[1].replace(",", "."));
  return isNaN(num) || num <= 0 ? null : num;
}

function countAmounts(text: string): number {
  const matches = text.match(/\d+(?:[.,]\d+)?/g);
  return matches ? matches.length : 0;
}

// ─── Direction Detection (per-segment) ─────────────────────────────

function detectSegmentDirection(
  text: string,
): "income" | "expense" | "transfer" | "investment" | "unknown" {
  const t = text.trim();

  // Check investment first (most specific)
  for (const v of INVESTMENT_VERBS) {
    if (t.includes(v)) return "investment";
  }

  // Score-based for income vs expense (handles segments with mixed signals)
  let incomeScore = 0;
  let expenseScore = 0;
  let transferScore = 0;

  for (const v of INCOME_VERBS) {
    if (t.includes(v)) incomeScore += 10;
  }
  for (const v of EXPENSE_VERBS) {
    if (t.includes(v)) expenseScore += 10;
  }
  for (const v of TRANSFER_VERBS) {
    if (t.includes(v)) transferScore += 10;
  }

  // Context clues
  if (/(?:من\s+(?:أبو|ابو|أم|ام|أخو|اخو|جوز|زوج|خال|عم))/.test(t))
    incomeScore += 15;
  if (/(?:ل(?:ـ|ل)\s*(?:البواب|الشغال|أحمد|محمد))/.test(t)) expenseScore += 15;
  if (/(?:حولت\s+(?:ل|لـ))/.test(t)) {
    transferScore += 20;
    expenseScore -= 10;
  }
  if (/(?:سلفت|سلفه|دين)/.test(t)) transferScore += 15;

  const max = Math.max(incomeScore, expenseScore, transferScore);
  if (max === 0) return "unknown";
  if (transferScore === max && transferScore > expenseScore) return "transfer";
  if (incomeScore > expenseScore) return "income";
  return "expense";
}

// ─── Person Detection ──────────────────────────────────────────────

function detectPerson(text: string): string | null {
  for (const pattern of PERSON_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1] || match[0].trim();
  }
  return null;
}

// ─── Verb Detection ────────────────────────────────────────────────

function detectLinkedVerb(text: string): string | null {
  const allVerbs = [...ALL_FINANCIAL_VERBS].sort((a, b) => b.length - a.length);
  for (const verb of allVerbs) {
    if (text.includes(verb)) return verb;
  }
  return null;
}

// ─── Financial Nouns List ──────────────────────────────────────────
const FINANCIAL_NOUNS = [
  "بنزين",
  "إيجار",
  "ايجار",
  "كهرباء",
  "كهربا",
  "ميه",
  "مياه",
  "غاز",
  "نت",
  "انترنت",
  "إنترنت",
  "قسط",
  "شحن",
  "رصيد",
  "مرتب",
  "راتب",
  "أوبر",
  "اوبر",
  "كريم",
  "مترو",
  "تاكسي",
  "بقالة",
  "بقاله",
  "سوبر ماركت",
  "دكتور",
  "صيدلية",
  "أكل",
  "شرب",
  "قهوة",
  "قهوه",
  "سجائر",
  "سجاير",
  "جمعية",
  "جمعيه",
  "سلفة",
  "سلفه",
  "ميكروباص",
  "مشوار",
  "خروجة",
  "غدا",
  "عشا",
  "فطار",
  "كشري",
  "عيدية",
];

// Helper to normalize Arabic string inside narrative-decomposer (to prevent circular imports)
function normalizeArabicString(str: string): string {
  return String(str || "")
    .trim()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// ─── Is Financial Segment? ─────────────────────────────────────────

function isFinancialSegment(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;

  // Has an amount?
  if (/\d+/.test(t)) return true;

  // Has a financial verb?
  if (detectLinkedVerb(t)) return true;

  // Has a known category keyword? (lightweight check)
  for (const noun of FINANCIAL_NOUNS) {
    if (t.includes(noun)) return true;
  }

  return false;
}

// ─── Amount-Anchored Decomposer ───────────────────────────────────

/**
 * Amount-anchored decomposition strategy.
 * This is the absolute default and only way to decompose sentences.
 */
function decomposeAmountAnchored(
  text: string,
  knownNames: string[] = [],
): DecomposedSegment[] | null {
  // Preprocess text to add spaces around punctuation (except within decimal/thousands numbers)
  const preprocessed = text
    .replace(/([،!؟?؛;])/g, " $1 ")
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, " $& ")
    .replace(/\s+/g, " ")
    .trim();

  const words = preprocessed.split(/\s+/);

  // Track start and end indices of each word in preprocessed text
  const wordsWithOffsets: { word: string; start: number; end: number }[] = [];
  let currentPos = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const start = preprocessed.indexOf(word, currentPos);
    const end = start + word.length;
    wordsWithOffsets.push({ word, start, end });
    currentPos = end;
  }

  // Find all valid amount-anchor indices using extractAmounts on preprocessed text
  const extractedAmounts = extractAmounts(preprocessed);
  const anchorIndices: number[] = [];

  for (const a of extractedAmounts) {
    let bestWordIdx = -1;
    // Look for exact start index overlap first
    for (let i = 0; i < wordsWithOffsets.length; i++) {
      const w = wordsWithOffsets[i];
      if (w.start <= a.index && w.end > a.index) {
        bestWordIdx = i;
        break;
      }
    }
    // Fallback: any overlap
    if (bestWordIdx === -1) {
      for (let i = 0; i < wordsWithOffsets.length; i++) {
        const w = wordsWithOffsets[i];
        if (w.start < a.index + a.length && w.end > a.index) {
          bestWordIdx = i;
          break;
        }
      }
    }
    if (bestWordIdx !== -1 && !anchorIndices.includes(bestWordIdx)) {
      anchorIndices.push(bestWordIdx);
    }
  }

  // Sort anchor indices to ensure logical sequence
  anchorIndices.sort((a, b) => a - b);

  if (anchorIndices.length === 0) return null;

  const rawSegments: { startIdx: number; endIdx: number; anchorIdx: number }[] = [];

  for (let a = 0; a < anchorIndices.length; a++) {
    const anchorIdx = anchorIndices[a];
    
    // Default start is 0
    let startIdx = 0;
    if (a > 0) {
      const prevAnchorIdx = anchorIndices[a - 1];
      // Find the best boundary between prevAnchorIdx and anchorIdx
      let splitIdx = -1;
      
      // 1. Look for connectors in the gap from right to left
      for (let i = anchorIdx - 1; i > prevAnchorIdx; i--) {
        const w = words[i];
        const isConnector = w === "و" || w === "ف" || w === "،" || w === "," || w === "ثم" || w === "بعدين" || STRONG_CONNECTORS.includes(w);
        const startsWithConnector = (w.startsWith("و") && w.length > 1 && !isLikelyPersonName(w) && !knownNames.includes(w));
        
        if (isConnector) {
          splitIdx = i + 1; // Split after the connector
          break;
        } else if (startsWithConnector) {
          splitIdx = i; // Split before the word starting with "و"
          break;
        }
      }
      
      // 2. Look for verbs in the gap from left to right
      if (splitIdx === -1) {
        for (let i = prevAnchorIdx + 1; i < anchorIdx; i++) {
          const w = words[i];
          const isVerb = ALL_FINANCIAL_VERBS.includes(w) || ALL_FINANCIAL_VERBS.includes(w.replace(/^[وف]/, ""));
          if (isVerb) {
            splitIdx = i; // Split before the verb
            break;
          }
        }
      }
      
      // 3. Scan nouns/names transition
      if (splitIdx === -1) {
        // Skip currency suffix of the previous anchor
        let firstWordIdx = prevAnchorIdx + 1;
        if (firstWordIdx < anchorIdx) {
          const fw = words[firstWordIdx];
          if (fw.includes("جني") || fw === "ج") {
            firstWordIdx++;
          }
        }
        
        // Scan from firstWordIdx to anchorIdx - 1
        for (let i = firstWordIdx; i < anchorIdx; i++) {
          const w = words[i];
          const cleanW = w.replace(/[^\u0600-\u06FFa-zA-Z]/g, "").replace(/^[وفبل]/, "").replace(/^ال/, "");
          const isRightLeaning = 
            ["ب", "في", "من", "ل", "علشان", "عشان"].includes(w) || 
            ["بـ", "لـ"].includes(w) ||
            SUB_CATEGORY_MAP[w] !== undefined ||
            SUB_CATEGORY_MAP[cleanW] !== undefined ||
            CATEGORY_DICTIONARY[w] !== undefined ||
            CATEGORY_DICTIONARY[cleanW] !== undefined;
            
          const isLeftLeaning = isLikelyPersonName(w) || knownNames.includes(w);
          
          if (isRightLeaning) {
            splitIdx = i; // Split before the right-leaning word
            break;
          } else if (isLeftLeaning) {
            splitIdx = i + 1; // Split after the left-leaning name
          }
        }
      }
      
      // Default fallback
      if (splitIdx !== -1) {
        startIdx = splitIdx;
      } else {
        startIdx = prevAnchorIdx + 1;
      }
    }

    let endIdx = anchorIdx;

    // For the LAST anchor, extend to end-of-text to capture trailing words
    if (a === anchorIndices.length - 1) {
      endIdx = words.length - 1;
    } else {
      const nextAnchorIdx = anchorIndices[a + 1];
      let splitIdx = -1;
      
      // Look for split point between anchorIdx and nextAnchorIdx
      for (let i = nextAnchorIdx - 1; i > anchorIdx; i--) {
        const w = words[i];
        const isConnector = w === "و" || w === "ف" || w === "،" || w === "," || w === "ثم" || w === "بعدين" || STRONG_CONNECTORS.includes(w);
        const startsWithConnector = (w.startsWith("و") && w.length > 1 && !isLikelyPersonName(w) && !knownNames.includes(w));
        
        if (isConnector) {
          splitIdx = i + 1;
          break;
        } else if (startsWithConnector) {
          splitIdx = i;
          break;
        }
      }
      
      if (splitIdx === -1) {
        for (let i = anchorIdx + 1; i < nextAnchorIdx; i++) {
          const w = words[i];
          const isVerb = ALL_FINANCIAL_VERBS.includes(w) || ALL_FINANCIAL_VERBS.includes(w.replace(/^[وف]/, ""));
          if (isVerb) {
            splitIdx = i;
            break;
          }
        }
      }
      
      if (splitIdx === -1) {
        let firstWordIdx = anchorIdx + 1;
        if (firstWordIdx < nextAnchorIdx) {
          const fw = words[firstWordIdx];
          if (fw.includes("جني") || fw === "ج") {
            firstWordIdx++;
          }
        }
        
        for (let i = firstWordIdx; i < nextAnchorIdx; i++) {
          const w = words[i];
          const cleanW = w.replace(/[^\u0600-\u06FFa-zA-Z]/g, "").replace(/^[وفبل]/, "").replace(/^ال/, "");
          const isRightLeaning = 
            ["ب", "في", "من", "ل", "علشان", "عشان"].includes(w) || 
            ["بـ", "لـ"].includes(w) ||
            SUB_CATEGORY_MAP[w] !== undefined ||
            SUB_CATEGORY_MAP[cleanW] !== undefined ||
            CATEGORY_DICTIONARY[w] !== undefined ||
            CATEGORY_DICTIONARY[cleanW] !== undefined;
            
          const isLeftLeaning = isLikelyPersonName(w) || knownNames.includes(w);
          
          if (isRightLeaning) {
            splitIdx = i;
            break;
          } else if (isLeftLeaning) {
            splitIdx = i + 1;
          }
        }
      }
      
      if (splitIdx !== -1) {
        endIdx = splitIdx - 1;
      } else {
        endIdx = nextAnchorIdx - 1;
      }
    }

    rawSegments.push({ startIdx, endIdx, anchorIdx });
  }

  const segments: DecomposedSegment[] = [];
  let previousVerb: string | null = null;

  for (let s = 0; s < rawSegments.length; s++) {
    const { startIdx, endIdx, anchorIdx } = rawSegments[s];
    
    let actualStartIdx = startIdx;
    if (s > 0) {
      const prevEnd = rawSegments[s - 1].endIdx;
      actualStartIdx = prevEnd + 1;
      if (words[actualStartIdx] === "و" || words[actualStartIdx] === "ف" || words[actualStartIdx] === "،" || words[actualStartIdx] === ",") {
        actualStartIdx++;
      }
    }
    
    const segmentWords = words.slice(actualStartIdx, endIdx + 1);
    const segmentText = segmentWords.join(" ");

    if (!segmentText.trim()) continue;

    const seg = buildSegment(segmentText, segments.length);

    const textUpToAmount = words.slice(0, anchorIdx + 1).join(" ");
    let nearestPrecedingVerb: string | null = null;
    let maxVerbIndex = -1;

    for (const verb of ALL_FINANCIAL_VERBS) {
      const idx = textUpToAmount.lastIndexOf(verb);
      if (idx > maxVerbIndex) {
        maxVerbIndex = idx;
        nearestPrecedingVerb = verb;
      }
    }

    if (nearestPrecedingVerb) {
      seg.linkedVerb = nearestPrecedingVerb;
    } else if (previousVerb) {
      seg.linkedVerb = previousVerb;
    }

    if (seg.linkedVerb) {
      previousVerb = seg.linkedVerb;
      if (seg.direction === "unknown") {
        seg.direction = detectSegmentDirection(seg.linkedVerb + " " + segmentText);
      }
    }

    segments.push(seg);
  }

  return segments.length > 0 ? segments : null;
}

// ─── Verb-Anchored Decomposer ──────────────────────────────────────

function decomposeVerbAnchored(
  text: string,
  knownNames: string[] = [],
): DecomposedSegment[] | null {
  const preprocessed = text
    .replace(/([،!؟?؛;])/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();

  const words = preprocessed.split(/\s+/);
  const verbIndices: number[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^[وف]/, "");
    if (ALL_FINANCIAL_VERBS.includes(w) || ALL_FINANCIAL_VERBS.includes(words[i])) {
      verbIndices.push(i);
    }
  }

  if (verbIndices.length <= 1) return null; // Needs at least 2 verbs to split

  const segments: DecomposedSegment[] = [];
  let startIndex = 0;

  for (let a = 0; a < verbIndices.length; a++) {
    const verbIdx = verbIndices[a];
    
    let endIdx = words.length - 1;
    if (a < verbIndices.length - 1) {
      const nextVerbIdx = verbIndices[a + 1];
      let splitIdx = nextVerbIdx;
      // Look backwards from next verb to find a connector
      for (let j = nextVerbIdx - 1; j > verbIdx; j--) {
        const w = words[j];
        if (w === "و" || w === "ف" || STRONG_CONNECTORS.includes(w) || w === "،" || w === ",") {
          splitIdx = j;
          break;
        }
      }
      endIdx = splitIdx - 1;
    }

    let actualStart = startIndex;
    if (words[actualStart] === "و" || words[actualStart] === "ف" || words[actualStart] === "،" || words[actualStart] === ",") {
       actualStart++;
    }

    const segmentText = words.slice(actualStart, endIdx + 1).join(" ");
    if (segmentText.trim()) {
       const seg = buildSegment(segmentText, segments.length);
       seg.linkedVerb = ALL_FINANCIAL_VERBS.find(v => segmentText.includes(v)) || null;
       segments.push(seg);
    }
    
    startIndex = endIdx + 1;
  }

  return segments.length > 1 ? segments : null;
}

// ─── Heuristic Decomposer (0 tokens) ──────────────────────────────

/**
 * Decomposes text using local heuristics only. No AI calls.
 * Accuracy: ~80% for multi-transaction narratives.
 *
 * Uses ONLY the Amount-Anchored strategy as requested.
 */
export function decomposeHeuristic(
  text: string,
  knownNames: string[] = [],
): DecompositionResult {
  let segments = decomposeAmountAnchored(text, knownNames);
  
  if (!segments || segments.length === 0) {
    segments = decomposeVerbAnchored(text, knownNames);
  }

  if (segments && segments.length > 0) {
    // 3. Optional: Fix broken splits (e.g., segments that start with a verb but no subject/amount context)
    // For now, heuristic assumes user speaks decently
    return {
      segments,
      method: "heuristic",
      isComplex: segments.length > 1,
    };
  }

  // Fallback to single segment if no amounts or verbs found
  return {
    segments: [buildSegment(text, 0)],
    method: "simple",
    isComplex: false,
  };
}



/**
 * Build a DecomposedSegment from raw text.
 */
function buildSegment(text: string, index: number): DecomposedSegment {
  return {
    text: text.trim(),
    amount: extractFirstAmount(text),
    direction: detectSegmentDirection(text),
    linkedVerb: detectLinkedVerb(text),
    personMentioned: detectPerson(text),
    segmentIndex: index,
  };
}



// ─── AI-Powered Decomposer (Pro, ~150 tokens) ─────────────────────

const DECOMPOSITION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    segments: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          text: { type: SchemaType.STRING },
          amount: { type: SchemaType.NUMBER, nullable: true },
          direction: {
            type: SchemaType.STRING,
            enum: ["income", "expense", "transfer", "investment"],
          },
        },
        required: ["text", "direction"],
      },
    },
  },
  required: ["segments"],
} as any;

const DECOMP_SYSTEM_PROMPT = `أنت محلل نصوص مالية مصري. مهمتك الوحيدة: فكّك النص لعمليات مالية منفصلة.
لكل عملية حدد:
- text: النص الأصلي للعملية
- amount: المبلغ (رقم أو null)
- direction: اتجاه الفلوس (income/expense/transfer/investment)

قواعد:
1) المستخدم قد يحكي القصة بعامية مصرية يومية كأنه يكلم صديقه (مثل "نزلت قعدت على القهوة", "ضربت كشري"). تجاهل الحشو واستخرج الفعل المالي الأساسي.
2) كل مبلغ = عملية منفصلة.
3) "جالي/إداني/وصلني/قبضت/استلمت/كسبت" = income.
4) "دفعت/صرفت/اشتريت/ركبت/أكلت/اتعشيت/خرجت/ضربت" = expense.
5) "حولت لـ/سلفت" = transfer.
6) لا تصنف فئات — فقط فكّك النص.
7) تجاهل الكلام الغير مالي ("قعدنا شوية"/"طلعنا اتمشينا").
JSON فقط.`;

/**
 * AI-powered narrative decomposition for Pro users.
 * Uses ~150 tokens — much cheaper than full classification.
 */
export async function decomposeWithAI(
  text: string,
  apiKey: string,
  maxTokens: number = 256,
): Promise<DecompositionResult> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: DECOMP_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
        responseSchema: DECOMPOSITION_SCHEMA,
      },
    });

    const result = await model.generateContent(
      `فكّك العمليات المالية:\n"${text}"`,
    );
    const response = result.response.text();
    const parsed = JSON.parse(response);

    if (!parsed?.segments?.length) {
      // Fallback to heuristic
      return decomposeHeuristic(text);
    }

    const segments: DecomposedSegment[] = parsed.segments.map(
      (seg: any, idx: number) => ({
        text: seg.text || text,
        amount:
          typeof seg.amount === "number" && seg.amount > 0 ? seg.amount : null,
        direction: seg.direction || "unknown",
        linkedVerb: detectLinkedVerb(seg.text || ""),
        personMentioned: detectPerson(seg.text || ""),
        segmentIndex: idx,
      }),
    );

    return {
      segments,
      method: "ai",
      isComplex: segments.length > 1,
    };
  } catch (error) {
    console.error("AI decomposition failed, falling back to heuristic:", error);
    return decomposeHeuristic(text);
  }
}

// ─── Hybrid Free Decomposer (0-100 tokens) ────────────────────────

/**
 * Hybrid strategy for Free users:
 * 1. Try heuristic first (0 tokens)
 * 2. If heuristic succeeds well → return (save tokens)
 * 3. If heuristic is uncertain → use lightweight AI (~100 tokens)
 */
export async function decomposeHybridFree(
  text: string,
  apiKey: string,
): Promise<DecompositionResult> {
  const heuristic = decomposeHeuristic(text);

  // If simple text or heuristic found segments all with amounts → trust it
  if (!heuristic.isComplex) {
    return heuristic;
  }

  const allHaveAmounts = heuristic.segments.every((s) => s.amount !== null);
  const allHaveDirection = heuristic.segments.every(
    (s) => s.direction !== "unknown",
  );

  if (allHaveAmounts && allHaveDirection && heuristic.segments.length >= 2) {
    return heuristic; // Heuristic did a good job, save tokens
  }

  // Heuristic is uncertain — use lightweight AI
  const amountCount = countAmounts(text);
  if (amountCount > 1 || text.length > 60) {
    try {
      const aiResult = await decomposeWithAI(text, apiKey, 128); // Smaller budget
      return {
        ...aiResult,
        method: "hybrid",
      };
    } catch {
      return heuristic; // AI failed, use what we have
    }
  }

  return heuristic;
}

// ─── Utility Exports ──────────────────────────────────────────────

/** Check if text is a simple single-transaction input */
export function isSimpleInput(text: string): boolean {
  const wordCount = text.trim().split(/\s+/).length;
  const amountCount = countAmounts(text);
  const hasConnector = STRONG_CONNECTORS.some((c) => text.includes(c));
  return wordCount <= 5 && amountCount <= 1 && !hasConnector;
}

/** Estimate tokens needed for AI decomposition */
export function estimateDecompositionTokens(text: string): number {
  // Arabic: ~3.5 chars per token, system prompt ~400 chars
  return Math.ceil((text.length + 400) / 3.5) + 48;
}
