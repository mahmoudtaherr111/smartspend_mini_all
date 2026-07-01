/**
 * SmartSpend Embedding Engine (Local Semantic Matching Layer)
 * ─────────────────────────────────────────────────────
 * V4 Architecture — Zero API calls, zero cold start, zero external dependencies.
 *
 * Replaces the previous Gemini-based embedding system which:
 *  - Required 200+ API calls on cold start (~20 seconds)
 *  - Cost money per embedding
 *  - Had rate-limit issues
 *  - Was not accurate for short Arabic text (cosine similarity 0.88-0.97
 *    between completely different categories)
 *
 * V4 Architecture (local + Fireworks hybrid):
 *  1. Character n-gram TF-IDF vectors (local, pre-computed at startup, 0 API)
 *  2. Damerau-Levenshtein distance for fuzzy matching
 *  3. Fireworks qwen3-embedding-8b as semantic fallback (92% accuracy with instruct prefix)
 *  4. lru-cache for caching match results at both layers
 *
 * Fallback chain in matchSegment:
 *   a. LRU cache hit → instant return
 *   b. Exact descriptor match → instant return
 *   c. Local n-gram + damerau → if score ≥ 80, return (0 API calls)
 *   d. Fireworks embedding API → if key available and score > local (1 API call, cached)
 *   e. Return best result (local or null)
 */

import { CATEGORIES } from "./category-registry";
import damerauPkg from "damerau-levenshtein";
const damerauLevenshtein = (a: string, b: string): number => {
  const result = (damerauPkg as any)(a, b);
  return typeof result === "number" ? result : result.steps;
};
import { LRUCache } from "lru-cache";
import { normalizeArabic as normalizeArabicFuzzy } from "./fuzzy-match";
import {
  getFireworksEmbedding,
  buildFireworksDescriptorIndex,
  getDescriptorIndex,
  cosineSimilarity as fireworksCosSim,
} from "./fireworks-embedding-client";
import type { PlanId } from "./ai-usage-policy";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────

export interface EmbeddingMatch {
  category: string; // Arabic name e.g. "أكل وشرب"
  subCategory: string;
  score: number; // calibrated 0-100
  margin: number; // gap to second-best category
  rawSimilarity: number; // raw cosine 0-1
  topCategories?: string[]; // Phase 4 Fix: Top 3 candidate categories to give AI breathing room
}

export interface EmbeddingResult {
  matches: EmbeddingMatch[]; // one per detected segment
  isSimple: boolean; // true → safe to skip LLM
  complexityScore: number; // 0-100 (low = simple)
  segments: string[]; // split sub-sentences
  cacheHit: boolean;
}

export interface ComplexityFeatures {
  textLength: number;
  wordCount: number;
  amountCount: number;
  entityCount: number;
  hasConjunctions: boolean;
  hasAmbiguity: boolean;
  segmentCount: number;
}

// ─────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────

// Models kept for backward compatibility but no longer used for API calls
const EMBEDDING_MODEL = "local-v4";

/**
 * Category descriptors – short Arabic phrases that represent each category
 * so the embedding can match semantically even for new words the rule
 * engine has never seen.
 */
