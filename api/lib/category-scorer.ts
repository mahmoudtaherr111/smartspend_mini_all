/**
 * SmartSpend — Smart Category Scorer V3
 * ═══════════════════════════════════════
 * Multi-Signal scoring engine that determines which categories are relevant
 * to the user's input text. Replaces the old "send everything" approach.
 *
 * Architecture:
 *   Signal 1: Keyword Priors     (weight: 40) — Regex keyword matching
 *   Signal 2: Local RAG TF-IDF   (weight: 35) — n-gram similarity search
 *   Signal 3: User History Prior  (weight: 20) — Personalized category frequency
 *   Signal 4: Co-occurrence       (weight: 15) — Related category expansion
 *   Signal 5: Intent Injection    (mandatory 25)  — Income/Transfer/Investment routing
 *   Signal 6: Person Detection    (mandatory 10-20)  — Family/Friends/Employees injection
 *
 * Total scoring budget: 155 points max per category.
 * Threshold: Categories scoring >= 15 are included.
 * Safety: Always ≥ 5 categories, ≤ 10, always includes "متنوعات".
 */

import { CATEGORIES, type MainCategory } from "./category-registry";
import { keywordCategoryPriors } from "./keyword-category-priors";
import { localRAGSearchTopCategories } from "./local-rag-engine";

// ─── Types ────────────────────────────────────────────────────────

export type TransactionIntent = "expense" | "income" | "transfer" | "investment" | "unknown";

export interface CategoryScore {
  category: string;  // Arabic name (e.g., "أكل وشرب")
  score: number;     // 0-100 aggregated score
  signals: string[]; // Which signals contributed
}

export interface ScorerResult {
  filteredCategories: MainCategory[];
  scores: CategoryScore[];
  totalCategories: number;  // How many categories were included
  allCategories: number;    // Total categories available
  intent: TransactionIntent;
}

// ─── Constants ────────────────────────────────────────────────────

const INCLUSION_THRESHOLD = 15;
const MIN_CATEGORIES = 5;
const MAX_CATEGORIES = 10;
const MAX_CATEGORIES_BULK = 15;  // For multi-amount text

// ─── Signal 4: Co-occurrence Map ──────────────────────────────────

const CO_OCCURRENCE: Record<string, string[]> = {
  "أكل وشرب":       ["ترفيه", "خروجات"],
  "مواصلات":         ["خدمات سيارات"],
  "فواتير":          ["التزامات يومية"],
  "ترفيه":           ["أكل وشرب", "خروجات"],
  "خروجات":          ["أكل وشرب", "ترفيه"],
  "تسوق":            ["سكن"],
  "سكن":             ["تسوق"],
  "العائلة":         ["أصدقاء", "موظفين", "تحويل"],
  "أصدقاء":          ["العائلة", "موظفين", "تحويل"],
  "موظفين":          ["العائلة", "أصدقاء"],
  "تحويل":           ["العائلة", "أصدقاء"],
  "خدمات سيارات":    ["مواصلات"],
  "صحة":             ["تسوق"],
  "تعليم":           ["اشتراكات"],
  "اشتراكات":        ["خدمات رقمية"],
  "خدمات رقمية":     ["اشتراكات", "عمل"],
  "هدايا وصدقات":    ["العائلة", "أصدقاء"],
  "استثمار":         ["عوائد استثمار", "تحويل"],
  "عوائد استثمار":   ["استثمار"],
  "مرتب":            ["عمل حر"],
  "عمل حر":          ["مرتب"],
  "التزامات وجمعيات": ["فواتير", "تحويل"],
};

// ─── Signal 5: Intent → Category Injection ────────────────────────

const INTENT_CATEGORIES: Record<TransactionIntent, string[]> = {
  income:     ["مرتب", "عمل حر", "عوائد استثمار"],
  transfer:   ["تحويل", "العائلة", "أصدقاء", "موظفين"],
  investment: ["استثمار", "عوائد استثمار"],
  expense:    [],  // Other signals handle this
  unknown:    [],
};

// ─── Signal 5: Intent Detection (rewritten) ───────────────────────

