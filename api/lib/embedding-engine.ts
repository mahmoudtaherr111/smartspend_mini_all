/**
 * SmartSpend Embedding Engine (Hybrid Confidence Layer)
 * ─────────────────────────────────────────────────────
 * Uses Gemini text-embedding-004 to semantically match user input
 * against known financial categories. Provides:
 *  - Multi-feature complexity scoring (not just text length)
 *  - LRU in-memory cache to avoid redundant API calls
 *  - Cosine similarity with margin-based calibration
 *  - Multi-label support for compound sentences
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { CATEGORIES, type MainCategory } from "./category-registry";

// ─────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────

export interface EmbeddingMatch {
  category: string;       // Arabic name e.g. "أكل وشرب"
  subCategory: string;
  score: number;          // calibrated 0-100
  margin: number;         // gap to second-best category
  rawSimilarity: number;  // raw cosine 0-1
}

export interface EmbeddingResult {
  matches: EmbeddingMatch[];         // one per detected segment
  isSimple: boolean;                 // true → safe to skip LLM
  complexityScore: number;           // 0-100 (low = simple)
  segments: string[];                // split sub-sentences
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

const EMBEDDING_MODEL = "text-embedding-004";

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
  { category: "أكل وشرب", subCategory: "عام",
    descriptors: ["أكل", "شرب", "طعام", "وجبة", "أكلت", "فطار", "غدا", "عشا", "بيتزا", "برجر", "شاورما", "سندوتش", "مطعم", "دليفري", "أكل بيت"] },
  { category: "أكل وشرب", subCategory: "قهوة وكافيه",
    descriptors: ["قهوة", "نسكافيه", "كافيه", "شاي", "مشروب ساخن", "لاتيه", "كابتشينو"] },
  { category: "أكل وشرب", subCategory: "بقالة",
    descriptors: ["بقالة", "سوبر ماركت", "خضار", "فاكهة", "لبن", "زبادي", "جبنة", "بيض", "أكل بيت", "طلبات البيت"] },
  { category: "مواصلات", subCategory: "عام",
    descriptors: ["مواصلات", "توصيلة", "ركبت", "مشوار", "طريق", "أوبر", "كريم", "تاكسي", "مترو", "أتوبيس", "باص", "توكتوك", "بنزين"] },
  { category: "فواتير", subCategory: "عام",
    descriptors: ["فاتورة", "كهرباء", "مياه", "غاز", "نت", "إنترنت", "شحن", "رصيد", "موبايل", "تليفون", "قسط", "أقساط", "تأمين"] },
  { category: "سكن", subCategory: "عام",
    descriptors: ["إيجار", "أثاث", "صيانة", "سباك", "كهربائي", "نقاش", "نجار", "شغالة", "منظفات", "غسالة", "تلاجة", "بيت"] },
  { category: "تسوق", subCategory: "عام",
    descriptors: ["تسوق", "شوبينج", "هدوم", "لبس", "موبايل", "لاب توب", "جزمة", "كوتشي", "شنطة", "ساعة", "إكسسوار"] },
  { category: "صحة", subCategory: "عام",
    descriptors: ["صحة", "دكتور", "صيدلية", "دوا", "تحاليل", "مستشفى", "أسنان", "عملية", "كشف", "روشتة", "علاج"] },
  { category: "تعليم", subCategory: "عام",
    descriptors: ["تعليم", "مدرسة", "جامعة", "كورس", "درس", "دروس", "كتب", "مصاريف دراسة", "يونيفورم"] },
  { category: "ترفيه", subCategory: "عام",
    descriptors: ["ترفيه", "سينما", "جيم", "نادي", "سفر", "مصيف", "خروجة", "شيشة", "بلاي ستيشن", "ألعاب"] },
  { category: "اشتراكات", subCategory: "عام",
    descriptors: ["اشتراك", "نتفلكس", "سبوتيفاي", "يوتيوب بريميوم", "شاهد", "VPN"] },
  { category: "هدايا وصدقات", subCategory: "عام",
    descriptors: ["هدية", "صدقة", "زكاة", "تبرع", "عيدية", "فرح", "خطوبة"] },
  { category: "استثمار", subCategory: "عام",
    descriptors: ["استثمار", "ذهب", "دهب", "أسهم", "شهادات", "عقارات", "عملات رقمية", "بيتكوين"] },
  { category: "خدمات سيارات", subCategory: "عام",
    descriptors: ["عربية", "صيانة عربية", "كاوتش", "بطارية", "زيت", "تغيير زيت", "كارتة", "مخالفة", "ركنة", "جراج"] },
  { category: "خروجات", subCategory: "عام",
    descriptors: ["خروجة", "فسحة", "كورنيش", "صحاب", "قعدة", "نزلة"] },
  // ── Income Categories ──
  { category: "مرتب", subCategory: "عام",
    descriptors: ["مرتب", "راتب", "بونص", "مكافأة", "أوفر تايم", "بدل", "حوافز"] },
  { category: "عمل حر", subCategory: "عام",
    descriptors: ["فريلانس", "عمل حر", "مشروع", "عمولة", "سبوبة", "شغل جانبي", "كلاينت"] },
  { category: "عوائد استثمار", subCategory: "عام",
    descriptors: ["أرباح", "فوائد", "كاش باك", "استرجاع", "عائد", "ربح"] },
  { category: "تحويل", subCategory: "عام",
    descriptors: ["تحويل", "حوالة", "سحب", "إيداع", "فودافون كاش", "انستاباي", "دين", "سلفة"] },
];

// ─────────────────────────────────────────────────
//  LRU Cache
// ─────────────────────────────────────────────────

class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // refresh position
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      // evict oldest
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
  }

  has(key: K): boolean { return this.map.has(key); }
  get size(): number { return this.map.size; }
}

// Cache for user input embeddings (recent phrases)
const inputEmbeddingCache = new LRUCache<string, number[]>(500);

// Pre-computed category descriptor embeddings (populated on first call)
let categoryEmbeddings: Array<{
  category: string;
  subCategory: string;
  descriptor: string;
  vector: number[];
}> | null = null;

let categoryEmbeddingsPromise: Promise<void> | null = null;

// ─────────────────────────────────────────────────
//  Core Functions
// ─────────────────────────────────────────────────

/**
 * Fetch embedding vector from Gemini text-embedding-004
 */