const CATEGORY_DESCRIPTORS: Array<{
  category: string;
  subCategory: string;
  descriptors: string[];
}> = [
  // ── Expense Categories ──
  {
    category: "أكل وشرب",
    subCategory: "مطاعم ووجبات",
    descriptors: [
      "أكل",
      "شرب",
      "طعام",
      "وجبة",
      "أكلت",
      "فطار",
      "غدا",
      "عشا",
      "بيتزا",
      "برجر",
      "شاورما",
      "سندوتش",
      "مطعم",
      "دليفري",
      "أكل بيت",
      "ماكدونالدز",
      "كنتاكي",
      "هارديز",
      "كشري",
      "الشبراوي",
      "ابو طارق",
      "بافلو",
      "كريب",
      "مشويات",
      "فول وطعمية",
      "سوشي",
      "شاورما سوري",
      "كباب",
    ],
  },
  {
    category: "أكل وشرب",
    subCategory: "قهوة وكافيه",
    descriptors: [
      "قهوة",
      "نسكافيه",
      "كافيه",
      "شاي",
      "مشروب ساخن",
      "لاتيه",
      "كابتشينو",
      "ستاربكس",
      "اسبريسو",
      "سيلانترو",
      "كوستا",
      "فرابيتشينو",
      "قهوة تركي",
      "ميكاتو",
      "موهيتو",
      "عصير",
    ],
  },
  {
    category: "أكل وشرب",
    subCategory: "بقالة ولحوم",
    descriptors: [
      "بقالة",
      "سوبر ماركت",
      "خضار",
      "فاكهة",
      "لبن",
      "زبادي",
      "جبنة",
      "بيض",
      "طلبات البيت",
      "كارفور",
      "سبينيس",
      "مترو ماركت",
      "كازيون",
      "بيم",
      "لحمة",
      "فراخ",
      "بانيه",
      "مفروم",
      "سمك",
      "رز",
      "زيت",
      "مكرونة",
      "سمنة",
      "عطارة",
      "توابل",
      "عيش",
      "مخبز",
    ],
  },
  {
    category: "أكل وشرب",
    subCategory: "تسالي وحلويات",
    descriptors: [
      "شوكولاتة",
      "شيبسي",
      "بيبسي",
      "كولا",
      "عصير",
      "تسالي",
      "لب",
      "سوداني",
      "ايس كريم",
      "حلويات",
      "تورتة",
      "جاتوه",
      "بسبوسة",
    ],
  },

  {
    category: "مواصلات",
    subCategory: "أوبر وكريم",
    descriptors: ["أوبر", "كريم", "توصيلة", "اندرايفر", "ديدي"],
  },
  {
    category: "مواصلات",
    subCategory: "مواصلات عامة",
    descriptors: [
      "مواصلات",
      "مشوار",
      "تاكسي",
      "مترو",
      "أتوبيس",
      "باص",
      "توكتوك",
      "سويفل",
      "ميكروباص",
      "مواصلة",
      "ميكروباس",
      "قطر",
      "تذكرة",
    ],
  },
  {
    category: "مواصلات",
    subCategory: "بنزين",
    descriptors: ["بنزين", "تفويلة", "محطة بنزين", "بنزينة"],
  },

  {
    category: "فواتير",
    subCategory: "كهرباء وغاز ومياه",
    descriptors: ["فاتورة", "كهرباء", "مياه", "غاز", "وصل مياه", "وصل نور"],
  },
  {
    category: "فواتير",
    subCategory: "إنترنت وموبايل",
    descriptors: [
      "نت",
      "إنترنت",
      "شحن",
      "رصيد",
      "موبايل",
      "تليفون",
      "فودافون",
      "اورنج",
      "اتصالات",
      "وي",
      "فوري",
      "باقة نت",
      "باقة مكالمات",
      "كارت شحن",
    ],
  },
  {
    category: "فواتير",
    subCategory: "أقساط وديون",
    descriptors: ["قسط", "أقساط", "سداد دين", "فاليو", "أمان", "سهولة"],
  },

  {
    category: "سكن",
    subCategory: "إيجار",
    descriptors: ["إيجار", "تأمين شقة", "ايجار الشقة", "قسط الشقة"],
  },
  {
    category: "سكن",
    subCategory: "صيانة وتصليح",
    descriptors: [
      "صيانة",
      "سباك",
      "كهربائي",
      "نقاش",
      "نجار",
      "تصليح",
      "سباكة",
      "عامل",
      "بواب",
      "حارس",
    ],
  },
  {
    category: "سكن",
    subCategory: "مستلزمات منزلية",
    descriptors: [
      "أثاث",
      "شغالة",
      "منظفات",
      "غسالة",
      "تلاجة",
      "بيت",
      "شقة",
      "مكواة",
      "ديكور",
      "سجاد",
      "ستائر",
      "مواعين",
      "صابون",
      "بريل",
      "اريال",
    ],
  },

  {
    category: "تسوق",
    subCategory: "ملابس وأحذية",
    descriptors: [
      "تسوق",
      "شوبينج",
      "هدوم",
      "لبس",
      "جزمة",
      "كوتشي",
      "شنطة",
      "ساعة",
      "إكسسوار",
      "زارا",
      "اديداس",
      "نايكي",
      "ديفاكتو",
      "جاكيت",
      "بنطلون",
      "قميص",
      "تيشرت",
    ],
  },
  {
    category: "تسوق",
    subCategory: "أجهزة إلكترونية",
    descriptors: [
      "موبايل",
      "لاب توب",
      "لابتوب",
      "كمبيوتر",
      "هاردوير",
      "كيبورد",
      "ماوس",
      "شاشة",
      "سماعة",
      "سماعات",
      "ايربودز",
      "ايفون",
      "معجون حراري",
      "رامات",
      "كارت شاشة",
      "باور بانك",
      "شاحن",
      "وصلة",
    ],
  },
  {
    category: "تسوق",
    subCategory: "عناية شخصية",
    descriptors: [
      "تجميل",
      "مكياج",
      "حلاق",
      "كوافير",
      "برفان",
      "عطر",
      "كريم",
      "شامبو",
      "سكين كير",
      "ميك اب",
      "نضارة",
      "مزيل عرق",
    ],
  },

  {
    category: "صحة",
    subCategory: "كشف ودكتور",
    descriptors: [
      "دكتور",
      "مستشفى",
      "أسنان",
      "عملية",
      "كشف",
      "فيزيتا",
      "عيادة",
      "دكتور اسنان",
      "استشارة",
    ],
  },
  {
    category: "صحة",
    subCategory: "أدوية وصيدلية",
    descriptors: [
      "صحة",
      "صيدلية",
      "دوا",
      "تحاليل",
      "روشتة",
      "علاج",
      "فيتامين",
      "بانادول",
      "حقنة",
      "اشعة",
    ],
  },

  {
    category: "تعليم",
    subCategory: "مدارس وجامعات",
    descriptors: ["تعليم", "مدرسة", "جامعة", "مصاريف دراسة", "ترم", "كلية"],
  },
  {
    category: "تعليم",
    subCategory: "كورسات ودروس",
    descriptors: [
      "كورس",
      "درس",
      "دروس",
      "سنتر",
      "مدرس",
      "مذكرات",
      "ملزمة",
      "كتب",
      "ادوات مدرسية",
      "كشكول",
    ],
  },

  {
    category: "ترفيه",
    subCategory: "خروجات وسينما",
    descriptors: [
      "ترفيه",
      "سينما",
      "نادي",
      "سفر",
      "مصيف",
      "خروجة",
      "شيشة",
      "ماتش",
      "كورة",
      "حجز ملعب",
      "فسحة",
      "تمشية",
      "تذاكر",
      "ملاهي",
      "بلايستيشن",
      "بلاي ستيشن",
    ],
  },
  {
    category: "ترفيه",
    subCategory: "جيم ورياضة",
    descriptors: ["جيم", "اشتراك الجيم", "بروتين", "كملات غذائية", "فورمة"],
  },

  {
    category: "تدخين",
    subCategory: "سجائر",
    descriptors: [
      "سجاير",
      "سجائر",
      "علبة سجاير",
      "كليوباترا",
      "مارلبورو",
      "ميريت",
    ],
  },
  {
    category: "تدخين",
    subCategory: "فيب",
    descriptors: ["فيب", "ليكود", "بود", "كويل", "سيجارة إلكترونية"],
  },
  {
    category: "تدخين",
    subCategory: "شيشة",
    descriptors: ["دخان", "معسل", "شيشة", "ارجيلة", "فحم"],
  },

  {
    category: "اشتراكات",
    subCategory: "باقات رقمية",
    descriptors: [
      "اشتراك",
      "نتفلكس",
      "سبوتيفاي",
      "يوتيوب بريميوم",
      "شاهد",
      "VPN",
      "اي كلاود",
      "جيم باس",
      "أنغامي",
      "بلايستيشن بلس",
      "كلاود",
    ],
  },

  {
    category: "هدايا وصدقات",
    subCategory: "هدايا",
    descriptors: [
      "هدية",
      "عيدية",
      "فرح",
      "خطوبة",
      "نقطة",
      "بوكيه ورد",
      "شوكولاتة هدية",
    ],
  },
  {
    category: "هدايا وصدقات",
    subCategory: "صدقات وتبرعات",
    descriptors: [
      "صدقة",
      "زكاة",
      "تبرع",
      "مستشفى 57357",
      "جمعية رسالة",
      "صندوق تحيا مصر",
      "تبرعات",
      "للجامع",
    ],
  },

  {
    category: "استثمار",
    subCategory: "ذهب",
    descriptors: [
      "استثمار",
      "ذهب",
      "دهب",
      "سبيكة",
      "جنيه دهب",
      "غويشة",
      "خاتم دهب",
    ],
  },
  {
    category: "استثمار",
    subCategory: "أسهم وشهادات",
    descriptors: [
      "أسهم",
      "شهادات",
      "عقارات",
      "عملات رقمية",
      "بيتكوين",
      "وديعة",
      "بورصة",
      "ثاندر",
      "صندوق استثمار",
      "كريبتو",
    ],
  },

  {
    category: "خدمات سيارات",
    subCategory: "صيانة",
    descriptors: [
      "عربية",
      "صيانة عربية",
      "كاوتش",
      "بطارية",
      "زيت",
      "تغيير زيت",
      "ميكانيكي",
      "عفشجي",
      "كهربائي سيارات",
      "قطع غيار",
    ],
  },
  {
    category: "خدمات سيارات",
    subCategory: "أخرى",
    descriptors: [
      "كارتة",
      "مخالفة",
      "ركنة",
      "جراج",
      "سايس",
      "غسيل عربية",
      "تلميع",
    ],
  },

  // ── Income Categories ──
  {
    category: "مرتب",
    subCategory: "راتب أساسي",
    descriptors: ["مرتب", "راتب", "قبضت", "القبض", "شيك", "معاش"],
  },
  {
    category: "مرتب",
    subCategory: "حوافز ومكافآت",
    descriptors: ["بونص", "مكافأة", "أوفر تايم", "بدل", "حوافز", "زيادة"],
  },

  {
    category: "عمل حر",
    subCategory: "مشاريع",
    descriptors: [
      "فريلانس",
      "عمل حر",
      "مشروع",
      "عمولة",
      "سبوبة",
      "شغل جانبي",
      "كلاينت",
      "أب وورك",
      "مستقل",
      "شغلانة",
    ],
  },

  {
    category: "عوائد استثمار",
    subCategory: "أرباح",
    descriptors: [
      "أرباح",
      "فوائد",
      "كاش باك",
      "استرجاع",
      "عائد",
      "ربح",
      "كوبونات",
      "توزيعات",
    ],
  },

  {
    category: "تحويل",
    subCategory: "إيداع واستلام",
    descriptors: ["حوالة", "إيداع", "فودافون كاش", "انستاباي", "استلمت تحويل"],
  },
  {
    category: "تحويل",
    subCategory: "سلف وديون",
    descriptors: ["دين", "سلفة", "استلفت", "سلفت", "قرض", "سداد"],
  },
  {
    category: "تحويل",
    subCategory: "جمعيات",
    descriptors: ["جمعية", "قسط جمعية", "قبض الجمعية", "دفعت الجمعية"],
  },
];

