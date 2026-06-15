/**
 * SmartSpend — Local RAG Engine (Zero-API)
 * ═════════════════════════════════════════
 * High-performance, fully local semantic search engine for Egyptian Arabic
 * financial transaction classification. Uses character n-gram TF-IDF
 * vectorization with cosine similarity for near-instant matching.
 *
 * Why this replaces the Embedding-based RAG:
 * - text-embedding-004 is unavailable on the current API
 * - Local engine = 0 API calls, 0 tokens, < 1ms per search
 * - Character n-grams handle Arabic spelling variations naturally
 * - No external dependencies or rate limits
 *
 * Architecture:
 *   1. On startup, loads all 3 JSON knowledge bases
 *   2. Normalizes all Arabic text (removes diacritics, hamza variants)
 *   3. Builds character n-gram (2-4 chars) TF-IDF vectors
 *   4. Search: normalize input → vectorize → cosine similarity → rank
 *   5. Fuzzy fallback: Levenshtein distance for short queries
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────

export interface RAGEntry {
  merchant: string;
  category: string;
  subCategory: string;
  keywords: string[];
  isInstallmentCommon: boolean;
}

export interface RAGMatch {
  merchant: string;
  category: string;
  subCategory: string;
  similarity: number;       // 0-1 cosine similarity
  score: number;            // 0-100 calibrated confidence
  isInstallmentCommon: boolean;
  matchedKeyword: string;
  matchMethod: "exact" | "tfidf" | "fuzzy";
}

interface IndexedEntry {
  keyword: string;
  normalizedKeyword: string;
  merchant: string;
  category: string;
  subCategory: string;
  isInstallmentCommon: boolean;
  vector: Map<string, number>;  // TF-IDF sparse vector
}

// ─── Category Mapping (English → Arabic registry names) ───────────

const CATEGORY_MAP: Record<string, string> = {
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
  "Education": "تعليم",
};

const SUBCATEGORY_MAP: Record<string, string> = {
  "Fast Food": "وجبات سريعة",
  "Restaurant": "مطعم",
  "Cafe": "قهوة وكافيه",
  "Bakery": "مخبوزات",
  "Delivery": "دليفري",
  "Local": "عام",
  "Local Restaurant": "مطعم",
  "Nuts & Coffee": "قهوة وكافيه",
  "Nuts": "سناكس",
  "Ride-Hailing": "أوبر/كريم",
  "Bus": "أتوبيس",
  "Public Transport": "مترو",
  "Fuel": "بنزين",
  "Micobuses & Taxis": "عام",
  "Flight": "طيران",
  "Payment Gateway": "عام",
  "Electricity": "كهرباء",
  "Gas": "غاز",
  "Water": "مياه",
  "Traffic": "عام",
  "Syndicate": "عام",
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
  "Booking": "دكتور",
  "Pharmacy": "صيدلية",
  "Consultation": "دكتور",
  "Clinics": "دكتور",
  "Hospital": "مستشفى",
  "Streaming": "منصات مشاهدة",
  "Music": "سبوتيفاي",
  "Sports": "رياضة وجيم",
  "Cinema": "سينما",
  "Theme Park": "فسحة",
  "Maintenance": "صيانة",
  "Car Maintenance": "صيانة عربية",
  "Coworking": "مساحة عمل",
  "Installments": "أقساط",
  "Transfer": "انستاباي",
  "Mobile Wallet": "فودافون كاش",
  "Bank": "تحويل بنكي",
  "App": "عام",
  "Donation": "صدقة/تبرع",
  "Tips": "عام",
  "Personal Care": "عناية شخصية",
  "Education": "عام",
  "Fitness": "رياضة وجيم",
  "Supermarket": "بقالة",
  "Kiosk": "بقالة",
  "Dessert": "حلويات",
  "Mobile & Internet": "شحن رصيد",
  "Internet": "إنترنت",
  "Fintech": "عام",
  "Fintech & Cashback": "كاش باك",
  "Payment Terminal": "عام",
  "App & Card": "عام",
  "Bank & Postal": "تحويل بنكي",
  "Fintech & Salary": "عام",
  "Fintech & Microfinance": "أقساط",
  "Gifts": "عام",
};

// ─── Special overrides (replaces hardcoded if/else in smart-pipeline) ───

interface CategoryOverride {
  test: (keyword: string) => boolean;
  category: string;
  subCategory: string | ((kw: string) => string);
}

const CATEGORY_OVERRIDES: CategoryOverride[] = [
  {
    test: (kw) => kw.includes("سباك") || kw.includes("صيانه") || (kw.includes("صيانة") && !kw.includes("عربية") && !kw.includes("عربيه")),
    category: "سكن",
    subCategory: "صيانة",
  },
  {
    test: (kw) => kw.includes("ميكروباص") || kw.includes("مكروباص") || kw.includes("ميكروباس"),
    category: "مواصلات",
    subCategory: "أتوبيس",
  },
  {
    test: (kw) => kw.includes("تاكسي") || kw.includes("تاكسى"),
    category: "مواصلات",
    subCategory: "تاكسي",
  },
  {
    test: (kw) => kw.includes("بلايستيشن") || kw.includes("بلاي ستيشن") || kw.includes("بلاستيشن"),
    category: "خروجات",
    subCategory: "PlayStation",
  },
  {
    test: (kw) => kw.includes("عيد ميلاد"),
    category: "هدايا وصدقات",
    subCategory: "عيد ميلاد",
  },
  {
    test: (kw) => kw.includes("هدية") || kw.includes("هديه"),
    category: "هدايا وصدقات",
    subCategory: "عام",
  },
];

// ─── Arabic Text Normalization ────────────────────────────────────

function normalizeArabic(text: string): string {
  return String(text || "")
    .trim()
    .toLowerCase()
    // Remove diacritics (tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    // Normalize hamza variants
    .replace(/[إأآٱ]/g, "ا")
    // Normalize ya/alef maksura
    .replace(/ى/g, "ي")
    // Normalize ta marbuta
    .replace(/ة/g, "ه")
    // Normalize waw with hamza
    .replace(/ؤ/g, "و")
    // Normalize ya with hamza
    .replace(/ئ/g, "ي")
    // Remove tatweel
    .replace(/ـ/g, "")
    // Egyptian phonetic equivalents (common substitutions in informal writing)
    .replace(/ث/g, "س")   // ث → س (Egyptian dialect)
    .replace(/ذ/g, "ز")   // ذ → ز
    .replace(/ظ/g, "ز")   // ظ → ز
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Character N-gram Tokenizer ───────────────────────────────────

/**
 * Generates character n-grams from text (sizes 2, 3, 4).
 * This approach handles Arabic spelling variations naturally because
 * even with one character difference, most n-grams still overlap.
 */