const INCOME_PATTERNS = /(?:مرتب|راتب|قبضت|القبض|استلمت|جالي|وصلني|بونص|مكاف|أوفرتايم|بدل|عموله|سبوبه|فريلانس|كاش\s*باك|استرجاع|أرباح|فوائد|عائد)/i;
const TRANSFER_PATTERNS = /(?:حولت|تحويل|انستاباي|instapay|فودافون\s*كاش|محفظ|سحب|ايداع|سلفت|سلفه|سلف|دين|قرض|سداد|جمعي)/i;
const INVESTMENT_PATTERNS = /(?:ذهب|دهب|سبيك|بورص|أسهم|اسهم|شهاد|وديع|استثمار|كريبتو|عملات\s*رقمي|بيتكوين|ثاندر)/i;

export function detectTransactionIntent(text: string): TransactionIntent {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (INCOME_PATTERNS.test(normalized)) return "income";
  if (TRANSFER_PATTERNS.test(normalized)) return "transfer";
  if (INVESTMENT_PATTERNS.test(normalized)) return "investment";
  return "expense";  // Default to expense (most common case)
}

// ─── Signal 6: Person Detection ───────────────────────────────────

const PERSON_PATTERNS = /(?:^|\s)(?:اخو|أخو|أختي|اختي|ابو|أبو|أم\s|ام\s|خال|عم\s|عمت|خالت|ابن|ابنت|جدو|جدت|بابا|ماما|صاحب|صحاب|صحب|زميل|مديري|موظف|شغال|بواب|حارس|سواق|عامل|اديت\s|عطيت\s|سلفت\s|حولت\s|ل(?:ـ)?\s*[\u0600-\u06FF]{2,})/i;

function hasPersonMention(text: string): boolean {
  return PERSON_PATTERNS.test(text);
}

// ─── Scoring Engine ───────────────────────────────────────────────

function addScore(scores: Map<string, { score: number; signals: string[] }>, category: string, points: number, signal: string): void {
  const existing = scores.get(category) || { score: 0, signals: [] };
  existing.score += points;
  if (!existing.signals.includes(signal)) {
    existing.signals.push(signal);
  }
  scores.set(category, existing);
}

/**
 * Score all categories based on multiple signals.
 * Returns scored and filtered categories ready for the prompt.
 */
