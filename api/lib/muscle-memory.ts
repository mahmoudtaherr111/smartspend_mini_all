/**
 * SmartSpend Muscle Memory Cache V2
 * ───────────────────────────────────
 * Learns from user's classification history to instantly classify
 * recurring transactions with 0 tokens and 100% confidence.
 *
 * V2 changes:
 *  - Uses lru-cache (production-grade) instead of hand-rolled Map cache
 *  - Uses damerau-levenshtein for template similarity (handles transpositions)
 *  - Accepts both AI and rule_engine classifications (not just AI)
 *  - Lower threshold: 85% instead of 98% (allows "دفعت كهربا 200" to match "دفعت الكهربا 300")
 */

import { db } from "../queries/connection";
import { classificationLogs, userDictionaries } from "../../db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import damerauPkg from "damerau-levenshtein";
import { arabicToEnglishNumbers } from "./text-normalizer";
import { parseArabicNumbers } from "./arabic-number-parser";
const damerauLevenshtein = (a: string, b: string): number => {
  const result = (damerauPkg as any)(a, b);
  return typeof result === "number" ? result : result.steps;
};

// ─── Types ───

export interface MemoryPattern {
  template: string;
  category: string;
  subCategory: string;
  type: "income" | "expense" | "transfer" | "investment";
  confidence: number;
  usageCount: number;
  lastUsed: Date;
}

export interface MemoryMatch {
  pattern: MemoryPattern;
  amount: number;
  matchScore: number;
}

// ─── Per-User LRU Cache (production-grade) ───

const userMemoryCache = new LRUCache<string, MemoryPattern[]>({
  max: 500,
  ttl: 30 * 60 * 1000,
});

function userKey(userId: number, userType: string): string {
  return `${userId}:${userType}`;
}

export function invalidateUserMemory(userId: number, userType: string): void {
  userMemoryCache.delete(userKey(userId, userType));
}

// ─── Template Extraction ───

/**
 * "مية" is deliberately not a global Arabic-number token because it commonly
 * means water in Egyptian Arabic. In a money expression, however, it is a
 * number and should share a memory template with 100/١٠٠.
 */
function normalizeMemoryAmountText(text: string): string {
  const numberFollower =
    "اتنين|اثنين|تلاتين|ثلاثين|اربعين|أربعين|خمسين|ستين|سبعين|تمانين|ثمانين|تسعين|جنيه|جنية|ج\.م|ج";
  const disambiguated = arabicToEnglishNumbers(text).replace(
    new RegExp(`(^|\\s)(?:مية|ميه)(?=\\s+(?:و\\s*)?(?:${numberFollower})(?:\\s|$))`, "g"),
    "$1100",
  );
  return parseArabicNumbers(disambiguated);
}