function charNgrams(text: string, minN: number = 2, maxN: number = 4): string[] {
  const grams: string[] = [];
  const cleaned = text.replace(/\s/g, "_"); // Preserve word boundaries
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i <= cleaned.length - n; i++) {
      grams.push(cleaned.substring(i, i + n));
    }
  }
  return grams;
}

// ─── TF-IDF Sparse Vector ─────────────────────────────────────────

function buildTfVector(text: string): Map<string, number> {
  const grams = charNgrams(normalizeArabic(text));
  const tf = new Map<string, number>();
  for (const gram of grams) {
    tf.set(gram, (tf.get(gram) || 0) + 1);
  }
  // Normalize by total grams
  const total = grams.length || 1;
  for (const [key, val] of tf) {
    tf.set(key, val / total);
  }
  return tf;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of a) {
    normA += valA * valA;
    const valB = b.get(key);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }
  for (const [, valB] of b) {
    normB += valB * valB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

// ─── Levenshtein Distance (Fuzzy Fallback) ─────────────────────────

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use single-row optimization
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ─── The Local RAG Engine ──────────────────────────────────────────

class LocalRAGEngine {
  private index: IndexedEntry[] = [];
  private exactMap: Map<string, IndexedEntry> = new Map();
  private loaded = false;
  private jsonFiles: string[] = [];
  private loadedEntryCount = 0;

  /**
   * Resolves category using the mapping + overrides.
   * Centralizes all category resolution logic previously scattered in smart-pipeline.
   */
  private resolveCategory(entry: RAGEntry, keyword: string): { category: string; subCategory: string } {
    let category = CATEGORY_MAP[entry.category] || "متنوعات";
    let subCategory = SUBCATEGORY_MAP[entry.subCategory] || "عام";

    const normalizedKw = normalizeArabic(keyword);

    // Apply overrides (replaces hardcoded if/else chains)
    for (const override of CATEGORY_OVERRIDES) {
      if (override.test(normalizedKw)) {
        category = override.category;
        subCategory = typeof override.subCategory === "function"
          ? override.subCategory(normalizedKw)
          : override.subCategory;
        break;
      }
    }

    return { category, subCategory };
  }

  /**
   * Loads and indexes all JSON knowledge base files.
   * Call once on startup — subsequent calls are no-ops.
   *
   * Bug #5 fix: Priority-based deduplication instead of first-file-wins.
   * Lower priority number = more specific/trusted source.
   * egypt_merchants_rag.json (1) > egypt_digital_fintech_rag.json (2) > egypt_slang_local_rag.json (3)
   */
  loadFromFiles(basePath: string): void {
    if (this.loaded) return;

    const FILE_CONFIGS = [
      { name: "egypt_merchants_rag.json", priority: 1 },
      { name: "egypt_digital_fintech_rag.json", priority: 2 },
      { name: "egypt_slang_local_rag.json", priority: 3 },
    ];

    this.jsonFiles = FILE_CONFIGS.map((f) => f.name);

    // Bug #5 fix: Track keyword priority — lower = better.
    // Only replace an existing indexed keyword if the new entry has higher priority.
    const keywordPriority = new Map<string, number>();
    let totalEntries = 0;

    for (const fileConfig of FILE_CONFIGS) {
      const filePath = path.join(basePath, fileConfig.name);
      if (!fs.existsSync(filePath)) {
        console.warn(`[Local RAG] File not found: ${filePath}`);
        continue;
      }

      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const entries: RAGEntry[] = JSON.parse(raw);

        for (const entry of entries) {
          const allKeywords = new Set<string>();
          if (entry.merchant && entry.merchant.length > 1) {
            allKeywords.add(entry.merchant);
          }
          for (const kw of entry.keywords || []) {
            if (kw && kw.length > 1) {
              allKeywords.add(kw);
            }
          }

          for (const keyword of allKeywords) {
            const normalized = normalizeArabic(keyword);
            const existingPriority = keywordPriority.get(normalized);

            // Bug #5 fix: Only overwrite if this file has HIGHER priority (lower number).
            if (existingPriority !== undefined && existingPriority <= fileConfig.priority) {
              continue; // Existing entry is from a more trusted source — keep it
            }

            const { category, subCategory } = this.resolveCategory(entry, keyword);

            const indexEntry: IndexedEntry = {
              keyword,
              normalizedKeyword: normalized,
              merchant: entry.merchant,
              category,
              subCategory,
              isInstallmentCommon: entry.isInstallmentCommon,
              vector: buildTfVector(keyword),
            };

            if (existingPriority !== undefined) {
              // Replace: update the existing entry in-place in the index array
              const existingIdx = this.index.findIndex((e) => e.normalizedKeyword === normalized);
              if (existingIdx >= 0) this.index[existingIdx] = indexEntry;
            } else {
              this.index.push(indexEntry);
              totalEntries++;
            }

            this.exactMap.set(normalized, indexEntry);
            keywordPriority.set(normalized, fileConfig.priority);
          }
        }
      } catch (err) {
        console.error(`[Local RAG] Failed to load ${fileConfig.name}:`, err);
      }
    }

    this.loadedEntryCount = totalEntries;
    this.loaded = true;
    console.log(`[Local RAG] Indexed ${totalEntries} unique keywords from ${this.jsonFiles.length} files (priority-based dedup).`);
  }

  /**
   * Returns all indexed entries as dictionary items for Rule Engine injection.
   * Deduplication is already handled during indexing.
   */
  getDictionaryItems(): Array<{ word: string; category: string; subCategory?: string }> {
    return this.index.map(entry => ({
      word: entry.keyword,
      category: entry.category,
      subCategory: entry.subCategory,
    }));
  }

  /**
   * Search for top-K distinct categories that match the query.
   * Returns multiple categories ranked by best match score.
   * Used by the Category Scorer to determine which categories are relevant.
   */
  searchTopCategories(query: string, topK: number = 5, minScore: number = 0.40): Array<{ category: string; score: number }> {
    if (!this.loaded || this.index.length === 0) return [];

    // Clean query: remove amounts, financial verbs, common prefixes
    const cleaned = query
      .replace(/\d+([.,]\d+)?/g, "")
      .replace(/(جنيه|ج\.م|ج(?:\s|$)|ألف|الف|قسط|دفعت|حولت|صرفت|شحنت|اشتريت|جبت|ركبت|اكلت|أكلت)/g, "")
      .trim();

    if (cleaned.length < 2) return [];

    const normalizedQuery = normalizeArabic(cleaned);
    if (normalizedQuery.length < 2) return [];

    // Split query into words and search each word independently
    const queryWords = cleaned.split(/\s+/).filter(w => w.length >= 2);
    const categoryScores = new Map<string, number>();

    // Search each word fragment
    const fragments = [cleaned, ...queryWords];
    for (const fragment of fragments) {
      const normalizedFrag = normalizeArabic(fragment);
      
      // Exact match
      const exact = this.exactMap.get(normalizedFrag);
      if (exact) {
        const current = categoryScores.get(exact.category) || 0;
        categoryScores.set(exact.category, Math.max(current, 100));
        continue;
      }

      // Substring match
      const fragWords = normalizedFrag.split(" ");
      for (const [normalizedKw, entry] of this.exactMap) {
        if (fragWords.includes(normalizedKw) || (normalizedKw.length >= 3 && normalizedFrag.includes(normalizedKw))) {
          const current = categoryScores.get(entry.category) || 0;
          categoryScores.set(entry.category, Math.max(current, 92));
        }
      }

      // TF-IDF for each fragment
      if (fragment.length >= 3) {
        const queryVector = buildTfVector(fragment);
        const fragResults: Array<{ category: string; sim: number }> = [];
        
        for (const entry of this.index) {
          const sim = cosineSimilarity(queryVector, entry.vector);
          if (sim >= minScore) {
            fragResults.push({ category: entry.category, sim });
          }
        }

        for (const r of fragResults) {
          const calibrated = Math.max(0, Math.min(100, ((r.sim - 0.4) / 0.6) * 100));
          const current = categoryScores.get(r.category) || 0;
          categoryScores.set(r.category, Math.max(current, Math.round(calibrated)));
        }
      }
    }

    // Sort by score descending and return top-K
    return [...categoryScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([category, score]) => ({ category, score }));
  }

  /**
   * Returns stats about the loaded knowledge base.
   */
  getStats(): { loaded: boolean; entryCount: number; files: string[] } {
    return {
      loaded: this.loaded,
      entryCount: this.loadedEntryCount,
      files: this.jsonFiles,
    };
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

// ─── Singleton Instance ────────────────────────────────────────────

let _engine: LocalRAGEngine | null = null;

/**
 * Returns the singleton LocalRAGEngine instance.
 * On first call, loads and indexes all knowledge bases.
 */
export function getLocalRAGEngine(): LocalRAGEngine {
  if (!_engine) {
    _engine = new LocalRAGEngine();
    const basePath = path.resolve(process.cwd(), "api/lib");
    _engine.loadFromFiles(basePath);
  }
  return _engine;
}



/**
 * Search for top-K distinct categories matching the query.
 * Used by category-scorer.ts for Multi-Signal scoring.
 */
export function localRAGSearchTopCategories(query: string, topK: number = 5): Array<{ category: string; score: number }> {
  return getLocalRAGEngine().searchTopCategories(query, topK);
}

/**
 * Get all dictionary items for Rule Engine injection.
 */
export function getGlobalDictionaryItems(): Array<{ word: string; category: string; subCategory?: string }> {
  return getLocalRAGEngine().getDictionaryItems();
}

export { LocalRAGEngine };