export function scoreCategories(
  text: string,
  userHistoryCategories?: Array<{ category: string; count: number }>,
  numAmounts: number = 1
): ScorerResult {
  const scores = new Map<string, { score: number; signals: string[] }>();
  const allCategoryNames = CATEGORIES.map(c => c.name_ar);

  // ── Signal 1: Keyword Priors (weight: 40) ──
  const kpCategories = keywordCategoryPriors(text);
  if (kpCategories) {
    for (const cat of kpCategories) {
      addScore(scores, cat, 40, "keyword");
    }
  }

  // ── Signal 2: Local RAG TF-IDF (weight: 35) ──
  try {
    const ragMatches = localRAGSearchTopCategories(text, 5);
    for (const m of ragMatches) {
      // Scale the RAG score (0-100) to weight (0-35)
      const scaledScore = Math.round(35 * m.score / 100);
      if (scaledScore > 0) {
        addScore(scores, m.category, scaledScore, "rag");
      }
    }
  } catch (e) {
    // Local RAG may not be loaded in test environments
    console.warn("[CategoryScorer] Local RAG unavailable:", (e as any)?.message);
  }

  // ── Signal 3: User History Prior (weight: 20) ──
  if (userHistoryCategories && userHistoryCategories.length > 0) {
    const totalTx = userHistoryCategories.reduce((sum, c) => sum + c.count, 0);
    for (const { category, count } of userHistoryCategories) {
      const freq = count / totalTx;  // 0.0 - 1.0
      const scaledScore = Math.round(20 * freq);
      if (scaledScore > 0) {
        addScore(scores, category, scaledScore, "history");
      }
    }
  }

  // ── Signal 4: Co-occurrence Expansion (weight: 15) ──
  const confirmedCategories = [...scores.entries()]
    .filter(([_, v]) => v.score >= 30)
    .map(([cat]) => cat);

  for (const confirmedCat of confirmedCategories) {
    const related = CO_OCCURRENCE[confirmedCat];
    if (related) {
      for (const relatedCat of related) {
        if (!confirmedCategories.includes(relatedCat)) {
          addScore(scores, relatedCat, 15, "co-occur");
        }
      }
    }
  }

  // ── Signal 5: Intent-based Injection (mandatory) ──
  const intent = detectTransactionIntent(text);
  const intentCats = INTENT_CATEGORIES[intent];
  for (const cat of intentCats) {
    addScore(scores, cat, 25, "intent");
  }

  // ── Signal 6: Person Detection (mandatory) ──
  if (hasPersonMention(text)) {
    addScore(scores, "العائلة", 20, "person");
    addScore(scores, "أصدقاء", 20, "person");
    addScore(scores, "موظفين", 15, "person");
    addScore(scores, "متنوعات", 10, "person");
  }

  // ── Always include "متنوعات" as safety net ──
  addScore(scores, "متنوعات", 5, "safety");

  // ── Build final ranked list ──
  const maxCats = numAmounts > 3 ? MAX_CATEGORIES_BULK : MAX_CATEGORIES;

  let rankedCategories = [...scores.entries()]
    .map(([category, data]) => ({ category, score: data.score, signals: data.signals }))
    .sort((a, b) => b.score - a.score);

  // Filter by threshold
  let included = rankedCategories.filter(c => c.score >= INCLUSION_THRESHOLD);

  // ── Safety: Ambiguity Fallback ──
  if (included.length === 0 || (included.length > 0 && included[0].score < 15)) {
    const hasRealSignal = rankedCategories.some((category) =>
      category.signals.some((signal) => signal !== "safety"),
    );

    if (!hasRealSignal) {
      return {
        filteredCategories: CATEGORIES,
        scores: rankedCategories,
        totalCategories: CATEGORIES.length,
        allCategories: CATEGORIES.length,
        intent,
      };
    }

    const fallbackCategoryNames = new Set<string>();
    
    // 1. Take top 5 ranked
    const topRanked = rankedCategories.slice(0, 5).map(c => c.category);
    topRanked.forEach(name => fallbackCategoryNames.add(name));
    
    // 2. Add intent categories
    const intentCats = INTENT_CATEGORIES[intent] || [];
    intentCats.forEach(name => fallbackCategoryNames.add(name));
    
    // 3. Always include "متنوعات"
    fallbackCategoryNames.add("متنوعات");
    
    const filteredCategories = CATEGORIES.filter(c => fallbackCategoryNames.has(c.name_ar));
    
    return {
      filteredCategories,
      scores: rankedCategories,
      totalCategories: filteredCategories.length,
      allCategories: CATEGORIES.length,
      intent,
    };
  }

  // ── Safety: Minimum 5 categories ──
  if (included.length < MIN_CATEGORIES) {
    const remaining = rankedCategories.filter(c => c.score < INCLUSION_THRESHOLD);
    while (included.length < MIN_CATEGORIES && remaining.length > 0) {
      included.push(remaining.shift()!);
    }
    if (included.length < MIN_CATEGORIES) {
      const includedNames = new Set(included.map(c => c.category));
      for (const cat of allCategoryNames) {
        if (!includedNames.has(cat) && included.length < MIN_CATEGORIES) {
          included.push({ category: cat, score: 0, signals: ["min-fill"] });
        }
      }
    }
  }

  if (included.length > maxCats) {
    included = included.slice(0, maxCats);
  }

  if (!included.some(c => c.category === "متنوعات")) {
    included.push({ category: "متنوعات", score: 5, signals: ["safety"] });
  }

  const includedNames = new Set(included.map(c => c.category));
  const filteredCategories = CATEGORIES.filter(c => includedNames.has(c.name_ar));

  return {
    filteredCategories,
    scores: rankedCategories, // Keep all scores in result for observability
    totalCategories: filteredCategories.length,
    allCategories: CATEGORIES.length,
    intent,
  };
}

/**
 * Build a compressed taxonomy string containing ONLY the filtered categories.
 * This is what gets injected into the AI prompt.
 */
export function buildFilteredTaxonomy(filteredCategories: MainCategory[]): string {
  return filteredCategories.map((c) => {
    let subcats = c.subcategories.map((s) => s.name_ar).join(",");
    if (["العائلة", "أصدقاء", "موظفين"].includes(c.name_ar)) {
      subcats = "اسم_الشخص";
    }
    return `${c.name_ar}:${subcats}`;
  }).join("|");
}
