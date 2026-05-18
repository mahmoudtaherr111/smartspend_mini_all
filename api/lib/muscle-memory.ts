/**
 * SmartSpend Muscle Memory Cache
 * ──────────────────────────────
 * Learns from user's classification history to instantly classify
 * recurring transactions with 0 tokens and 100% confidence.
 *
 * How it works:
 * 1. When a user confirms a classification, we extract a "template"
 *    by replacing numbers with {X} placeholder.
 * 2. Next time a similar text comes in, we match it against templates.
 * 3. If match found → instant classification (no AI needed).
 */

import { db } from "../queries/connection";
import { classificationLogs, userDictionaries } from "../../db/schema";
import { eq, and, gte, desc } from "drizzle-orm";

// ─── Types ───

export interface MemoryPattern {
  template: string;        // e.g. "دفعت {X} للمدرس"
  category: string;
  subCategory: string;
  type: "income" | "expense";
  confidence: number;
  usageCount: number;
  lastUsed: Date;
}

export interface MemoryMatch {
  pattern: MemoryPattern;
  amount: number;
  matchScore: number;      // 0-100, how well it matched
}

// ─── LRU Per-User Cache ───

class UserMemoryCache {
  private cache = new Map<string, MemoryPattern[]>(); // key = "userId:userType"
  private loadedAt = new Map<string, number>();
  private maxPatternsPerUser = 200;
  private ttlMs = 30 * 60 * 1000; // 30 minutes before re-fetching

  private userKey(userId: number, userType: string): string {
    return `${userId}:${userType}`;
  }

  isStale(userId: number, userType: string): boolean {
    const key = this.userKey(userId, userType);
    const loaded = this.loadedAt.get(key);
    if (!loaded) return true;
    return Date.now() - loaded > this.ttlMs;
  }

  get(userId: number, userType: string): MemoryPattern[] | undefined {
    const key = this.userKey(userId, userType);
    if (this.isStale(userId, userType)) return undefined;
    return this.cache.get(key);
  }

  set(userId: number, userType: string, patterns: MemoryPattern[]): void {
    const key = this.userKey(userId, userType);
    // Keep only top N patterns by usage count
    const sorted = patterns
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, this.maxPatternsPerUser);
    this.cache.set(key, sorted);
    this.loadedAt.set(key, Date.now());

    // Evict old users if cache grows too large (>500 users)
    if (this.cache.size > 500) {
      const oldest = [...this.loadedAt.entries()]
        .sort((a, b) => a[1] - b[1])
        .slice(0, 100);
      for (const [k] of oldest) {
        this.cache.delete(k);
        this.loadedAt.delete(k);
      }
    }
  }

  invalidate(userId: number, userType: string): void {
    const key = this.userKey(userId, userType);
    this.cache.delete(key);
    this.loadedAt.delete(key);
  }
}

const memoryCache = new UserMemoryCache();

// ─── Template Extraction ───

/**
 * Convert a transaction text into a template by replacing numbers with {X}.
 * "دفعت 200 للمدرس" → "دفعت {X} للمدرس"
 * "اكلت بيتزا بـ 100 جنيه" → "اكلت بيتزا بـ {X} جنيه"
 */