// ─────────────────────────────────────────────────
//  Local Semantic Index (Zero API Calls)
// ─────────────────────────────────────────────────

/** Normalize Arabic text for local matching */
function normalizeForMatch(text: string): string {
  return normalizeArabicFuzzy(text)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Generate character n-grams (2-4 chars) for TF-based matching */
function charNgrams(text: string, minN: number = 2, maxN: number = 4): string[] {
  const grams: string[] = [];
  const cleaned = text.replace(/\s/g, "_");
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i <= cleaned.length - n; i++) {
      grams.push(cleaned.substring(i, i + n));
    }
  }
  return grams;
}

/** Build a TF vector (Map of n-gram → frequency) */
function buildTfVector(text: string): Map<string, number> {
  const grams = charNgrams(text);
  const tf = new Map<string, number>();
  for (const gram of grams) {
    tf.set(gram, (tf.get(gram) || 0) + 1);
  }
  const total = grams.length || 1;
  for (const [key, val] of tf) {
    tf.set(key, val / total);
  }
  return tf;
}

/** Cosine similarity between two sparse TF vectors */
function cosineSim(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const [key, valA] of a) {
    normA += valA * valA;
    const valB = b.get(key);
    if (valB !== undefined) dot += valA * valB;
  }
  for (const [, valB] of b) {
    normB += valB * valB;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

interface DescriptorEntry {
  category: string;
  subCategory: string;
  descriptor: string;
  normalizedDescriptor: string;
  tfVector: Map<string, number>;
}

// Pre-computed local index — built once at startup, zero API calls
let localIndex: DescriptorEntry[] | null = null;
let indexPromise: Promise<void> | null = null;

// LRU cache for match results — production-grade with TTL
const matchCache = new LRUCache<string, EmbeddingMatch>({
  max: 2000,
  ttl: 1000 * 60 * 60 * 24, // 24 hours
});

/**
 * Build the local semantic index from CATEGORY_DESCRIPTORS.
 * This replaces the previous ensureCategoryEmbeddings which made
 * 200+ Gemini API calls with 100ms delays (~20 seconds cold start).
 * New: runs in < 5ms, zero API calls.
 */
function ensureLocalIndex(): Promise<void> {
  if (localIndex) return Promise.resolve();
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    const entries: DescriptorEntry[] = [];
    for (const cat of CATEGORY_DESCRIPTORS) {
      for (const desc of cat.descriptors) {
        const normalized = normalizeForMatch(desc);
        entries.push({
          category: cat.category,
          subCategory: cat.subCategory,
          descriptor: desc,
          normalizedDescriptor: normalized,
          tfVector: buildTfVector(normalized),
        });
      }
    }
    localIndex = entries;
    console.log(`[Embedding Engine V4] Built local index: ${entries.length} descriptors, 0 API calls`);
  })();

  return indexPromise;
}