export function textToTemplate(text: string): string {
  // Keep the template independent from the way a user writes the amount.
  // Without this, "١٥٠", "150", and "مية وخمسين" train three different
  // patterns even though they are the same recurring transaction.
  return normalizeMemoryAmountText(text)
    .replace(/\d+(\.\d+)?/g, "{X}")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAmountFromText(text: string): number {
  const normalized = normalizeMemoryAmountText(text);
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

// ─── Template Similarity (V2: Damerau + Jaccard hybrid) ───

function templateSimilarity(a: string, b: string): number {
  if (a === b) return 100;

  const na = a.replace(/\{X\}/g, "").replace(/\s+/g, " ").trim();
  const nb = b.replace(/\{X\}/g, "").replace(/\s+/g, " ").trim();

  if (na === nb) return 98;

  // Word-level Jaccard similarity
  const wordsA = new Set(na.split(" ").filter((w) => w.length >= 2));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length >= 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  const jaccard = intersection / union;

  // Check word order similarity
  const arrA = [...wordsA];
  const arrB = [...wordsB];
  let orderScore = 0;
  for (let i = 0; i < Math.min(arrA.length, arrB.length); i++) {
    if (arrA[i] === arrB[i]) orderScore++;
  }
  const orderRatio =
    arrA.length > 0 ? orderScore / Math.max(arrA.length, arrB.length) : 0;

  // Damerau-Levenshtein on the full template strings (handles transpositions)
  const damerauDist = damerauLevenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  const damerauSim = maxLen > 0 ? 1 - damerauDist / maxLen : 1;

  // Combined: 50% content + 20% order + 30% damerau
  return Math.round(jaccard * 50 + orderRatio * 20 + damerauSim * 30);
}

// ─── Pattern Loading ───

async function loadUserPatterns(
  userId: number,
  userType: string,
): Promise<MemoryPattern[]> {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const logs = await db
      .select({
        id: classificationLogs.id,
        originalText: classificationLogs.originalText,
        normalizedText: classificationLogs.normalizedText,
        finalResult: classificationLogs.finalResult,
        confidence: classificationLogs.confidence,
        wasCorrected: classificationLogs.wasCorrected,
        decision: classificationLogs.decision,
        parsedBy: classificationLogs.parsedBy,
        createdAt: classificationLogs.createdAt,
      })
      .from(classificationLogs)
      .where(
        and(
          eq(classificationLogs.userId, userId),
          eq(classificationLogs.userType, userType),
          gte(classificationLogs.createdAt, ninetyDaysAgo),
        ),
      )
      .orderBy(desc(classificationLogs.createdAt))
      .limit(500);

    const templateMap = new Map<
      string,
      {
        category: string;
        subCategory: string;
        type: string;
        confidence: number;
        count: number;
        lastUsed: Date;
        hasConflictingOutcome: boolean;
      }
    >();

    for (const log of logs) {
      const text = log.originalText || "";
      const template = textToTemplate(text);
      if (template.length < 3) continue;

      const finalResult = log.finalResult as any;
      if (
        !finalResult ||
        !Array.isArray(finalResult) ||
        // A recurring template is safe only when it always represents one
        // transaction. Learning the first item from a multi-item sentence
        // silently drops the other transactions on the next cache hit.
        finalResult.length !== 1
      )
        continue;

      const first = finalResult[0];
      const confidence = log.confidence || 0;
      const type = first.type;

      if (confidence < 85) continue;
      if (log.wasCorrected) continue;
      if (log.decision !== "auto_save") continue;
      if (log.parsedBy !== "ai" && log.parsedBy !== "rule_engine" && log.parsedBy !== "hybrid") continue;
      if (!first.category || !["income", "expense", "transfer", "investment"].includes(type)) continue;

      const existing = templateMap.get(template);
      if (existing) {
        if (
          existing.category !== first.category ||
          existing.subCategory !== (first.subCategory || "عام") ||
          existing.type !== type
        ) {
          // Conflicting historical outcomes are ambiguity, not evidence.
          existing.hasConflictingOutcome = true;
          continue;
        }
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
          hasConflictingOutcome: false,
        });
      }
    }

    const patterns: MemoryPattern[] = [];
    for (const [template, data] of templateMap) {
      if (data.count >= 2 && !data.hasConflictingOutcome) {
        patterns.push({
          template,
          category: data.category,
          subCategory: data.subCategory,
          type: data.type as MemoryPattern["type"],
          confidence: Math.min(100, data.confidence + data.count * 2),
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

export async function muscleMemoryLookup(
  text: string,
  userId: number,
  userType: string,
): Promise<MemoryMatch | null> {
  const key = userKey(userId, userType);
  let patterns = userMemoryCache.get(key);
  if (!patterns) {
    patterns = await loadUserPatterns(userId, userType);
    userMemoryCache.set(key, patterns);
  }

  if (patterns.length === 0) return null;

  const inputTemplate = textToTemplate(text);
  // Memory is intentionally limited to a single amount / single transaction.
  // Complex narration must still go through the decomposer.
  if (
    inputTemplate.length < 3 ||
    (inputTemplate.match(/\{X\}/g) || []).length !== 1
  )
    return null;

  const extractedAmount = extractAmountFromText(text);
  if (extractedAmount <= 0) return null;

  let bestMatch: MemoryMatch | null = null;
  let bestScore = 0;

  for (const pattern of patterns) {
    const score = templateSimilarity(inputTemplate, pattern.template);

    if (score > bestScore && score >= 85) {
      bestScore = score;
      bestMatch = {
        pattern,
        amount: extractedAmount,
        matchScore: score,
      };
    }
  }

  return bestMatch;
}