export function textToTemplate(text: string): string {
  return text
    .replace(/\d+(\.\d+)?/g, "{X}")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the amount from text that matches a template.
 * Returns the first number found.
 */
function extractAmountFromText(text: string): number {
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Calculate similarity between two templates.
 * Returns a score from 0-100.
 */
function templateSimilarity(a: string, b: string): number {
  if (a === b) return 100;

  // Normalize both
  const na = a.replace(/\{X\}/g, "").replace(/\s+/g, " ").trim();
  const nb = b.replace(/\{X\}/g, "").replace(/\s+/g, " ").trim();

  if (na === nb) return 98;

  // Word-level Jaccard similarity
  const wordsA = new Set(na.split(" ").filter(w => w.length >= 2));
  const wordsB = new Set(nb.split(" ").filter(w => w.length >= 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  const jaccard = intersection / union;

  // Check word order similarity (important for Arabic context)
  const arrA = [...wordsA];
  const arrB = [...wordsB];
  let orderScore = 0;
  for (let i = 0; i < Math.min(arrA.length, arrB.length); i++) {
    if (arrA[i] === arrB[i]) orderScore++;
  }
  const orderRatio = arrA.length > 0 ? orderScore / Math.max(arrA.length, arrB.length) : 0;

  // Combined score: 70% content + 30% order
  return Math.round((jaccard * 70 + orderRatio * 30));
}

// ─── Pattern Loading ───

/**
 * Load classification patterns for a user from the database.
 * Only loads patterns with high confidence that weren't corrected.
 */
async function loadUserPatterns(
  userId: number,
  userType: string
): Promise<MemoryPattern[]> {
  try {
    // Get successful classifications from the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const logs = await db
      .select()
      .from(classificationLogs)
      .where(
        and(
          eq(classificationLogs.userId, userId),
          eq(classificationLogs.userType, userType),
          gte(classificationLogs.createdAt, ninetyDaysAgo)
        )
      )
      .orderBy(desc(classificationLogs.createdAt))
      .limit(500);

    // Group by template and count occurrences
    const templateMap = new Map<
      string,
      {
        category: string;
        subCategory: string;
        type: string;
        confidence: number;
        count: number;
        lastUsed: Date;
        wasCorrected: boolean;
      }
    >();

    for (const log of logs) {
      const text = log.originalText || "";
      const template = textToTemplate(text);
      if (template.length < 3) continue;

      // Parse final result
      const finalResult = log.finalResult as any;
      if (!finalResult || !Array.isArray(finalResult) || finalResult.length === 0)
        continue;

      const first = finalResult[0];
      const confidence = log.confidence || 0;

      // Skip low-confidence or corrected entries
      if (confidence < 80) continue;
      if (log.wasCorrected) continue;

      const existing = templateMap.get(template);
      if (existing) {
        existing.count++;
        existing.confidence = Math.max(existing.confidence, confidence);
        if (log.createdAt && log.createdAt > existing.lastUsed) {
          existing.lastUsed = log.createdAt;
        }
      } else {
        templateMap.set(template, {
          category: first.category || "متنوعات",
          subCategory: first.subCategory || "عام",
          type: first.type || "expense",
          confidence,
          count: 1,
          lastUsed: log.createdAt || new Date(),
          wasCorrected: log.wasCorrected || false,
        });
      }
    }

    // Convert to MemoryPattern array (only patterns used 2+ times)
    const patterns: MemoryPattern[] = [];
    for (const [template, data] of templateMap) {
      if (data.count >= 2) {
        patterns.push({
          template,
          category: data.category,
          subCategory: data.subCategory,
          type: data.type as "income" | "expense",
          confidence: Math.min(100, data.confidence + (data.count * 2)), // Boost by repeat usage
          usageCount: data.count,
          lastUsed: data.lastUsed,
        });
      }
    }

    return patterns;
  } catch (err) {
    console.warn("Failed to load muscle memory patterns:", err);
    return [];
  }
}

// ─── Public API ───

/**
 * Try to match user input against muscle memory patterns.
 * Returns a match if found with high confidence.
 */
export async function muscleMemoryLookup(
  text: string,
  userId: number,
  userType: string
): Promise<MemoryMatch | null> {
  // 1. Get or load patterns
  let patterns = memoryCache.get(userId, userType);
  if (!patterns) {
    patterns = await loadUserPatterns(userId, userType);
    memoryCache.set(userId, userType, patterns);
  }

  if (patterns.length === 0) return null;

  // 2. Convert input to template
  const inputTemplate = textToTemplate(text);
  if (inputTemplate.length < 3) return null;

  // 3. Find best match
  let bestMatch: MemoryMatch | null = null;
  let bestScore = 0;

  for (const pattern of patterns) {
    const score = templateSimilarity(inputTemplate, pattern.template);

    if (score > bestScore && score >= 85) {
      bestScore = score;
      bestMatch = {
        pattern,
        amount: extractAmountFromText(text),
        matchScore: score,
      };
    }
  }

  return bestMatch;
}

/**
 * Record a successful classification for future muscle memory.
 * Called after user confirms/saves a transaction.
 */
export function invalidateUserMemory(
  userId: number,
  userType: string
): void {
  memoryCache.invalidate(userId, userType);
}