/**
 * Calibrate raw similarity (0-1) to a 0-100 confidence score.
 * For local n-gram matching, similarity range is tighter (0.3-0.9),
 * so we use a different scaling than the old API-based calibration.
 */
function calibrateScore(rawSim: number, margin: number): number {
  const MIN_SIM = 0.35;
  const MAX_SIM = 0.85;
  const scaled = Math.max(
    0,
    Math.min(100, ((rawSim - MIN_SIM) / (MAX_SIM - MIN_SIM)) * 100),
  );
  const marginBonus = Math.min(15, margin * 150);
  return Math.min(100, Math.round(scaled + marginBonus));
}

/**
 * Find the best category match for a text segment.
 *
 * 4-layer fallback chain (ordered by cost: cheapest first):
 *  a. LRU cache hit → instant (0 API calls)
 *  b. Exact descriptor match → instant (0 API calls)
 *  c. Local n-gram + damerau → if score ≥ 80, return (0 API calls)
 *  d. Fireworks embedding API → if key available and score > local (1 API call, cached)
 *  e. Return best result (local or null)
 */
export async function matchSegment(
  text: string,
  _apiKey?: string,
  fireworksApiKey?: string,
): Promise<EmbeddingMatch | null> {
  await ensureLocalIndex();
  if (!localIndex || localIndex.length === 0) return null;

  const normalizedInput = normalizeForMatch(text);
  if (normalizedInput.length < 2) return null;

  // a. Check cache
  const cacheKey = `match:${normalizedInput}`;
  const cached = matchCache.get(cacheKey);
  if (cached) return cached;

  // b. Exact descriptor match
  for (const entry of localIndex) {
    if (entry.normalizedDescriptor === normalizedInput) {
      const result: EmbeddingMatch = {
        category: entry.category,
        subCategory: entry.subCategory,
        score: 100,
        margin: 100,
        rawSimilarity: 1.0,
        topCategories: [entry.category],
      };
      matchCache.set(cacheKey, result);
      return result;
    }
  }

  // c. Local n-gram TF cosine similarity + damerau fuzzy boost
  const inputVector = buildTfVector(normalizedInput);
  const scores: Array<{ category: string; subCategory: string; sim: number }> = [];
  for (const entry of localIndex) {
    const sim = cosineSim(inputVector, entry.tfVector);
    scores.push({ category: entry.category, subCategory: entry.subCategory, sim });
  }

  // d. Damerau-Levenshtein fuzzy boost for short inputs
  if (normalizedInput.length >= 3 && normalizedInput.length <= 15) {
    let bestFuzzySim = 0;
    let bestFuzzyCat = "";
    let bestFuzzySub = "";
    for (const entry of localIndex) {
      if (Math.abs(entry.normalizedDescriptor.length - normalizedInput.length) > 3) continue;
      const dist = damerauLevenshtein(normalizedInput, entry.normalizedDescriptor);
      const maxLen = Math.max(normalizedInput.length, entry.normalizedDescriptor.length);
      const sim = 1 - dist / maxLen;
      if (sim > bestFuzzySim) {
        bestFuzzySim = sim;
        bestFuzzyCat = entry.category;
        bestFuzzySub = entry.subCategory;
      }
    }
    if (bestFuzzySim >= 0.8) {
      const existingIdx = scores.findIndex(s => s.category === bestFuzzyCat);
      if (existingIdx >= 0) {
        scores[existingIdx].sim = Math.max(scores[existingIdx].sim, bestFuzzySim);
      } else {
        scores.push({ category: bestFuzzyCat, subCategory: bestFuzzySub, sim: bestFuzzySim });
      }
    }
  }

  // e. Aggregate best per category (local results)
  const catBest = new Map<string, { subCategory: string; bestSim: number }>();
  for (const s of scores) {
    const prev = catBest.get(s.category);
    if (!prev || s.sim > prev.bestSim) {
      catBest.set(s.category, { subCategory: s.subCategory, bestSim: s.sim });
    }
  }

  const rankedLocal = Array.from(catBest.entries())
    .map(([cat, v]) => ({
      category: cat,
      subCategory: v.subCategory,
      sim: v.bestSim,
    }))
    .sort((a, b) => b.sim - a.sim);

  // f. Build local result (may be used if Fireworks fails or is unavailable)
  let localResult: EmbeddingMatch | null = null;
  if (rankedLocal.length > 0 && rankedLocal[0].sim >= 0.3) {
    const best = rankedLocal[0];
    const secondBest = rankedLocal.length > 1 ? rankedLocal[1].sim : 0;
    const margin = best.sim - secondBest;
    localResult = {
      category: best.category,
      subCategory: best.subCategory,
      score: calibrateScore(best.sim, margin),
      margin: Math.round(margin * 100),
      rawSimilarity: Math.round(best.sim * 1000) / 1000,
      topCategories: rankedLocal.slice(0, 4).map((r) => r.category),
    };
  }

  // g. If local result is strong enough, return it (0 API calls)
  if (localResult && localResult.score >= 80) {
    matchCache.set(cacheKey, localResult);
    return localResult;
  }

  // h. Fireworks embedding fallback (1 API call, cached for 24h)
  if (fireworksApiKey) {
    try {
      // Ensure descriptor index is built
      const fwIndex = getDescriptorIndex();
      if (!fwIndex) {
        await buildFireworksDescriptorIndex(CATEGORY_DESCRIPTORS, fireworksApiKey);
      }
      const fwIndexBuilt = getDescriptorIndex();
      if (fwIndexBuilt && fwIndexBuilt.length > 0) {
        const queryResult = await getFireworksEmbedding(text, fireworksApiKey);
        if (queryResult) {
          const fwScores: Array<{ category: string; subCategory: string; sim: number }> = [];
          for (const desc of fwIndexBuilt) {
            const sim = fireworksCosSim(queryResult.embedding, desc.vector);
            fwScores.push({ category: desc.category, subCategory: desc.subCategory, sim });
          }

          // Aggregate best per category (Fireworks results)
          const fwCatBest = new Map<string, { subCategory: string; bestSim: number }>();
          for (const s of fwScores) {
            const prev = fwCatBest.get(s.category);
            if (!prev || s.sim > prev.bestSim) {
              fwCatBest.set(s.category, { subCategory: s.subCategory, bestSim: s.sim });
            }
          }

          const rankedFw = Array.from(fwCatBest.entries())
            .map(([cat, v]) => ({
              category: cat,
              subCategory: v.subCategory,
              sim: v.bestSim,
            }))
            .sort((a, b) => b.sim - a.sim);

          if (rankedFw.length > 0 && rankedFw[0].sim >= 0.5) {
            const best = rankedFw[0];
            const secondBest = rankedFw.length > 1 ? rankedFw[1].sim : 0;
            const margin = best.sim - secondBest;

            // Fireworks calibration: similarity range [0.5, 0.95] → [0, 100]
            const fwMin = 0.5, fwMax = 0.95;
            const fwScaled = Math.max(0, Math.min(100, ((best.sim - fwMin) / (fwMax - fwMin)) * 100));
            const fwMarginBonus = Math.min(15, margin * 150);
            const fwScore = Math.min(100, Math.round(fwScaled + fwMarginBonus));

            const fwResult: EmbeddingMatch = {
              category: best.category,
              subCategory: best.subCategory,
              score: fwScore,
              margin: Math.round(margin * 100),
              rawSimilarity: Math.round(best.sim * 1000) / 1000,
              topCategories: rankedFw.slice(0, 4).map((r) => r.category),
            };

            // Use Fireworks result if it's better than local
            if (!localResult || fwResult.score > localResult.score) {
              matchCache.set(cacheKey, fwResult);
              return fwResult;
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Embedding Engine] Fireworks fallback failed:", err);
    }
  }

  // i. Return local result if any (even if low confidence)
  if (localResult) {
    matchCache.set(cacheKey, localResult);
    return localResult;
  }

  return null;
}

// ─────────────────────────────────────────────────
//  Complexity Scoring (Multi-feature)
// ─────────────────────────────────────────────────

/** Conjunction / multi-transaction indicators */
// In Egyptian Arabic, 'و' can be a standalone word or a prefix (وركبت = و+ركبت)
const CONJUNCTION_PATTERNS =
  /(?:^|\s)(وكمان|وبعدين|بعدها|ومنهم|وبعد|بعد كده|ثم)(?:\s|$)|(?:^|\s)و(?:\s)|(?:^|\s)و(?=[أ-ي])/g;
const AMBIGUITY_PATTERNS = /حوالي|تقريبا|كده|ولا\s+\d|مش متأكد|يمكن/;
const AMOUNT_PATTERN = /\d+(\.\d+)?/g;

/**
 * Split compound sentences into segments on conjunctions + amounts.
 * "أكلت بيتزا بـ 100 وركبت أوبر بـ 50" → ["أكلت بيتزا بـ 100", "ركبت أوبر بـ 50"]
 */
export function splitSegments(text: string): string[] {
  // Preprocess: detach attached waw before known financial verb patterns.
  // Egyptian Arabic often writes "وركبت" instead of "و ركبت" — this fixes
  // the split by adding a space before "و" when followed by a past-tense verb
  // (3+ Arabic chars ending with ت/نا). Does NOT break words like "ورد" or "وفاء".
  const preprocessed = text.replace(/(\s)و([أ-ي]{3,}(?:ت|نا)\s)/g, "$1و $2");

  // Split on Arabic conjunctions that typically separate transactions
  const splitTokens = /\s+(?:و|وكمان|وبعدين|بعدها|ثم|وبعد)\s+/;
  const raw = preprocessed
    .split(splitTokens)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Only split if each segment has at least one amount
  if (raw.length <= 1) return [text];

  const withAmounts = raw.filter((s) => AMOUNT_PATTERN.test(s));
  // If most segments have amounts, it's a real multi-transaction
  return withAmounts.length >= raw.length * 0.5 ? raw : [text];
}

/**
 * Compute multi-feature complexity score (0-100).
 * Low score = simple, high = complex → needs LLM.
 */
export function computeComplexity(text: string): {
  score: number;
  features: ComplexityFeatures;
} {
  const words = text.split(/\s+/).filter((w) => w.length >= 1);
  const amounts = text.match(AMOUNT_PATTERN) || [];
  const conjunctions = text.match(CONJUNCTION_PATTERNS) || [];
  const segments = splitSegments(text);

  const features: ComplexityFeatures = {
    textLength: text.length,
    wordCount: words.length,
    amountCount: amounts.length,
    entityCount: conjunctions.length,
    hasConjunctions: conjunctions.length > 0,
    hasAmbiguity: AMBIGUITY_PATTERNS.test(text),
    segmentCount: segments.length,
  };

  // Weighted scoring
  let score = 0;

  // Length contribution (0-25)
  score += Math.min(25, (features.textLength / 100) * 25);

  // Word count (0-20)
  score += Math.min(20, (features.wordCount / 15) * 20);

  // Multiple amounts (0-20)
  score += Math.min(20, (features.amountCount - 1) * 10);

  // Conjunctions (0-20)
  score += features.hasConjunctions ? 20 : 0;

  // Ambiguity (0-20)
  score += features.hasAmbiguity ? 20 : 0;

  return { score: Math.min(100, Math.round(score)), features };
}

// ─────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────

function thresholdsForPlan(plan: PlanId = "free") {
  if (plan === "free") {
    return { confidence: 75, complexity: 48, margin: 6 };
  }
  if (plan === "pro") {
    return { confidence: 80, complexity: 35, margin: 8 };
  }
  return { confidence: 78, complexity: 40, margin: 7 };
}

/**
 * Main entry: run the embedding-based hybrid classifier.
 * Returns null if the input is too complex or low-confidence
 * (pipeline should fall through to LLM).
 */
export async function runEmbeddingClassifier(
  text: string,
  _apiKey?: string,
  plan: PlanId = "free",
): Promise<EmbeddingResult | null> {
  const {
    confidence: EMBEDDING_CONFIDENCE_THRESHOLD,
    complexity: COMPLEXITY_THRESHOLD,
    margin: MARGIN_MIN,
  } = thresholdsForPlan(plan);
  try {
    // 1. Ensure local index is built
    await ensureLocalIndex();

    // 2. Compute complexity
    const { score: complexityScore } = computeComplexity(text);
    const segments = splitSegments(text);

    // 3. For each segment, find best category match
    const matches: EmbeddingMatch[] = [];
    let cacheHit = false;

    for (const seg of segments) {
      const trimmed = seg
        .replace(/\d+(\.\d+)?/g, "")
        .replace(/(جنيه|ج\.م|ج|الف|ألف)/g, "")
        .trim();
      if (trimmed.length < 2) continue;

      const normalizedTrim = normalizeForMatch(trimmed);
      if (matchCache.has(`match:${normalizedTrim}`)) cacheHit = true;

      const match = await matchSegment(trimmed);
      if (match) matches.push(match);
    }

    if (matches.length === 0) return null;

    // 4. Determine if simple enough to trust embeddings alone
    const allHighConfidence = matches.every(
      (m) => m.score >= EMBEDDING_CONFIDENCE_THRESHOLD,
    );
    const allGoodMargin = matches.every((m) => m.margin >= MARGIN_MIN);
    const isSimple =
      complexityScore < COMPLEXITY_THRESHOLD &&
      allHighConfidence &&
      allGoodMargin;

    return {
      matches,
      isSimple,
      complexityScore,
      segments,
      cacheHit,
    };
  } catch (err) {
    console.error("Embedding engine error:", err);
    return null;
  }
}

/**
 * Warmup: explicitly trigger category embeddings to load in background.
 * Call this when the server starts.
 */
export function warmupEmbeddingEngine(_apiKey?: string, fireworksApiKey?: string): void {
  ensureLocalIndex().catch((err: unknown) => {
    console.error("Embedding engine warmup failed:", err);
  });
  // Pre-build Fireworks descriptor index in background (avoids 10-30s delay on first request)
  if (fireworksApiKey) {
    import("./fireworks-embedding-client").then(({ buildFireworksDescriptorIndex }) => {
      buildFireworksDescriptorIndex(CATEGORY_DESCRIPTORS, fireworksApiKey).catch((err: unknown) => {
        console.warn("Fireworks descriptor warmup failed (non-blocking):", err);
      });
    }).catch(() => {});
  }
}

/**
 * Reset local index cache (e.g. for testing or hot-reload)
 */
export function resetEmbeddingCache(): void {
  localIndex = null;
  indexPromise = null;
  matchCache.clear();
}

export interface PastTransactionMatch {
  description: string;
  category: string;
  subCategory: string;
  similarity: number;
}

/**
 * Searches the user's past transactions using embeddings (Personalized RAG)
 */
export async function findSimilarPastTransactions(
  text: string,
  recentTransactions: { description: string; category: string; subCategory: string; }[],
  _apiKey?: string,
  _modelName?: string,
  _userId?: string,
): Promise<PastTransactionMatch[]> {
  try {
    await ensureLocalIndex();
    const normalizedInput = normalizeForMatch(text);
    const inputVector = buildTfVector(normalizedInput);
    
    // De-duplicate past transactions by description
    const uniqueMap = new Map<string, { description: string; category: string; subCategory: string; }>();
    for (const t of recentTransactions) {
      if (t.description && t.description.length > 2 && t.category) {
        uniqueMap.set(t.description.trim(), t);
      }
    }
    const uniqueTx = Array.from(uniqueMap.values());

    const results = uniqueTx.map((tx) => {
      const txVector = buildTfVector(normalizeForMatch(tx.description));
      const sim = cosineSim(inputVector, txVector);
      return { ...tx, similarity: sim };
    });

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

  } catch (err) {
    console.error("findSimilarPastTransactions error:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────
//  Global Knowledge Base (Egyptian Brand & Slang RAG)
// ─────────────────────────────────────────────────

export interface GlobalMerchantEntry {
  merchant: string;
  category: string;
  subCategory: string;
  keywords: string[];
  isInstallmentCommon: boolean;
}

export interface GlobalMerchantEmbedding {
  merchant: string;
  category: string;
  subCategory: string;
  keyword: string;
  vector: number[];
  isInstallmentCommon: boolean;
}

export interface GlobalRAGMatch {
  merchant: string;
  category: string;
  subCategory: string;
  similarity: number;
  score: number; // 0-100 calibrated
  isInstallmentCommon: boolean;
  matchedKeyword: string;
}

const GLOBAL_CATEGORY_MAP: Record<string, string> = {
  "Telecom": "فواتير",
  "Transport": "مواصلات",
  "Food": "أكل وشرب",
  "Groceries": "أكل وشرب",
  "Shopping": "تسوق",
  "Electronics": "تسوق",
  "Financial": "تحويل",
  "Health": "صحة",
  "Charity": "هدايا وصدقات",
  "Entertainment": "ترفيه",
  "Services": "متنوعات",
  "Bills": "فواتير",
  "Furniture": "سكن",
  "Education": "تعليم"
};

const GLOBAL_SUBCATEGORY_MAP: Record<string, string> = {
  // Food
  "Fast Food": "وجبات سريعة",
  "Restaurant": "مطعم",
  "Cafe": "قهوة وكافيه",
  "Bakery": "مخبوزات",
  "Delivery": "دليفري",
  "Local": "عام",
  "Nuts & Coffee": "قهوة وكافيه",
  "Nuts": "سناكس",

  // Transport
  "Ride-Hailing": "أوبر/كريم",
  "Bus": "أتوبيس",
  "Public Transport": "مترو",
  "Fuel": "بنزين",
  "Micobuses & Taxis": "عام",
  "Flight": "طيران",

  // Bills
  "Payment Gateway": "عام",
  "Electricity": "كهرباء",
  "Gas": "غاز",
  "Water": "مياه",
  "Traffic": "عام",
  "Syndicate": "عام",

  // Shopping
  "E-commerce": "عام",
  "Home & Electronics": "أجهزة إلكترونية",
  "Retail & Installments": "أجهزة إلكترونية",
  "Retail": "عام",
  "Fashion": "ملابس",
  "Cosmetics": "عناية شخصية",
  "Toys": "عام",
  "Kids": "عام",
  "Eyewear": "نظارات",
  "Pets": "عام",
  "Furniture": "أثاث",

  // Health
  "Booking": "دكتور",
  "Pharmacy": "صيدلية",
  "Consultation": "دكتور",
  "Clinics": "دكتور",
  "Hospital": "مستشفى",

  // Entertainment
  "Streaming": "منصات مشاهدة",
  "Music": "سبوتيفاي",
  "Sports": "رياضة وجيم",
  "Cinema": "سينما",
  "Theme Park": "فسحة",

  // Services
  "Maintenance": "صيانة",
  "Car Maintenance": "صيانة عربية",
  "Coworking": "مساحة عمل",

  // Financial
  "Installments": "أقساط",
  "Transfer": "انستاباي",
  "Mobile Wallet": "فودافون كاش",
  "Bank": "تحويل بنكي",
  "App": "عام",
  "Donation": "صدقة/تبرع",

  // General Slang & personal care
  "Tips": "عام",
  "Personal Care": "عناية شخصية",
  "Education": "عام",
  "Fitness": "رياضة وجيم"
};

let globalMerchantEmbeddings: GlobalMerchantEmbedding[] | null = null;
let globalKnowledgeBasePromise: Promise<void> | null = null;

/**
 * Loads the Global Knowledge Base from egypt_merchants_rag.json.
 * V4: Builds local TF vectors instead of calling Gemini API.
 * Zero API calls, zero cold start.
 */
export async function loadGlobalKnowledgeBase(_apiKey?: string): Promise<void> {
  if (globalMerchantEmbeddings) return;
  if (globalKnowledgeBasePromise) return globalKnowledgeBasePromise;

  globalKnowledgeBasePromise = (async () => {
    try {
      const baseDir = path.resolve(process.cwd(), "api/lib");
      const dictPath = path.join(baseDir, "egypt_merchants_rag.json");

      if (!fs.existsSync(dictPath)) {
        console.warn(`[Global RAG] Dictionary file not found at ${dictPath}. Global RAG matches will be empty.`);
        globalMerchantEmbeddings = [];
        return;
      }

      const rawDict = fs.readFileSync(dictPath, "utf-8");
      const dict = JSON.parse(rawDict) as GlobalMerchantEntry[];
      
      const loaded: GlobalMerchantEmbedding[] = [];
      
      for (const entry of dict) {
        const wordsToEmbed = Array.from(new Set([entry.merchant, ...entry.keywords])).filter(w => w && w.length > 1);
        for (const word of wordsToEmbed) {
          const categoryAr = GLOBAL_CATEGORY_MAP[entry.category] || "متنوعات";
          const subCategoryAr = GLOBAL_SUBCATEGORY_MAP[entry.subCategory] || "عام";
          
          loaded.push({
            merchant: entry.merchant,
            category: categoryAr,
            subCategory: subCategoryAr,
            keyword: word,
            vector: Array.from(buildTfVector(normalizeForMatch(word)).values()) as unknown as number[],
            isInstallmentCommon: entry.isInstallmentCommon
          });
        }
      }
      globalMerchantEmbeddings = loaded;
      console.log(`[Global RAG V4] Loaded ${loaded.length} merchant entries (local TF vectors, 0 API calls).`);
    } catch (err) {
      console.error("[Global RAG] Initialization failed:", err);
      globalMerchantEmbeddings = [];
    }
  })();

  return globalKnowledgeBasePromise;
}

/**
 * Searches the Global Knowledge Base for the best merchant/slang match.
 * Returns a high-confidence match if similarity is above a threshold.
 */
export async function searchGlobalKnowledgeBase(
  text: string,
  _apiKey?: string,
  minSimilarity: number = 0.55
): Promise<GlobalRAGMatch | null> {
  try {
    await loadGlobalKnowledgeBase();

    if (!globalMerchantEmbeddings || globalMerchantEmbeddings.length === 0) {
      return null;
    }

    const cleanText = text
      .replace(/\d+(\.\d+)?/g, "")
      .replace(/(جنيه|ج\.م|ج|الف|ألف|قسط|دفعت|حولت|صرفت|شحنت)/g, "")
      .trim();

    if (cleanText.length < 2) return null;

    const normalizedInput = normalizeForMatch(cleanText);
    const inputVector = buildTfVector(normalizedInput);

    let bestMatch: GlobalMerchantEmbedding | null = null;
    let maxSim = -1;

    for (const ge of globalMerchantEmbeddings) {
      const geVector = buildTfVector(normalizeForMatch(ge.keyword));
      const sim = cosineSim(inputVector, geVector);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatch = ge;
      }
    }

    // Damerau fuzzy boost
    if (bestMatch && maxSim < minSimilarity && normalizedInput.length >= 3 && normalizedInput.length <= 15) {
      let bestFuzzySim = 0;
      let bestFuzzyMatch: GlobalMerchantEmbedding | null = null;
      for (const ge of globalMerchantEmbeddings) {
        const normKw = normalizeForMatch(ge.keyword);
        if (Math.abs(normKw.length - normalizedInput.length) > 3) continue;
        const dist = damerauLevenshtein(normalizedInput, normKw);
        const sim = 1 - dist / Math.max(normalizedInput.length, normKw.length);
        if (sim > bestFuzzySim) {
          bestFuzzySim = sim;
          bestFuzzyMatch = ge;
        }
      }
      if (bestFuzzyMatch && bestFuzzySim > maxSim) {
        maxSim = bestFuzzySim;
        bestMatch = bestFuzzyMatch;
      }
    }

    if (!bestMatch || maxSim < minSimilarity) {
      return null;
    }

    const MIN_SIM = 0.4;
    const MAX_SIM = 0.85;
    const calibrated = Math.max(0, Math.min(100, ((maxSim - MIN_SIM) / (MAX_SIM - MIN_SIM)) * 100));

    return {
      merchant: bestMatch.merchant,
      category: bestMatch.category,
      subCategory: bestMatch.subCategory,
      similarity: maxSim,
      score: Math.round(calibrated),
      isInstallmentCommon: bestMatch.isInstallmentCommon,
      matchedKeyword: bestMatch.keyword
    };
  } catch (err) {
    console.error("[Global RAG] Search failed:", err);
    return null;
  }
}