async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  // Check cache first
  const cached = inputEmbeddingCache.get(text);
  if (cached) return cached;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  const vector = result.embedding.values;

  inputEmbeddingCache.set(text, vector);
  return vector;
}

/**
 * Pre-compute embeddings for all category descriptors.
 * Called once on first request, then cached in memory.
 */
async function ensureCategoryEmbeddings(apiKey: string): Promise<void> {
  if (categoryEmbeddings) return;
  if (categoryEmbeddingsPromise) return categoryEmbeddingsPromise;

  categoryEmbeddingsPromise = (async () => {
    const results: Array<{
      category: string;
      subCategory: string;
      descriptor: string;
      vector: number[];
    }> = [];
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

    // Batch all descriptors
    for (const cat of CATEGORY_DESCRIPTORS) {
      for (const desc of cat.descriptors) {
        try {
          const result = await model.embedContent(desc);
          results.push({
            category: cat.category,
            subCategory: cat.subCategory,
            descriptor: desc,
            vector: result.embedding.values,
          });
        } catch (err) {
          console.warn(`Embedding failed for "${desc}":`, err);
        }
      }
    }

    categoryEmbeddings = results;
    console.log(`✅ Loaded ${results.length} category embeddings`);
  })();

  return categoryEmbeddingsPromise;
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Calibrate raw cosine similarity to a 0-100 confidence score
 * using min-max scaling with known range + margin bonus.
 *
 * cosine similarity for embeddings typically falls in 0.3-0.95 range.
 * We map: 0.5 → 0, 0.9 → 100, with margin bonus.
 */
function calibrateScore(rawSim: number, margin: number): number {
  // Min-max scaling: [0.5, 0.92] → [0, 100]
  const MIN_SIM = 0.50;
  const MAX_SIM = 0.92;
  const scaled = Math.max(0, Math.min(100,
    ((rawSim - MIN_SIM) / (MAX_SIM - MIN_SIM)) * 100
  ));

  // Margin bonus: if the gap to second-best is large, boost confidence
  const marginBonus = Math.min(10, margin * 50);

  return Math.min(100, Math.round(scaled + marginBonus));
}

/**
 * Find the best category match for a text segment
 */
async function matchSegment(
  text: string,
  apiKey: string
): Promise<EmbeddingMatch | null> {
  if (!categoryEmbeddings || categoryEmbeddings.length === 0) return null;

  const inputVector = await getEmbedding(text, apiKey);

  // Score each category descriptor
  const scores: Array<{ category: string; subCategory: string; sim: number }> = [];
  for (const ce of categoryEmbeddings) {
    const sim = cosineSimilarity(inputVector, ce.vector);
    scores.push({ category: ce.category, subCategory: ce.subCategory, sim });
  }

  // Aggregate: best score per category
  const catBest = new Map<string, { subCategory: string; bestSim: number }>();
  for (const s of scores) {
    const prev = catBest.get(s.category);
    if (!prev || s.sim > prev.bestSim) {
      catBest.set(s.category, { subCategory: s.subCategory, bestSim: s.sim });
    }
  }

  // Sort categories by best similarity descending
  const ranked = Array.from(catBest.entries())
    .map(([cat, v]) => ({ category: cat, subCategory: v.subCategory, sim: v.bestSim }))
    .sort((a, b) => b.sim - a.sim);

  if (ranked.length === 0) return null;

  const best = ranked[0];
  const secondBest = ranked.length > 1 ? ranked[1].sim : 0;
  const margin = best.sim - secondBest;

  return {
    category: best.category,
    subCategory: best.subCategory,
    score: calibrateScore(best.sim, margin),
    margin: Math.round(margin * 100),
    rawSimilarity: Math.round(best.sim * 1000) / 1000,
  };
}

// ─────────────────────────────────────────────────
//  Complexity Scoring (Multi-feature)
// ─────────────────────────────────────────────────

/** Conjunction / multi-transaction indicators */
// In Egyptian Arabic, 'و' can be a standalone word or a prefix (وركبت = و+ركبت)
const CONJUNCTION_PATTERNS = /(?:^|\s)(وكمان|وبعدين|بعدها|ومنهم|وبعد|بعد كده|ثم)(?:\s|$)|(?:^|\s)و(?:\s)|(?:^|\s)و(?=[أ-ي])/g;
const AMBIGUITY_PATTERNS = /حوالي|تقريبا|كده|ولا\s+\d|مش متأكد|يمكن/;
const AMOUNT_PATTERN = /\d+(\.\d+)?/g;

/**
 * Split compound sentences into segments on conjunctions + amounts.
 * "أكلت بيتزا بـ 100 وركبت أوبر بـ 50" → ["أكلت بيتزا بـ 100", "ركبت أوبر بـ 50"]
 */
export function splitSegments(text: string): string[] {
  // Split on Arabic conjunctions that typically separate transactions
  const splitTokens = /\s+(?:و|وكمان|وبعدين|بعدها|ثم|وبعد)\s+/;
  const raw = text.split(splitTokens).map(s => s.trim()).filter(s => s.length > 0);

  // Only split if each segment has at least one amount
  if (raw.length <= 1) return [text];

  const withAmounts = raw.filter(s => AMOUNT_PATTERN.test(s));
  // If most segments have amounts, it's a real multi-transaction
  return withAmounts.length >= raw.length * 0.5 ? raw : [text];
}

/**
 * Compute multi-feature complexity score (0-100).
 * Low score = simple, high = complex → needs LLM.
 */
export function computeComplexity(text: string): { score: number; features: ComplexityFeatures } {
  const words = text.split(/\s+/).filter(w => w.length >= 1);
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

/** Confidence threshold: above this → skip LLM */
const EMBEDDING_CONFIDENCE_THRESHOLD = 80;

/** Complexity threshold: below this → eligible for embedding-only */
const COMPLEXITY_THRESHOLD = 35;

/**
 * Main entry: run the embedding-based hybrid classifier.
 * Returns null if the input is too complex or low-confidence
 * (pipeline should fall through to LLM).
 */
export async function runEmbeddingClassifier(
  text: string,
  apiKey: string
): Promise<EmbeddingResult | null> {
  try {
    // 1. Ensure category embeddings are loaded
    await ensureCategoryEmbeddings(apiKey);

    // 2. Compute complexity
    const { score: complexityScore } = computeComplexity(text);
    const segments = splitSegments(text);

    // 3. For each segment, find best category match
    const matches: EmbeddingMatch[] = [];
    let cacheHit = false;

    for (const seg of segments) {
      const trimmed = seg.replace(/\d+(\.\d+)?/g, "").replace(/(جنيه|ج\.م|ج|الف|ألف)/g, "").trim();
      if (trimmed.length < 2) continue;

      if (inputEmbeddingCache.has(trimmed)) cacheHit = true;

      const match = await matchSegment(trimmed, apiKey);
      if (match) matches.push(match);
    }

    if (matches.length === 0) return null;

    // 4. Determine if simple enough to trust embeddings alone
    const allHighConfidence = matches.every(m => m.score >= EMBEDDING_CONFIDENCE_THRESHOLD);
    const allGoodMargin = matches.every(m => m.margin >= 8);
    const isSimple = complexityScore < COMPLEXITY_THRESHOLD && allHighConfidence && allGoodMargin;

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
 * Reset category embeddings cache (e.g. for testing or hot-reload)
 */
export function resetEmbeddingCache(): void {
  categoryEmbeddings = null;
  categoryEmbeddingsPromise = null;
}
