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

import { createHash } from "node:crypto";
import { db } from "../queries/connection";
import { classificationLogs, expenses } from "../../db/schema";
import { eq, and, gte, desc, inArray } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import { cacheGet, cacheIncr } from "./redis-client";
import damerauPkg from "damerau-levenshtein";
import { arabicToEnglishNumbers } from "./text-normalizer";
import { parseArabicNumbers } from "./arabic-number-parser";
import { resolveLegacyTaxonomy } from "../../contracts/categories";
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

// ─── Per-user patterns, versioned across processes ───
//
// The patterns are held in this process, but whether they are current is decided by a
// generation counter in Redis (`memgen:<type>:<id>`), bumped by every write that can change
// them. A process that did not see the write still sees the new generation on its next
// lookup and reloads, instead of replaying what the user has since saved differently for
// up to half an hour. Without Redis the counter is per process and the TTL is the bound.

interface LoadedMemory {
  patterns: MemoryPattern[];
  /** Hash of the patterns: part of the classification cache key, so a result can never
   * outlive the memory it was computed from. */
  fingerprint: string;
  generation: string;
}

const userMemoryCache = new LRUCache<string, LoadedMemory>({
  max: 500,
  ttl: 30 * 60 * 1000,
});

function userKey(userId: number, userType: string): string {
  return `${userId}:${userType}`;
}

function generationKey(userId: number, userType: string): string {
  return `memgen:${userType}:${userId}`;
}

/**
 * Marks the user's patterns stale here and in every other process. Called by every write
 * that can change what the memory learns: a save, an edit, a delete, a correction.
 */
export function invalidateUserMemory(userId: number, userType: string): void {
  userMemoryCache.delete(userKey(userId, userType));
  void cacheIncr(generationKey(userId, userType)).catch(() => undefined);
}

function fingerprintOf(patterns: MemoryPattern[]): string {
  const stable = patterns
    .map((p) => `${p.template}|${p.category}|${p.subCategory}|${p.type}|${p.usageCount}|${p.confidence}`)
    .sort()
    .join("\n");
  return createHash("sha1").update(stable).digest("hex").slice(0, 16);
}

async function currentGeneration(userId: number, userType: string): Promise<string> {
  try {
    return (await cacheGet(generationKey(userId, userType))) ?? "0";
  } catch {
    return "0";
  }
}

/** The user's patterns, reloaded when another process or request changed them. */
async function loadedMemory(userId: number, userType: string): Promise<LoadedMemory> {
  const key = userKey(userId, userType);
  const generation = await currentGeneration(userId, userType);
  const held = userMemoryCache.get(key);
  if (held && held.generation === generation) return held;
  const patterns = await loadUserPatterns(userId, userType);
  const loaded = { patterns, fingerprint: fingerprintOf(patterns), generation };
  userMemoryCache.set(key, loaded);
  return loaded;
}

/** Hash of what the memory would answer from right now (for the classification cache key). */
export async function userMemoryFingerprint(userId: number, userType: string): Promise<string> {
  return (await loadedMemory(userId, userType)).fingerprint;
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

    // A parse is not a decision. Only what the user kept teaches: the log must have become
    // exactly one saved row with the same category and type. A sentence parsed and then
    // abandoned, undone, or saved differently used to count as a confirmed answer, and a
    // wrong answer served twice (a repeat, or a cache hit) became a trusted pattern.
    const logIds = logs.map((log) => log.id);
    const savedRows = logIds.length
      ? await db
          .select({
            classificationLogId: expenses.classificationLogId,
            category: expenses.category,
            subCategory: expenses.subCategory,
            type: expenses.type,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.userId, userId),
              eq(expenses.userType, userType),
              inArray(expenses.classificationLogId, logIds),
            ),
          )
      : [];
    const savedByLog = new Map<number, typeof savedRows>();
    for (const row of savedRows) {
      if (row.classificationLogId == null) continue;
      const list = savedByLog.get(row.classificationLogId) ?? [];
      list.push(row);
      savedByLog.set(row.classificationLogId, list);
    }

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

      // A log written before the current taxonomy names its old place. The pair is moved
      // to where it lives now; a money movement that was booked as spending or income is
      // not learned from, since its direction comes from the verb, which only the full
      // pipeline reads (docs/decisions/0008-money-movements-and-taxonomy.md).
      const logged = finalResult[0];
      const legacy = resolveLegacyTaxonomy(logged?.category, logged?.subCategory, logged?.type);
      if (legacy?.type) continue;
      // A pattern replays category and type only. An answer that also carried which way
      // the money moved (a refund, a loan repaid) would come back without it.
      if ((logged as { direction?: string } | undefined)?.direction) continue;
      const first = legacy
        ? { ...logged, category: legacy.category, subCategory: legacy.subCategory }
        : logged;
      const confidence = log.confidence || 0;
      const type = first.type;

      if (confidence < 85) continue;
      if (log.wasCorrected) continue;
      if (log.decision !== "auto_save") continue;
      if (log.parsedBy !== "ai" && log.parsedBy !== "rule_engine" && log.parsedBy !== "hybrid") continue;
      if (!first.category || !["income", "expense", "transfer", "investment"].includes(type)) continue;
      const saved = savedByLog.get(log.id) ?? [];
      if (
        saved.length !== 1 ||
        saved[0].category !== first.category ||
        (saved[0].subCategory || "عام") !== (first.subCategory || "عام") ||
        saved[0].type !== type
      ) continue;

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
  const { patterns } = await loadedMemory(userId, userType);

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
