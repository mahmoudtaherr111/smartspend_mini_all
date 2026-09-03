import { SchemaType } from "@google/generative-ai";
import { normalizeV2 } from "./normalizer-v2";
import { runRuleEngine, SUB_CATEGORY_MAP } from "./rule-engine";
import { CATEGORY_DICTIONARY } from "./egyptian-dictionary";
import { buildSmartSystemPrompt, buildFireworksPrompts } from "./dynamic-prompt-builder";
import { normalizeTransactionTaxonomyList } from "./category-registry";
import { CATEGORIES } from "./category-registry";
import {
  executeLlmChain,
  LlmChainError,
  type LlmAttempt,
  type LlmRoute,
  type StructuredSchema,
} from "./llm-router";
import { buildProviderChain } from "./llm-provider-chain";
import {
  buildAnchors,
  describeUnconsumed,
  reconcileAmounts,
  toCents,
} from "./amount-ledger";
import {
  applyCorrectionRules,
  loadCorrectionRules,
  noteRuleApplied,
  type CorrectionRule,
} from "./correction-rules";
import type { AiPlanName } from "./ai-provider-registry";
import { mapModelName } from "./model-mapper";
import type { ParsedTransaction } from "./rule-engine";
import { matchArabicPhrase, stripArabicPrefix } from "./fuzzy-match";
import { extractPeople, extractAmounts } from "./entity-extractor";
import { decomposeHeuristic, ALL_FINANCIAL_VERBS, type DecompositionResult } from "./narrative-decomposer";
import { verifyClassifiedItems } from "./post-classifier-verifier";
import { checkAdmissibility } from "./admissibility-gate";
import { applyCalibration } from "./confidence-calibrator";
import { shouldEscalate, decide } from "./classification-decision";
import { pickPersonCandidate, pickAllPersonCandidates, resolvePersonForTransaction, compactArabic } from "./person-resolver";
import { muscleMemoryLookup } from "./muscle-memory";
import { matchSegment } from "./embedding-engine";
import { db } from "../queries/connection";
import { expenses } from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { LRUCache } from "lru-cache";

// ─── Classification Result Cache ───────────────────────────────────
// Caches full pipeline results for repeated queries. 40-60% hit rate
// expected — users frequently type the same phrases ("بنزين 200", "قهوة 35").
// Key = hash of normalized text + user plan (different plans → different thresholds).
const classificationCache = new LRUCache<string, PipelineResult>({
  max: 5000,
  ttl: 1000 * 60 * 60 * 24 * 7, // 7 days
});

/** Persisted alongside classification logs so observability reflects the active pipeline. */
export const SMART_PIPELINE_VERSION = "v3.0";

function makeCacheKey(text: string, userPlan: string, userId: number, userType: string, businessMode?: boolean): string {
  // Treat harmless Arabic orthographic variants and spacing consistently; a
  // cache miss here previously made equivalent Egyptian input pay the full
  // pipeline cost again.
  const normalized = normalizeArabicString(text);
  return `cls:${userType}:${userId}:${userPlan}:${businessMode ? "biz" : "std"}:${normalized}`;
}

const PERSONAL_KEYWORDS = [
  "فطرت", "اتعشيت", "اتغديت", "اكلت", "شربت", "قهوة", "كافيه",
  "اوبر", "كريم", "مترو", "تاكسي", "بنزين", "مواصلات",
  "كهرباء", "مياه", "غاز", "نت", "انترنت", "تليفون", "شحن",
  "ايجار", "إيجار", "سكن",
  "دكتور", "صيدلية", "دوا", "علاج",
  "ملابس", "هاتف", "موبايل",
  "سينما", "جيم", "نادي",
  "مرتب", "راتب", "بونص", "جالي", "قبضت",
];

const SALARY_PATTERN = /(?:مرتب|راتب|دفع\s+مرتب|اديت\s+مرتب|صرفت\s+مرتب)/;

function isStructuralOrConjunction(text: string, candidates: string[] = []): boolean {
  if (!/\s+(?:او|أو)\s+/.test(text)) return false;

  // 1. If there are multiple candidates, check if 'أو' sits between any two of them
  if (candidates.length > 1) {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const c1 = compactArabic(candidates[i]);
        const c2 = compactArabic(candidates[j]);
        const normText = compactArabic(text);
        const reg = new RegExp(`${c1}.*?\\s+(?:او|أو)\\s+.*?${c2}|${c2}.*?\\s+(?:او|أو)\\s+.*?${c1}`);
        if (reg.test(normText)) return true;
      }
    }
  }

  // 2. Or if 'أو' connects two alternative financial verbs / actions in this text
  const parts = text.split(/\s+(?:او|أو)\s+/);
  if (parts.length >= 2) {
    const verbsFound = parts.filter(p => ALL_FINANCIAL_VERBS.some(v => p.includes(v)));
    if (verbsFound.length >= 2) return true;
  }

  return false;
}

/**
 * Invalidate all cached classifications for a user (e.g., when their
 * dictionary changes or they correct a transaction).
 */
export function invalidateUserClassificationCache(userId: number, userType?: string): void {
  // lru-cache doesn't support prefix-based deletion natively,
  // but we can iterate and purge entries matching the user.
  // For production scale, consider Redis with pattern-based deletion.
  for (const key of classificationCache.keys()) {
    if (
      userType
        ? key.startsWith(`cls:${userType}:${userId}:`)
        : key.includes(`:${userId}:`)
    ) {
      classificationCache.delete(key);
    }
  }
}

export interface PipelineInput {
  text: string;
  userId: number;
  userType: string;
  userPlan: string;
  userDict: Array<{ word: string; category: string; subCategory?: string }>;
  apiKey: string;
  apiKey2?: string;
  modelName: string;
  maxTokens: number;
  monthlyContext?: any;
  userProfileContext?: any;
  skipClarification?: boolean;
  provider?: string;
  groqApiKey?: string;
  fireworksApiKey?: string;
  nvidiaApiKey?: string;
  pipelineSettings?: Record<string, string>;
  businessCategories?: Array<{
    id: number;
    name: string;
    nameAr: string;
    type: string;
    keywords: string[];
    matchExamples: string[];
  }>;
  /** The actual userBusinesses.id — NOT the category row ID */
  businessId?: number | null;
  businessMode?: boolean;
}

export interface PipelineLog {
  originalText?: string;
  normalizedText?: string;
  entitiesFound?: Record<string, unknown>;
  ruleEngineResult?: Record<string, unknown>;
  embeddingResult?: Record<string, unknown>;
  aiResult?: Record<string, unknown>;
  routing?: Record<string, unknown>;
  finalConfidence?: number;
  finalDecision?: string;
  cachedTokens?: number;
  /**
   * Which provider answered, and everything that failed on the way there.
   *
   * The admin dashboard could previously report the model name it *intended* to use and
   * nothing about whether that is what happened. A silent fallback, a provider that
   * dropped the response schema, a chain that burned three timeouts before answering —
   * all of it looked identical to a clean first-try success.
   */
  providerRoute?: {
    servedBy: string | null;
    attempts: LlmAttempt[];
    schemaDegraded: boolean;
    failedOver: boolean;
  };
  /** Whether every amount the user said was accounted for, and which were not. */
  amountLedger?: {
    anchorCount: number;
    balanced: boolean;
    unconsumed: number[];
    splitCount: number;
    unanchoredItemCount: number;
  };
}

export interface PipelineResult {
  items: ParsedTransaction[];
  decision: "auto_save" | "review" | "clarify";
  clarificationQuestion?: string;
  overallConfidence: number;
  tokensUsed: number;
  cachedTokens?: number;
  parsedBy: string;
  modelUsed: string;
  /** The model that was actually invoked for classification. null when rule_engine/cache handled it without LLM. */
  actualModelUsed?: string | null;
  processingTimeMs: number;
  alertMessage?: string;
  log: PipelineLog;
  logs?: PipelineLog[];
}

type KnownPersonContext = {
  name: string;
  relationship?: string;
  category?: string;
  subCategory?: string;
};

const SMART_CLASSIFIER_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    reasoning: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    decomposed_sentences: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING },
          amount: { type: SchemaType.NUMBER },
          main_category: { type: SchemaType.STRING },
          sub_category: { type: SchemaType.STRING },
          item_name: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
          alertMessage: { type: SchemaType.STRING },
          needsClarification: { type: SchemaType.BOOLEAN },
          clarificationQuestion: { type: SchemaType.STRING, nullable: true },
          person_mentioned: { type: SchemaType.STRING, nullable: true },
          person_relationship: { type: SchemaType.STRING, nullable: true },
          is_valid_transaction: { type: SchemaType.BOOLEAN },
        },
        required: [
          "type",
          "amount",
          "main_category",
          "sub_category",
          "item_name",
          "confidence",
          "alertMessage",
          "needsClarification"
        ],
      },
    },
  },
  required: ["items"],
} as any;

const SIMPLE_CLASSIFIER_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING },
          amount: { type: SchemaType.NUMBER },
          main_category: { type: SchemaType.STRING },
          sub_category: { type: SchemaType.STRING },
          item_name: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
          alertMessage: { type: SchemaType.STRING },
          needsClarification: { type: SchemaType.BOOLEAN },
          clarificationQuestion: { type: SchemaType.STRING, nullable: true },
          person_mentioned: { type: SchemaType.STRING, nullable: true },
          person_relationship: { type: SchemaType.STRING, nullable: true },
          is_valid_transaction: { type: SchemaType.BOOLEAN },
        },
        required: [
          "type",
          "amount",
          "main_category",
          "sub_category",
          "item_name",
          "confidence",
          "alertMessage",
          "needsClarification"
        ],
      },
    },
  },
  required: ["items"],
} as any;

import { normalizeArabicCompact as normalizeArabicString } from "./unified-normalizer";

// Re-export for backward compatibility (other files import from smart-pipeline)
export { normalizeArabicString };

function safeExtractItems(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === "object") {
    if (data.items && Array.isArray(data.items)) return data.items;
    if (data.transactions && Array.isArray(data.transactions)) return data.transactions;
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) return data[key];
    }
    if (data.amount !== undefined && data.main_category !== undefined) return [data];
  }
  return [];
}

function robustJsonParse(text: string): any {
  let cleaned = text;
  // 1. Remove <thought> blocks completely (if any)
  cleaned = cleaned.replace(/<thought>[\s\S]*?<\/thought>/gi, "");
  
  // 2. Extract from markdown JSON blocks
  const matchMarkdown = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (matchMarkdown) {
      cleaned = matchMarkdown[1];
  }

  try {
    return JSON.parse(cleaned.trim());
  } catch (e) {
    console.warn("[JSON Fallback] Strict parse failed, attempting regex extraction...");
    const match = cleaned.match(/\[.*\]|\{.*\}/s);
    if (match) {
      try {
        const fixedStr = match[0]
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/'/g, '"');
        return JSON.parse(fixedStr);
      } catch (innerE) {
        console.error("Robust JSON extraction also failed.", innerE);
        return [];
      }
    }
    return [];
  }
}

function hasLoanIntent(text: string): boolean {
  return /(?:سلف|سلفة|سلفه|دين|ديون|قرض|استلف|استلفت)/.test(text);
}

function isDirectedPersonPayment(text: string, candidateName?: string | null): boolean {
  const compactText = normalizeArabicString(text);
  const compactName = candidateName ? normalizeArabicString(candidateName) : "";
  const hasDirectedVerb = /[وف]?(?:اديت|أديت|إديت|عطيت|أعطيت|اعطيت|حولت|بعت|سلفت|أرسلت|ارسلت|رسلت|دفعت|خدت|اخدت|أخدت|أخذت|اخذت|استلمت|قبضت|استلفت|جالي|جاني|رجعلي|رجعولي|إداني|اداني|بعتلي|وصلني)/.test(
    compactText,
  );
  const hasLamName =
    compactName.length >= 2 &&
    (compactText.includes(`ل${compactName}`) ||
      compactText.includes(`لل${compactName}`) ||
      compactText.includes(`من${compactName}`) ||
      compactText.includes(`مع${compactName}`));

  return hasDirectedVerb || hasLamName;
}

function shouldResolvePerson(
  transactionText: string,
  candidateName: string | null | undefined,
  category?: string | null,
  knownPeople?: KnownPersonContext[],
): boolean {
  if (!candidateName) return false;
  if (["العائلة", "أصدقاء", "موظفين"].includes(String(category || ""))) {
    return true;
  }
  
  if (knownPeople && knownPeople.some(p => p.name && (p.name === candidateName || matchArabicPhrase(candidateName, p.name) || matchArabicPhrase(p.name, candidateName)))) {
    return true;
  }

  return isDirectedPersonPayment(transactionText, candidateName);
}

function applyPersonResolution(
  item: ParsedTransaction,
  candidateName: string | null | undefined,
  transactionText: string,
  originalText: string,
  knownPeople: KnownPersonContext[],
): {
  item: ParsedTransaction;
  needsClarification: boolean;
  clarificationQuestion?: string;
} {
  if (!shouldResolvePerson(transactionText, candidateName, item.category, knownPeople)) {
    return { item, needsClarification: false };
  }

  const resolution = resolvePersonForTransaction({
    candidateName,
    transactionText,
    originalText,
    knownPeople,
    aiRelationship: item.person_relationship,
  });

  if (!resolution.name) {
    return { item, needsClarification: false };
  }

  const next: ParsedTransaction = {
    ...item,
    person_mentioned: resolution.name,
    person_relationship: resolution.relationship || item.person_relationship,
  };

  if (resolution.needsClarification) {
    if (hasLoanIntent(transactionText)) {
      return {
        item: {
          ...next,
          type: "transfer",
          category: "تحويل",
          subCategory: "دين/سلفة",
          needsReview: true,
        },
        needsClarification: true,
        clarificationQuestion: resolution.clarificationQuestion,
      };
    }
    return {
      item: {
        ...next,
        category: resolution.category && resolution.category !== "متنوعات" ? resolution.category : next.category,
        subCategory: "أشخاص",
        confidence: Math.min(next.confidence, 60),
        needsReview: true,
      },
      needsClarification: true,
      clarificationQuestion: resolution.clarificationQuestion,
    };
  }

  if (resolution.category && resolution.subCategory) {
    const genericCategories = ["تحويل", "متنوعات", "أخرى", "غير محدد", "عام"];
    const isGenericCategory = !item.category || genericCategories.includes(item.category);
    const isWeakRuleMatch = item.confidence < 85;
    if (isGenericCategory || (resolution.isKnown && isWeakRuleMatch)) {
      next.category = resolution.category;
    }
    next.subCategory = resolution.subCategory;
    if (hasLoanIntent(transactionText)) {
      if (next.type !== "income") {
        next.type = "transfer";
        next.category = "تحويل";
        next.subCategory = "دين/سلفة";
      } else {
        next.category = "مرتب";
        next.subCategory = "سلف/قروض";
      }
    } else if (next.type !== "income" && ["العائلة", "أصدقاء", "موظفين"].includes(next.category || "")) {
      next.type = "expense";
    }
    // Resolving WHO the money went to says nothing about whether the CATEGORY is right,
    // yet this used to lift any item with a recognised name to 96 — enough for a fuzzy
    // typo match on a person's name to auto-save. The resolution is recorded as
    // evidence so calibration can price it, and it no longer forces needsReview off.
    next.evidence = next.evidence
      ? { ...next.evidence, personResolved: resolution.isKnown ? "known" : "unknown" }
      : next.evidence;
    next.ambiguityFlags = [
      ...(next.ambiguityFlags || []),
      resolution.isKnown ? "person_resolved_known" : "person_resolved_unknown",
    ];
  }

  return { item: next, needsClarification: false };
}

function buildGlobalVerifierPrompt(
  originalText: string,
  decomposition: DecompositionResult | undefined,
): string {
  const deterministicAmounts = extractAmounts(originalText).map((a) => a.amount);
  
  let basePrompt = `النص الأصلي:\n${originalText}`;
  if (decomposition && decomposition.segments.length > 1) {
    const segmentsList = decomposition.segments.map((s, i) => `${i + 1}. ${s.text}`).join("\n");
    basePrompt += `\n\n💡 مساعدة سياقية (Decomposition Hint):\nلقد قمنا بتقسيم النص مبدئياً إلى العمليات التالية لمساعدتك:\n${segmentsList}\nيرجى استخراج عملية واحدة على الأقل لكل جزء بدقة لعدم الخلط بين المبالغ والفئات.`;
  }

  if (deterministicAmounts.length === 0) {
    return basePrompt;
  }

  const amountsText = deterministicAmounts.join(", ");
  return `${basePrompt}\n\n🚨 أمان البيانات (Amount Anchoring):\nلقد رصدنا المبالغ الآتية في النص: [${amountsText}].\nيجب أن تحتوي مخرجاتك على هذه المبالغ بالضبط موزعة على العمليات بشكل صحيح، ولا تتخيل مبالغ وهمية من عندك.`;
}

function settingBoolean(
  settings: Record<string, string>,
  key: string,
  fallback: boolean,
): boolean {
  const raw = settings[key];
  if (raw === undefined) return fallback;
  return ["true", "1", "yes", "on"].includes(String(raw).toLowerCase());
}

function settingNumber(
  settings: Record<string, string>,
  key: string,
  fallback: number,
): number {
  const parsed = Number(settings[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractKeywords(text: string): string[] {
  const words = text
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3);
  
  const stopWords = new Set([
    "دفعت", "صرفت", "اشتريت", "جبت", "ركبت", "اكلت", "شربت", "حولت", "بعت", "سلفت", "دفعتل",
    "جنيه", "الف", "مليون", "مبلغ", "فلوس", "حساب", "طريق", "طريقه", "طريقة", "عشان", "علشان",
    "بتاع", "بتاعتي", "بتاعته", "بتاعتنا", "معاها", "معاه", "معاهم"
  ]);
  
  return words.filter(w => !stopWords.has(w));
}

/**
 * Smart Pipeline (v3) - Hybrid Intelligence
 */
export async function runSmartPipeline(
  input: PipelineInput
): Promise<PipelineResult> {
  const startTime = Date.now();
  let totalTokens = 0;
  let cachedTokens = 0;
  // What this user has already corrected. Loaded once per run; an empty list on any
  // failure, so the learning layer can never be the reason a classification fails.
  let correctionRules: CorrectionRule[] = [];
  // Which providers were tried and what each of them did. Previously unknowable: a
  // fallback that fired left no trace, so "why was this slow" had no answer.
  let llmAttempts: LlmAttempt[] = [];
  let servedByRoute: string | null = null;
  // What happened to every amount the user said. Surfaced to the admin dashboard so
  // "the total does not match what I said" becomes a measurable rate instead of a report.
  let amountLedger: PipelineLog["amountLedger"];
  let schemaWasDegraded = false;
  const provider = input.provider || "gemini";
  const modelUsed = mapModelName(input.modelName);
  const fireworksKey = input.fireworksApiKey || "";
  const knownPeople: KnownPersonContext[] = Array.isArray(
    input.userProfileContext?.knownPeople,
  )
    ? input.userProfileContext.knownPeople
    : [];

  // 0. Check classification cache first (40-60% hit rate for repeated queries)
  const cacheKey = makeCacheKey(input.text, input.userPlan, input.userId, input.userType, input.businessMode);
  const cachedResult = classificationCache.get(cacheKey);
  if (cachedResult) {
    return {
      ...cachedResult,
      processingTimeMs: Date.now() - startTime,
      log: {
        ...cachedResult.log,
        routing: {
          ...(cachedResult.log.routing || {}),
          route: "classification_cache_hit",
        },
      },
    };
  }

  // 0.5. Muscle Memory — instant match for recurring user patterns (0 tokens, 0 API)
  // Person transactions are now allowed: after a hit, we run person resolution
  // to attach the correct person info. If the person is known → auto_save.
  // If unknown → clarify (don't auto-save an unknown person).
  try {
    const memoryMatch = await muscleMemoryLookup(input.text, input.userId, input.userType);
    if (memoryMatch && memoryMatch.matchScore >= 90 && memoryMatch.amount > 0) {
      const memItem: ParsedTransaction = {
        amount: memoryMatch.amount,
        category: memoryMatch.pattern.category,
        subCategory: memoryMatch.pattern.subCategory,
        description: input.text.slice(0, 60),
        type: memoryMatch.pattern.type,
        confidence: Math.min(100, memoryMatch.pattern.confidence),
        currency: "EGP",
        needsReview: false,
        parsedBy: "rule_engine",
        inferenceSource: "dictionary",
        ambiguityFlags: ["muscle_memory_hit"],
      };

      const memKnownNames = knownPeople.map((p) => p.name).filter(Boolean);

      const memCandidates = pickAllPersonCandidates(
        null,
        input.text,
        memKnownNames,
      );

      if (memCandidates.length > 0) {
        const memResolvedItems: ParsedTransaction[] = [];
        let memNeedsClarification = false;
        let memClarificationQ: string | undefined;

        for (const candidateName of memCandidates) {
          const personApplied = applyPersonResolution(
            { ...memItem, amount: memCandidates.length > 1 ? Number((memItem.amount / memCandidates.length).toFixed(2)) : memItem.amount },
            candidateName,
            input.text,
            input.text,
            knownPeople,
          );
          if (personApplied.needsClarification) {
            memNeedsClarification = true;
            memClarificationQ = personApplied.clarificationQuestion;
          } else {
            memResolvedItems.push(personApplied.item);
          }
        }

        if (memNeedsClarification) {
          const memResult: PipelineResult = {
            items: memResolvedItems.length > 0 ? memResolvedItems : [{ ...memItem, needsReview: true, confidence: 60 }],
            decision: "clarify",
            clarificationQuestion: memClarificationQ,
            overallConfidence: 0,
            tokensUsed: 0,
            cachedTokens: 0,
            parsedBy: "rule_engine",
            modelUsed,
            actualModelUsed: null,
            processingTimeMs: Date.now() - startTime,
            log: {
              originalText: input.text,
              routing: { route: "muscle_memory", reason: "person_needs_clarification", matchScore: memoryMatch.matchScore },
              finalConfidence: 0,
              finalDecision: "clarify",
            },
          };
          return memResult;
        }

        const memResult: PipelineResult = {
          items: memResolvedItems.length > 0 ? memResolvedItems : [memItem],
          decision: "auto_save",
          overallConfidence: memItem.confidence,
          tokensUsed: 0,
          cachedTokens: 0,
          parsedBy: "rule_engine",
          modelUsed,
          actualModelUsed: null,
          processingTimeMs: Date.now() - startTime,
          log: {
            originalText: input.text,
            routing: { route: "muscle_memory", reason: "pattern_match_with_person", matchScore: memoryMatch.matchScore },
            finalConfidence: memItem.confidence,
            finalDecision: "auto_save",
          },
        };
        classificationCache.set(cacheKey, memResult);
        return memResult;
      }

      const memResult: PipelineResult = {
        items: [memItem],
        decision: "auto_save",
        overallConfidence: memItem.confidence,
        tokensUsed: 0,
        cachedTokens: 0,
        parsedBy: "rule_engine",
        modelUsed,
        actualModelUsed: null,
        processingTimeMs: Date.now() - startTime,
        log: {
          originalText: input.text,
          routing: { route: "muscle_memory", reason: "pattern_match", matchScore: memoryMatch.matchScore },
          finalConfidence: memItem.confidence,
          finalDecision: "auto_save",
        },
      };
      classificationCache.set(cacheKey, memResult);
      return memResult;
    }
  } catch (e) {
    // Muscle memory DB query might fail — don't block the pipeline
  }

  // 0.7. Business vs Personal Scoring (0 tokens)
  // Instead of binary matching, we compute a business_score and personal_score
  // for the text. If business_score dominates → classify as business.
  // If personal_score dominates → let normal pipeline handle it (personal).
  // If close → tag as ambiguous and let the normal pipeline + AI decide.
  let businessMatchResult: { categoryId: number; nameAr: string; type: string; score: number } | null = null;
  let businessScoreTotal = 0;
  let personalScoreTotal = 0;

  if (input.businessCategories && input.businessCategories.length > 0) {
    const scoringNormalized = normalizeV2(input.text).forRules;

    // --- Compute business score ---
    for (const bizCat of input.businessCategories) {
      let catScore = 0;
      const allKeywords = [
        ...(Array.isArray(bizCat.keywords) ? bizCat.keywords : []),
        ...(Array.isArray(bizCat.matchExamples) ? bizCat.matchExamples : []),
      ];

      for (const kw of allKeywords) {
        if (!kw || kw.length < 2) continue;
        if (matchArabicPhrase(scoringNormalized, kw)) {
          catScore += kw.length >= 4 ? 15 : 8;
        }
      }

      if (bizCat.nameAr && matchArabicPhrase(scoringNormalized, bizCat.nameAr)) {
        catScore += 20;
      }

      if (catScore > 0 && (!businessMatchResult || catScore > businessMatchResult.score)) {
        businessMatchResult = { categoryId: bizCat.id, nameAr: bizCat.nameAr, type: bizCat.type, score: catScore };
      }
      businessScoreTotal += catScore;
    }

    // --- Compute personal score ---
    // Check against the main category dictionary for personal keywords
    for (const pk of PERSONAL_KEYWORDS) {
      if (scoringNormalized.includes(pk)) {
        personalScoreTotal += 10;
      }
    }

    // --- Salary detection in business mode ---
    // "دفعت مرتب فلان" or "اديت مرتب" → business salary expense
    const hasSalaryKeyword = SALARY_PATTERN.test(scoringNormalized);
    if (hasSalaryKeyword && input.businessCategories.some(c => c.nameAr.includes("مرتب") || c.nameAr.includes("رواتب") || c.nameAr.includes("عمال"))) {
      businessScoreTotal += 25;
      if (businessMatchResult) {
        // Override to salary category if available
        const salaryCat = input.businessCategories.find(c =>
          c.nameAr.includes("مرتب") || c.nameAr.includes("رواتب") || c.nameAr.includes("عمال")
        );
        if (salaryCat) {
          businessMatchResult = { categoryId: salaryCat.id, nameAr: salaryCat.nameAr, type: salaryCat.type, score: businessMatchResult.score + 25 };
        }
      }
    }

    // --- Decision based on score difference ---
    const scoreDiff = businessScoreTotal - personalScoreTotal;

    if (businessMatchResult && businessMatchResult.score >= 15 && scoreDiff >= 10) {
      // Strong business match — classify immediately (0 tokens)
      const bizAmounts = extractAmounts(input.text);
      const bizAmount = bizAmounts.length > 0 ? bizAmounts[0].amount : 0;

      if (bizAmount > 0) {
        const bizType = businessMatchResult.type === "income" ? "income" : "expense";

        // Extract person for salary transactions
        let bizPerson: string | undefined;
        let bizPersonRel: string | undefined;
        if (hasSalaryKeyword) {
          const knownNames = knownPeople.map((p) => p.name).filter(Boolean);
          const candidates = pickAllPersonCandidates(null, input.text, knownNames);
          if (candidates.length > 0) {
            bizPerson = candidates[0];
            bizPersonRel = "موظف";
          }
        }

        const bizItem: ParsedTransaction = {
          amount: bizAmount,
          category: "مشروع",
          subCategory: businessMatchResult.nameAr,
          description: input.text.slice(0, 60),
          type: bizType as any,
          confidence: Math.min(100, 75 + businessMatchResult.score),
          currency: "EGP",
          needsReview: false,
          parsedBy: "rule_engine",
          inferenceSource: "dictionary",
          ambiguityFlags: ["business_scoring_match"],
          businessId: input.businessId ?? undefined,
          person_mentioned: bizPerson,
          person_relationship: bizPersonRel,
        };

        const bizResult: PipelineResult = {
          items: [bizItem],
          decision: "auto_save",
          overallConfidence: bizItem.confidence,
          tokensUsed: 0,
          cachedTokens: 0,
          parsedBy: "rule_engine",
          modelUsed,
          actualModelUsed: null,
          processingTimeMs: Date.now() - startTime,
          log: {
            originalText: input.text,
            routing: {
              route: "business_scoring",
              reason: "business_score_dominant",
              businessScore: businessScoreTotal,
              personalScore: personalScoreTotal,
              scoreDiff,
              category: businessMatchResult.nameAr,
              hasSalary: hasSalaryKeyword,
            },
            finalConfidence: bizItem.confidence,
            finalDecision: "auto_save",
          },
        };
        classificationCache.set(cacheKey, bizResult);
        return bizResult;
      }
    }
    // If personal_score >= business_score + 10 → don't interfere, let normal pipeline handle it.
    // If |diff| < 10 → ambiguous, let normal pipeline + AI decide (the pipeline will tag it).
    // The businessMatchResult is kept for later use if AI needs context.
  }

  // 1. Normalize (Light Normalization for AI, aggressive for rules)
  const normalized = normalizeV2(input.text);
  const normalizedText = normalized.forRules;

  const finalItems: ParsedTransaction[] = [];
  let requiresAI = false;
  let clarificationQuestion: string | undefined = undefined;
  let decision: "auto_save" | "review" | "clarify" | "unknown" = "unknown";
  let firstAlertMessage: string | undefined = undefined;
  let overallConfidence = 100;
  const pipelineSettings = input.pipelineSettings || {};
  const decompositionEnabled = settingBoolean(
    pipelineSettings,
    "parser_fast_decomposition_enabled",
    true,
  );
  const personMemoryEnabled = settingBoolean(
    pipelineSettings,
    "parser_person_memory_enabled",
    true,
  );
  const verifierEnabled = settingBoolean(
    pipelineSettings,
    "parser_local_verifier_enabled",
    true,
  );
  const autoSaveThreshold = settingNumber(
    pipelineSettings,
    "parser_auto_save_threshold",
    settingNumber(pipelineSettings, "confidence_auto_save", 85),
  );
  const decisionThresholds = {
    autoSave: settingNumber(pipelineSettings, "parser_auto_save_threshold", 90) / 100,
    review: settingNumber(pipelineSettings, "parser_review_threshold", 50) / 100,
    escalate: settingNumber(pipelineSettings, "parser_escalate_threshold", 85) / 100,
  };

  const reviewThreshold = settingNumber(
    pipelineSettings,
    "parser_review_threshold",
    settingNumber(pipelineSettings, "confidence_review", 60),
  );

  // Counting amounts is the amount extractor's job, not a private list.
  //
  // This used to be a fourth copy of the spoken-number vocabulary, and it double-counted
  // by construction: "ميتين وخمسين" is one amount of 250, but the digit regex and the word
  // list each matched it, returning 2 and inflating the count that drives every routing
  // threshold below. extractAmounts already composes numerals correctly.
  const countAmounts = (text: string): number => extractAmounts(text).length;

  const countWords = (text: string): number => {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  };
  
  const numAmounts = countAmounts(normalizedText);
  const numWords = countWords(normalizedText);

  // 1.5 Admissibility gate — the last point before anything can cost money, and the
  // only place allowed to end a request with "I did not understand".
  //
  // The filter this replaces only fired when the amount count was zero, so a clock time
  // ("الساعة خمسة") sailed through on its number, and it matched its keyword list by
  // substring. checkAdmissibility reuses the real amount extractor, the real verb
  // lexicon and word-boundary matching, and distinguishes three rejections that deserve
  // different answers: chatter, a question about spending, and a transaction that did
  // not happen.
  const admissibility = checkAdmissibility(normalizedText);
  if (admissibility.verdict !== "financial") {
    return {
      items: [],
      overallConfidence: 0,
      clarificationQuestion: admissibility.userMessage,
      decision: "clarify",
      tokensUsed: 0,
      parsedBy: "system",
      modelUsed,
      actualModelUsed: null,
      processingTimeMs: Date.now() - startTime,
      log: {
        originalText: input.text,
        normalizedText,
        finalConfidence: 0,
        finalDecision: "clarify",
        routing: {
          route: "admissibility_gate",
          verdict: admissibility.verdict,
          reason: admissibility.reason,
          signals: admissibility.signals,
        },
      },
    };
  }

  const knownNames = knownPeople.map((p) => p.name).filter(Boolean);

  // Load what this user has corrected before, after the admissibility gate and the
  // cheap caches so nothing is queried for text that will never be classified.
  correctionRules = await loadCorrectionRules(input.userId, input.userType);

  // 2. Try Rule Engine for simple cases (1 amount, short sentence)
  let ruleResult: Awaited<ReturnType<typeof runRuleEngine>> | null = null;
  let ruleSucceeded = false;
  // Segment the NORMALIZED text, not the raw utterance.
  //
  // Splitting used to run on input.text while normalization was applied afterwards,
  // per segment — so the most fragile stage in the pipeline was the only one reading
  // the messiest text. Arabic-Indic digits were invisible to it (JS \d is ASCII-only),
  // and spoken amounts were still words, so "دفعت ٥٠٠ بنزين وركبت ٣٠ أوبر" produced no
  // anchors at all and collapsed into a single segment.
  //
  // forAI is the right input rather than forRules: it resolves numbers and STT noise
  // while preserving the Arabic orthography and person names that the decomposer needs
  // for name detection and that later stages surface back to the user.
  const decomposition: DecompositionResult = decompositionEnabled
    ? decomposeHeuristic(normalized.forAI, knownNames)
    : { segments: [], method: "simple", isComplex: false };

  const localSucceededItems: ParsedTransaction[] = [];
  /**
   * What the local path resolved for segments that were escalated to the model.
   *
   * Escalating means "the model could probably do better", not "throw this away". When
   * the model is unavailable — no key, rate limited, every provider down — the fallback
   * used to re-run the rule engine over the rejoined text, which loses per-segment
   * person resolution and turns "حولت لمروان" back into a generic transfer. Keeping the
   * resolved items means an outage degrades quality by a little instead of a lot.
   */
  const escalatedSegmentItems: ParsedTransaction[] = [];
  /**
   * Every locally-resolved item in narrative order, whether its segment was accepted or
   * escalated. Combining two separate lists at salvage time reordered the result —
   * "100 مواصلات وب50 أكل" came back as 50 then 100 — because escalated segments were
   * appended after accepted ones rather than interleaved where they belong.
   */
  const orderedLocalItems: ParsedTransaction[] = [];
  const failedSegments: typeof decomposition.segments = [];

  // Fast path for long/multi-transaction narratives: classify each segment locally.
  if (decomposition.segments.length > 1) {
    let localClarification: string | undefined;
    const localUnknownNames: string[] = [];

    for (const segment of decomposition.segments) {
      const segmentText = segment.text.trim();
      const segmentTextWithVerb = (segment.linkedVerb && !segmentText.includes(segment.linkedVerb))
        ? `${segment.linkedVerb} ${segmentText}`
        : segmentText;
        
      const segmentNormalized = normalizeV2(segmentTextWithVerb).forRules;
      const segmentAmountCount = countAmounts(segmentNormalized);
      const segmentRule = await runRuleEngine(
        segmentNormalized,
        input.userDict,
        input.userProfileContext,
        undefined,
        fireworksKey,
      );
      if (segmentRule.items.length === 0) {
        failedSegments.push(segment);
        continue;
      }

      let anyNeedsClarification = false;
      const segmentResolvedItems: ParsedTransaction[] = [];

      for (const item of segmentRule.items) {
          const candidates = pickAllPersonCandidates(
            item.person_mentioned || segment.personMentioned,
            segmentTextWithVerb,
            knownNames,
          );

          if (candidates.length > 0) {
            const hasOrConjunction = isStructuralOrConjunction(segmentTextWithVerb, candidates);
            const splitAmount = segmentAmountCount === 1 && candidates.length > 1 && segmentRule.items.length === 1 && !hasOrConjunction
              ? Number((item.amount / candidates.length).toFixed(2)) 
              : item.amount;

            for (const candidateName of candidates) {
              const clonedItem = { 
                ...item, 
                amount: splitAmount,
                needsReview: hasOrConjunction ? true : item.needsReview,
                confidence: hasOrConjunction ? Math.min(item.confidence, 50) : item.confidence
              };
              const personApplied = personMemoryEnabled
                ? applyPersonResolution(
                    clonedItem,
                    candidateName,
                    segmentTextWithVerb,
                    input.text,
                    knownPeople,
                  )
                : { item: clonedItem, needsClarification: false, clarificationQuestion: undefined };
              
              if (personApplied.needsClarification) {
                anyNeedsClarification = true;
                localUnknownNames.push(candidateName);
              }
              segmentResolvedItems.push(personApplied.item);
            }
          } else {
            segmentResolvedItems.push(item);
          }
      }

      // Does this segment need the model?
      //
      // This is a question about EVIDENCE COMPLETENESS, not about a score. It used to be
      // `confidence >= threshold`, which conflated "worth paying a model for" with "safe
      // to write to the database" — two different questions with different right answers.
      // A category the classifier could not name has to escalate however sure it feels;
      // an answer the user taught us must never escalate however unsure it feels.
      // What the user already told us wins over what the classifier just worked out —
      // before calibration, so the correction is priced as user-taught rather than by
      // the score of the guess it replaced.
      const corrected = applyCorrectionRules(
        segmentResolvedItems,
        segmentTextWithVerb,
        correctionRules,
      );
      corrected.appliedRuleIds.forEach(noteRuleApplied);

      const calibratedSegment = applyCalibration(corrected.items);
      const segmentItems = calibratedSegment.items;
      const amountsFullyConsumed = segmentItems.length >= segmentAmountCount;

      const escalations = segmentItems.map((it) =>
        shouldEscalate(
          {
            evidence: it.evidence,
            category: it.category,
            probability: it.confidence / 100,
            hasUnknownPerson: anyNeedsClarification,
            amountsFullyConsumed,
          },
          decisionThresholds,
        ),
      );

      // Never accept only the resolved portion of a sentence. A review must contain
      // every extracted transaction, otherwise a weak sibling is silently lost when its
      // confident neighbour is auto-saved.
      if (escalations.some((e) => e.escalate) && !anyNeedsClarification) {
        failedSegments.push(segment);
        escalatedSegmentItems.push(...segmentItems);
        orderedLocalItems.push(...segmentItems);
        continue;
      }
      const passedItems = segmentItems;
      
      localSucceededItems.push(...passedItems);
      orderedLocalItems.push(...passedItems);

      if (anyNeedsClarification) {
        const uniqueUnknowns = Array.from(new Set(localUnknownNames));
        localClarification = uniqueUnknowns.length === 1 
          ? `مين ${uniqueUnknowns[0]}؟ (أخوك، صديقك، موظف عندك...)`
          : `محتاج أوضح دول مين: ${uniqueUnknowns.join(" و ")}؟`;
        decision = "clarify";
        clarificationQuestion = localClarification;
        overallConfidence = 0;
      }
    }

    if (failedSegments.length === 0) {
      finalItems.push(...localSucceededItems);
      ruleSucceeded = true;
      if (decision === "unknown") {
        decision = localClarification ? "clarify" : "auto_save";
        clarificationQuestion = localClarification;
        overallConfidence = localClarification
          ? 0
          : Math.round(
              localSucceededItems.reduce((sum, item) => sum + item.confidence, 0) /
                localSucceededItems.length,
            );
      }
    } else {
      finalItems.push(...localSucceededItems);
    }
  }
  
  // Only trust Rule Engine for short phrases (<= 30 words) with max 5 amounts
  if (!ruleSucceeded && failedSegments.length === 0 && numAmounts <= 5 && numWords <= 30) {
    ruleResult = await runRuleEngine(normalizedText, input.userDict, input.userProfileContext, undefined, fireworksKey);
    
    if (ruleResult.items.length > 0) {
      const segmentResolvedItems: ParsedTransaction[] = [];
      let anyNeedsClarification = false;
      const localUnknownNames: string[] = [];

      for (const item of ruleResult.items) {
          const candidates = pickAllPersonCandidates(
            item.person_mentioned,
            input.text,
            knownNames,
          );

          if (candidates.length > 0) {
            // Only split amount if there's exactly 1 amount detected overall BUT multiple candidates 
            // AND we only found 1 item from rule engine (to avoid double splitting)
            const hasOrConjunction = isStructuralOrConjunction(input.text, candidates);
            const splitAmount = numAmounts === 1 && candidates.length > 1 && ruleResult.items.length === 1 && !hasOrConjunction
              ? Number((item.amount / candidates.length).toFixed(2)) 
              : item.amount;

            for (const candidateName of candidates) {
              const clonedItem = { 
                ...item, 
                amount: splitAmount,
                needsReview: hasOrConjunction ? true : item.needsReview,
                confidence: hasOrConjunction ? Math.min(item.confidence, 50) : item.confidence
              };
              const personApplied = personMemoryEnabled
                ? applyPersonResolution(
                    clonedItem,
                    candidateName,
                    input.text,
                    input.text,
                    knownPeople,
                  )
                : { item: clonedItem, needsClarification: false, clarificationQuestion: undefined };

              if (personApplied.needsClarification) {
                anyNeedsClarification = true;
                localUnknownNames.push(candidateName);
              }
              segmentResolvedItems.push(personApplied.item);
            }
          } else {
            segmentResolvedItems.push(item);
          }
      }

      if (anyNeedsClarification) {
        const uniqueUnknowns = Array.from(new Set(localUnknownNames));
        const localClarification = uniqueUnknowns.length === 1 
          ? `مين ${uniqueUnknowns[0]}؟ (أخوك، صديقك، موظف عندك...)`
          : `محتاج أوضح دول مين: ${uniqueUnknowns.join(" و ")}؟`;
        
        finalItems.push(...segmentResolvedItems);
        ruleSucceeded = true;
        decision = "clarify";
        clarificationQuestion = localClarification;
        overallConfidence = 0;
      }
      
      const isPro = input.userPlan === "pro" || input.userPlan === "ultra";

      if (ruleSucceeded) {
        // Handled by needsClarification above
      } else {
        // Same separation as the segment path: escalation is a question about evidence
        // completeness, the decision is a question about probability, and the two are
        // no longer answered by one comparison.
        // Same precedence as the segment path: a stored correction outranks a fresh guess.
        const correctedWhole = applyCorrectionRules(
          segmentResolvedItems,
          input.text,
          correctionRules,
        );
        correctedWhole.appliedRuleIds.forEach(noteRuleApplied);

        const calibratedWhole = applyCalibration(correctedWhole.items);
        const wholeItems = calibratedWhole.items;

        let lowestConfidence = 100;
        let hasMutaNawi3at = false;
        for (const item of wholeItems) {
            if ((item.confidence || 0) < lowestConfidence) lowestConfidence = item.confidence || 0;
            if (item.category === "متنوعات") hasMutaNawi3at = true;
        }

        const wholeEscalations = wholeItems.map((it) =>
          shouldEscalate(
            {
              evidence: it.evidence,
              category: it.category,
              probability: (it.confidence || 0) / 100,
              hasUnknownPerson: false,
              amountsFullyConsumed: wholeItems.length >= numAmounts,
            },
            decisionThresholds,
          ),
        );
        const mustEscalate = wholeEscalations.some((e) => e.escalate);

        if (!mustEscalate) {
            finalItems.push(...wholeItems);
            ruleSucceeded = true;
            const outcome = decide(
              {
                probability: lowestConfidence / 100,
                amountsFullyConsumed: wholeItems.length >= numAmounts,
                hasBlockingFlag: false,
                needsAnswer: false,
              },
              decisionThresholds,
            );
            decision = outcome.decision;
            overallConfidence = lowestConfidence;
        } else {
          // Escalating: keep what the whole-text pass already resolved so an unavailable
          // model degrades the answer instead of erasing it. Without this, a single-clause
          // "دفعت لعماد 1200" loses its person resolution on the way to the fallback and
          // reverts to a generic bank transfer.
          escalatedSegmentItems.push(...wholeItems);
          orderedLocalItems.push(...wholeItems);
        }
        if (hasMutaNawi3at || lowestConfidence < reviewThreshold) {
            // If any item is mutanawi3at or very low confidence, we should NOT accept it locally.
            // Leave ruleSucceeded = false so it falls back to AI!
        }
      }
    }
  }

  const allKnownNames = knownPeople.map((p) => p.name).filter(Boolean);
  const personCandidates = pickAllPersonCandidates(null, input.text, allKnownNames);
  const hasPersonContext = personCandidates.length > 0 || isDirectedPersonPayment(input.text);

  // 3. Fireworks Embedding Layer (92% accuracy, 1 API call, cached)
  // Runs when rule engine failed or returned low confidence, before falling back to AI.
  // Skip if text contains person-related context (needs person resolution, not embedding)
  if (!ruleSucceeded && finalItems.length === 0 && fireworksKey && numAmounts <= 3 && !hasPersonContext) {
    try {
      const cleanText = normalized.forRules
        .replace(/\d+(\.\d+)?/g, "")
        .replace(/(جنيه|ج\.م|ج|الف|ألف|قسط|دفعت|حولت|صرفت|شحنت)/g, "")
        .trim();

      if (cleanText.length >= 3) {
        const embMatch = await matchSegment(cleanText, undefined, fireworksKey);
        if (embMatch && embMatch.score >= 70) {
          const amounts = extractAmounts(normalizedText);
          if (amounts.length > 0) {
            const embItem: ParsedTransaction = {
              amount: amounts[0].amount,
              category: embMatch.category,
              subCategory: embMatch.subCategory,
              description: input.text.slice(0, 60),
              type: (CATEGORIES.find(c => c.name_ar === embMatch.category)?.type || "expense") as any,
              confidence: embMatch.score,
              currency: "EGP",
              needsReview: embMatch.score < 85,
              parsedBy: "rule_engine",
              inferenceSource: "ai",
              ambiguityFlags: ["fireworks_embedding"],
            };
            finalItems.push(embItem);
            ruleSucceeded = true;
            decision = embMatch.score >= 85 ? "auto_save" : "review";
            overallConfidence = embMatch.score;
          }
        }
      }
    } catch (e) {
      // Fireworks API might fail — don't block, fall through to AI
      console.warn("[Smart Pipeline] Fireworks embedding layer failed:", e);
    }
  }

  // 4. Single-Pass Semantic Extraction (AI — fallback of last resort)
  if (!ruleSucceeded) {
    requiresAI = true;
    
    // Segment-level isolation: Send only failed segments to the AI
    const textToClassify = failedSegments.length > 0 
      ? failedSegments.map(s => s.text).join(" و ")
      : normalized.forAI;

    // Fetch RAG Context (Recent user transactions matching keywords)
    let userHistoryContext = "";
    let userHistoryCategories: Array<{ category: string; count: number }> = [];
    try {
      const recentTx = await db.select({
        item_name: expenses.description,
        main_category: expenses.category,
        sub_category: expenses.subCategory
      })
      .from(expenses)
      .where(and(eq(expenses.userId, input.userId), eq(expenses.userType, input.userType)))
      .orderBy(desc(expenses.createdAt))
      .limit(30);
      
      if (recentTx.length > 0) {
        const keywords = extractKeywords(textToClassify);
        const matchedTx = keywords.length > 0 
          ? recentTx.filter(tx => {
              const descClean = normalizeArabicString(tx.item_name || "").toLowerCase();
              return keywords.some(kw => descClean.includes(normalizeArabicString(kw).toLowerCase()));
            }).slice(0, 3)
          : [];

        if (matchedTx.length > 0) {
          userHistoryContext = matchedTx.map(tx => {
            const words = (tx.item_name || "").split(/\s+/);
            const truncated = words.slice(0, 5).join(" ") + (words.length > 5 ? "..." : "");
            return `- "${truncated}" -> ${tx.main_category}/${tx.sub_category || "عام"}`;
          }).join("\n");
          const categoryCounts = new Map<string, number>();
          for (const tx of matchedTx) {
            categoryCounts.set(tx.main_category, (categoryCounts.get(tx.main_category) || 0) + 1);
          }
          userHistoryCategories = Array.from(categoryCounts.entries()).map(([category, count]) => ({ category, count }));
        }
      }
    } catch (e) {
      console.warn("RAG DB Fetch Failed:", e);
    }

    const filteredDecomp = failedSegments.length > 0
      ? {
          segments: failedSegments.map((s, idx) => ({ ...s, segmentIndex: idx })),
          method: decomposition.method,
          isComplex: failedSegments.length > 1,
        }
      : decomposition;

    const numAmountsToClassify = failedSegments.length > 0 ? countAmounts(textToClassify) : numAmounts;
    const useSimpleSchema = numAmountsToClassify <= 1 && !filteredDecomp.isComplex;
    const responseSchema = useSimpleSchema ? SIMPLE_CLASSIFIER_SCHEMA : SMART_CLASSIFIER_SCHEMA;

    const classifierUserPrompt = buildGlobalVerifierPrompt(
      textToClassify,
      filteredDecomp,
    );

    // Prompt shape follows whoever actually serves the request, not whoever we hoped
    // would. Built lazily so the fallback's prompt costs nothing on the happy path.
    const promptCache = new Map<string, { systemPrompt: string; userPrompt: string }>();
    const peopleForPrompt = knownPeople.map((p) => ({
      name: p.name,
      relationship: p.relationship || "شخص معروف",
      category: p.category || "تحويل",
      subCategory: p.subCategory || "تحويلات شخصية",
    }));
    const businessForPrompt = input.businessCategories?.map((c) => ({
      nameAr: c.nameAr,
      type: c.type,
      keywords: c.keywords || [],
    }));

    const promptFor = (route: LlmRoute) => {
      const shape = route.slug === "fireworks" ? "fireworks" : "standard";
      const cached = promptCache.get(shape);
      if (cached) return cached;

      let built: { systemPrompt: string; userPrompt: string };
      if (shape === "fireworks") {
        const fw = buildFireworksPrompts(
          textToClassify,
          peopleForPrompt,
          useSimpleSchema,
          userHistoryContext,
          userHistoryCategories,
          numAmountsToClassify,
          classifierUserPrompt,
          businessForPrompt,
        );
        built = { systemPrompt: fw.systemPrompt, userPrompt: fw.userPrompt };
      } else {
        built = {
          systemPrompt: buildSmartSystemPrompt(
            textToClassify,
            peopleForPrompt,
            undefined,
            useSimpleSchema,
            userHistoryContext,
            userHistoryCategories,
            numAmountsToClassify,
            businessForPrompt,
          ),
          userPrompt: classifierUserPrompt,
        };
      }
      promptCache.set(shape, built);
      return built;
    };

    let classItems: any[] = [];
    try {
      // One call site for every provider, with a chain behind it.
      //
      // This replaces four `if (provider === ...)` branches that each duplicated the same
      // request in a slightly different dialect and shared one property: when the chosen
      // provider failed, classification gave up on the model entirely - while the keys
      // for the other three sat unused in this very request. A 429 on Gemini dropped a
      // paying user's minute of speech to the rule engine with Groq idle.
      const chain = buildProviderChain({
        preferred: provider,
        preferredModel: modelUsed,
        plan: (input.userPlan as AiPlanName) || "free",
        keys: {
          gemini: input.apiKey,
          // Threaded through this function's input for years and never read once.
          geminiSecondary: input.apiKey2,
          groq: input.groqApiKey,
          fireworks: input.fireworksApiKey,
          nvidia: input.nvidiaApiKey,
        },
      });

      const llm = await executeLlmChain(chain, {
        systemPrompt: "",
        userPrompt: "",
        promptFor,
        maxOutputTokens: input.maxTokens || 4096,
        temperature: 0.1,
        schema: responseSchema as unknown as StructuredSchema,
        // Long enough for a full narrative, short enough that a hung provider still
        // leaves room in the 8-second budget for the next one in the chain.
        timeoutMs: 25_000,
      });

      totalTokens += llm.totalTokens;
      cachedTokens = llm.cachedTokens;
      llmAttempts = llm.attempts;
      servedByRoute = llm.route.slug;
      schemaWasDegraded = llm.degradedSchema;
      if (llm.attempts.length > 1) {
        console.warn(
          `[Smart Pipeline] Served by fallback ${llm.route.slug} after ` +
            llm.attempts
              .filter((a) => !a.ok)
              .map((a) => `${a.slug}(${a.failure})`)
              .join(", "),
        );
      }

      classItems = safeExtractItems(robustJsonParse(llm.text));


      if (classItems.length === 0) {
         if (numAmounts <= 3 && numWords <= 15) {
              if (!ruleResult) {
                 ruleResult = await runRuleEngine(normalizedText, input.userDict, input.userProfileContext, undefined, fireworksKey);
              }
              if (ruleResult.items.length > 0) {
                 finalItems.push(...ruleResult.items);
              }
         } else {
              decision = "clarify";
              clarificationQuestion = "عذراً، الجملة طويلة ومفصلة ولم أتمكن من استخراج العمليات. يرجى تقسيمها أو إعادة المحاولة.";
         }
      } else {
        const allKnownNames = knownPeople.map(p => p.name);
        const deterministicPeople = extractPeople(textToClassify, allKnownNames);

        for (const item of classItems) {
            let itemClarify = Boolean(item.needsClarification);
            let itemClarifyQ = item.clarificationQuestion || "ممكن توضح أكتر؟";
            
            const conf = item.confidence || 0;
            if (item.is_valid_transaction === false) {
                  itemClarify = true;
                  itemClarifyQ = "عفواً، لم أتمكن من العثور على معاملة مالية صحيحة أو منطقية في كلامك.";
            } else if (conf < 60 && !input.skipClarification) {
                  itemClarify = true;
                  itemClarifyQ = "عفواً، كلامك مش واضح بالنسبالي أو ناقص، ممكن تعيد صياغته بشكل أوضح؟";
            }

            let detectedPersonName = item.person_mentioned && typeof item.person_mentioned === "string" ? item.person_mentioned.trim() : null;
            const itemContext = item.item_name || item.description || item.name || textToClassify;
            
            let namesList = detectedPersonName ? detectedPersonName.split(/\s+و\s+|،|,|and/).map((n: string) => n.trim()).filter(Boolean) : [];
            let unknownNames: string[] = [];
            
            if (namesList.length === 0) {
               for (const dp of deterministicPeople) {
                  if (matchArabicPhrase(itemContext, dp) || (classItems.length === 1 && matchArabicPhrase(textToClassify, dp))) { 
                      namesList.push(dp);
                      item.person_mentioned = dp;
                  }
               }
            }

            let bestPersonCandidate: string | null = null;
            
            if (namesList.length > 0 && personMemoryEnabled) {
               for (const n of namesList) {
                   const candidate = pickPersonCandidate(n, itemContext, allKnownNames);
                   if (candidate) {
                       const res = resolvePersonForTransaction({
                           candidateName: candidate,
                           transactionText: itemContext,
                           originalText: textToClassify,
                           knownPeople,
                           aiRelationship: item.person_relationship,
                       });
                       if (res.needsClarification) {
                           unknownNames.push(n);
                       } else if (!bestPersonCandidate) {
                           bestPersonCandidate = res.name || candidate;
                       }
                   }
               }
            } else if (namesList.length > 0) {
               bestPersonCandidate = pickPersonCandidate(namesList[0], itemContext, allKnownNames);
            }

            if (unknownNames.length > 0) {
               itemClarify = true;
               itemClarifyQ = "مين " + unknownNames.join(" و ") + "؟";
            }
            detectedPersonName = bestPersonCandidate || namesList[0] || null;

            if (item.alertMessage && item.alertMessage.toLowerCase() !== "ok" && !firstAlertMessage) {
                firstAlertMessage = item.alertMessage;
            }

            let parsedItem: ParsedTransaction = {
                amount: Number(item.amount) || Number(item.price) || Number(item.value) || 0,
                category: item.main_category || item.category || item.mainCategory || "متنوعات",
                subCategory: item.sub_category || item.subCategory || "عام",
                description: item.item_name || item.description || item.name || "عملية",
                type: item.type === "income" ? "income" : item.type === "transfer" ? "transfer" : item.type === "investment" ? "investment" : "expense",
                confidence: item.confidence || 0,
                needsReview: (item.confidence || 0) < 85,
                parsedBy: "ai",
                inferenceSource: "ai",
                currency: "EGP",
                person_mentioned: item.person_mentioned,
                person_relationship: item.person_relationship,
            };

            if (personMemoryEnabled && unknownNames.length === 0) {
               const personApplied = applyPersonResolution(
                  parsedItem,
                  detectedPersonName || parsedItem.person_mentioned || null,
                  itemContext,
                  textToClassify,
                  knownPeople,
                );
               parsedItem = personApplied.item;
            } else if (unknownNames.length > 0) {
               parsedItem.subCategory = "أشخاص";
               parsedItem.confidence = 60;
               parsedItem.needsReview = true;
            }

            if (itemClarify && !input.skipClarification) {
                if (decision !== "clarify") {
                    decision = "clarify";
                    clarificationQuestion = itemClarifyQ;
                    overallConfidence = 0;
                }
            }

            finalItems.push(parsedItem);
        }
      }
    } catch (err) {
      const errMsg = (err as any)?.message || String(err);
      if (err instanceof LlmChainError) {
        // Every configured provider failed. That is a different fact from "the request
        // errored" and the only one worth paging about: the user's answer now depends
        // entirely on what the local path already worked out.
        llmAttempts = err.attempts;
        console.error(
          `[Smart Pipeline] Whole provider chain exhausted (${err.attempts.length} attempts): ${errMsg}`,
        );
      } else if (errMsg.includes("403") || errMsg.includes("429")) {
        console.warn("[Smart Pipeline] AI API unavailable (rate limit/auth). Using local fallback.");
      } else {
        console.error("[Smart Pipeline] AI Error:", errMsg);
      }
      // Degrade, do not discard.
      //
      // Escalating to the model means "it could probably do better", not "the local
      // answer is worthless". This used to re-run the rule engine over the rejoined
      // text, which loses everything the per-segment pass had already resolved —
      // "حولت لمروان" reverts from العائلة/مروان أخوك to a generic bank transfer. The
      // items the local path produced for those segments are kept instead, marked for
      // review so the user sees them rather than having them silently saved.
      const salvaged = orderedLocalItems.length > 0
        ? orderedLocalItems
        : [...localSucceededItems, ...escalatedSegmentItems];
      if (salvaged.length > 0) {
        // Replace rather than append: the accepted segments were already pushed into
        // finalItems before the model was called, so appending the ordered list would
        // duplicate them and destroy narrative order. This list is the whole answer.
        finalItems.length = 0;
        finalItems.push(...salvaged.map((it) => ({ ...it, needsReview: true })));
        if (decision === "unknown") decision = "review";
      } else if (numAmounts <= 3 && numWords <= 15) {
        // Nothing was segmented — a short single-clause input. One clean pass is the
        // best available answer.
        const fallbackRuleResult = await runRuleEngine(
          textToClassify,
          input.userDict,
          input.userProfileContext,
          undefined,
          fireworksKey,
        );
        if (fallbackRuleResult.items.length > 0) {
          finalItems.push(...fallbackRuleResult.items);
        }
      } else {
        decision = "clarify";
        clarificationQuestion =
          "عذراً، حدث خطأ في السيرفر أثناء معالجة الجملة الطويلة. يرجى تقسيمها أو المحاولة لاحقاً.";
      }
    }
  }

  // Reconciliation: account for every amount the user said.
  //
  // Rewritten onto an integer-cents ledger. The float comparison this replaces reported
  // correct arithmetic as a loss (0.1 + 0.2 never equalled 0.3, and a three-way split of
  // 400 never equalled 400), had no concept of a split so "٤٠٠ لمروان وعلاء" recorded as
  // 200 + 200 looked exactly like a vanished 400, and asked about the FIRST missing
  // amount before `break` — say three numbers, lose three, get asked about one.
  if (finalItems.length > 0 && decision === "unknown") {
    const anchors = buildAnchors(extractAmounts(input.text).map((a) => a.amount));
    let ledger = reconcileAmounts(anchors, finalItems);

    if (ledger.unconsumed.length > 0) {
      console.warn(
        `[Reconciliation] Unaccounted amounts: ${ledger.unconsumed
          .map((a) => a.raw)
          .join(", ")}. Attempting recovery...`,
      );

      if (!ruleResult) {
        ruleResult = await runRuleEngine(
          normalizedText,
          input.userDict,
          input.userProfileContext,
          undefined,
          fireworksKey,
        );
      }

      // Recover what the deterministic pass can account for, then re-reconcile rather
      // than assuming each recovery consumed exactly one anchor.
      for (const anchor of ledger.unconsumed) {
        const recovered = ruleResult.items.find(
          (ri) => toCents(ri.amount) === anchor.cents,
        );
        if (recovered) {
          finalItems.push(recovered);
          console.warn(`[Reconciliation] Recovered ${anchor.raw} from deterministic rules.`);
        }
      }
      ledger = reconcileAmounts(anchors, finalItems);

      // Whatever is still missing is asked about in ONE question naming all of it.
      if (ledger.unconsumed.length > 0 && !input.skipClarification) {
        decision = "clarify";
        clarificationQuestion = describeUnconsumed(ledger.unconsumed);
        overallConfidence = 0;
      }
    }

    amountLedger = {
      anchorCount: anchors.length,
      balanced: ledger.balanced,
      unconsumed: ledger.unconsumed.map((a) => a.raw),
      splitCount: ledger.outcomes.filter((o) => o.kind === "split").length,
      unanchoredItemCount: ledger.unanchoredItemIndexes.length,
    };
  }

  // --- DEEP FIX: Deduplicate Items ---
  // If local rule engine and AI both returned the same item (same amount and same category), we should deduplicate
  // ONLY if their descriptions also overlap, to avoid destroying identical but separate transactions.
  const uniqueItems: ParsedTransaction[] = [];
  for (const item of finalItems) {
      const itemDesc = String(item.description || (item as ParsedTransaction & { item_name?: string }).item_name || "").toLowerCase();
      const itemWords = new Set(itemDesc.split(/\s+/).filter(w => w.length > 2));
      let isDuplicate = false;
      
      for (let i = 0; i < uniqueItems.length; i++) {
          const existing = uniqueItems[i];
          if (item.amount === existing.amount && item.category === existing.category) {
              const existingDesc = String(existing.description || (existing as ParsedTransaction & { item_name?: string }).item_name || "").toLowerCase();
              const existingWords = new Set(existingDesc.split(/\s+/).filter(w => w.length > 2));
              
              let intersection = 0;
              for (const w of itemWords) {
                  if (existingWords.has(w)) intersection++;
              }
              
              const minWords = Math.min(itemWords.size, existingWords.size);
              // Deduplicate if they share at least 1 significant word, or if both have no significant words.
              // CRITICAL: Only deduplicate if they came from different parsers (e.g. AI vs Local) to prevent merging valid same-source transactions.
              if ((minWords === 0 || intersection > 0) && item.parsedBy !== existing.parsedBy) {
                  isDuplicate = true;
                  // Keep the one with higher confidence
                  if ((item.confidence || 0) > (existing.confidence || 0)) {
                      uniqueItems[i] = item;
                  }
                  break;
              }
          }
      }
      if (!isDuplicate) {
          uniqueItems.push(item);
      }
  }
  finalItems.length = 0;
  finalItems.push(...uniqueItems);

  // --- DEEP FIX: Logical Amount Thresholds ---
  for (const item of finalItems) {
      if ((item.category === "استثمار" || item.category === "عقارات") && item.amount < 50) {
          item.category = "متنوعات";
          item.subCategory = "عام";
      } else if (item.category === "مرتب" && item.amount < 100) {
          // Only convert to عيدية if the text explicitly mentions eid/eidiya context
          const textLower = input.text.toLowerCase();
          if (/(عيد|عيدي|عيديه|عيدية)/.test(textLower)) {
            item.category = "هدايا وصدقات";
            item.subCategory = "عيدية";
          }
          // Otherwise keep as مرتب — small income is still income (freelance, cashback, etc.)
      } else if (item.category === "سكن" && item.subCategory === "إيجار" && item.amount < 50) {
          item.category = "متنوعات";
          item.subCategory = "عام";
      }
  }

  const normalizedFinalItems = normalizeTransactionTaxonomyList(
    finalItems,
    decomposition.isComplex ? "" : input.text,
  );

  // --- DEEP FIX: Content-Based Recovery (Reverse Mapping) ---
  for (const item of normalizedFinalItems) {
      if (item.category === "متنوعات" && item.description) {
          // Use item.description directly to prevent context leakage (e.g. gym shoes)
          const rawWords = item.description
              .replace(/[\u064B-\u065F\u0670]/g, "") 
              .replace(/[إأآٱ]/g, "ا")
              .replace(/ى/g, "ي")
              .replace(/ة/g, "ه")
              .replace(/ؤ/g, "و")
              .replace(/ئ/g, "ي")
              .toLowerCase()
              .split(/\s+/)
              .filter(Boolean);

          const wordCandidates = rawWords.flatMap(w => {
              const stripped = stripArabicPrefix(w);
              return stripped !== w ? [w, stripped] : [w];
          });

          let rescued = false;
          // Check Bigrams
          for (let i = 0; i < rawWords.length - 1; i++) {
              const bigram = `${rawWords[i]} ${rawWords[i+1]}`;
              if (SUB_CATEGORY_MAP[bigram]) {
                  item.category = SUB_CATEGORY_MAP[bigram].category;
                  item.subCategory = SUB_CATEGORY_MAP[bigram].subCategory;
                    item.needsReview = false;
                    rescued = true;
                    break;
              }
          }
          // Check Unigrams
          if (!rescued) {
              for (const word of wordCandidates) {
                  if (word && SUB_CATEGORY_MAP[word]) {
                      item.category = SUB_CATEGORY_MAP[word].category;
                      item.subCategory = SUB_CATEGORY_MAP[word].subCategory;
                    item.needsReview = false;
                    rescued = true;
                    break;
                  }
              }
          }
      }
  }

  // Evidence becomes a probability here, and only here.
  //
  // Every resolver above wrote a number on its own scale — the merchant registry writes
  // 100 and is right 80% of the time; a trigram writes 92 and is right 97%. Comparing
  // those against one threshold is what produced a 90-100 band that was only 63%
  // accurate. From this line on, `confidence` is the measured probability that the
  // answer is correct, so a single threshold finally means something.
  const calibration = applyCalibration(normalizedFinalItems);
  const calibratedItems = calibration.items;

  const verification = verifierEnabled
    ? verifyClassifiedItems(
        calibratedItems,
        input.text,
        input.monthlyContext
          ? {
              totalIncome: Number(input.monthlyContext.totalIncome || 0),
              totalExpense: Number(input.monthlyContext.totalExpense || 0),
            }
          : undefined,
      )
    : {
        items: calibratedItems,
        flags: [],
        overallConfidence:
          normalizedFinalItems.length > 0
            ? Math.round(
                normalizedFinalItems.reduce(
                  (sum, item) => sum + item.confidence,
                  0,
                ) / normalizedFinalItems.length,
              )
            : 0,
      };
  const verifiedFinalItems = verification.items;
  const hasVerifierErrors = verification.flags.some(
    (flag) => flag.severity === "error",
  );
  const hasVerifierWarnings = verification.flags.some(
    (flag) => flag.severity === "warning",
  );

  if (decision === "unknown") {
      if (verifiedFinalItems.length > 0) {
          overallConfidence = verification.overallConfidence;
          decision =
            overallConfidence >= autoSaveThreshold && !hasVerifierErrors && !hasVerifierWarnings
              ? "auto_save"
              : "review";
      } else {
          decision = "clarify";
          clarificationQuestion = "عذراً، لم أتمكن من استخراج عملية مالية واضحة. ممكن توضح؟";
          overallConfidence = 0;
      }
  } else if (decision === "auto_save") {
      overallConfidence = verification.overallConfidence || overallConfidence;
      if (hasVerifierErrors || hasVerifierWarnings || overallConfidence < autoSaveThreshold) {
          decision = "review";
      }
  }

  const log: PipelineLog = {
    originalText: input.text,
    normalizedText: normalizedText,
    entitiesFound: {
      amountCount: verifiedFinalItems.length,
      people: verifiedFinalItems
        .map((item) => item.person_mentioned)
        .filter(Boolean),
      merchants: [],
    },
    ruleEngineResult: {
      attempted: true,
      succeeded: !requiresAI,
      reason: "smart_pipeline_step_3",
    },
    embeddingResult: {
      attempted: false,
      succeeded: false,
      reason: "bypassed",
    },
    aiResult: {
      attempted: requiresAI,
      succeeded: verifiedFinalItems.length > 0,
      modelUsed,
      routeReason: "smart_pipeline_fallback",
    },
    routing: {
      route: "smart_hybrid",
      reason: "v3_architecture",
      segmentCount: decomposition.segments.length,
      verifierFlags: verification.flags,
      settings: {
        decompositionEnabled,
        personMemoryEnabled,
        verifierEnabled,
        autoSaveThreshold,
        reviewThreshold,
      },
    },
    finalConfidence: overallConfidence,
    finalDecision: decision,
    cachedTokens,
    amountLedger,
    providerRoute: llmAttempts.length
      ? {
          servedBy: servedByRoute,
          attempts: llmAttempts,
          schemaDegraded: schemaWasDegraded,
          failedOver: llmAttempts.filter((a) => !a.ok).length > 0,
        }
      : undefined,
  };

  const result: PipelineResult = {
    items: verifiedFinalItems,
    parsedBy: requiresAI ? "hybrid" : "rule_engine",
    modelUsed,
    // The model that actually produced the answer, which is not always the one we asked
    // for. Reporting the requested model after a failover would put a name in the admin
    // dashboard that never ran.
    actualModelUsed: requiresAI
      ? llmAttempts.find((a) => a.ok)?.model || (servedByRoute ? modelUsed : null)
      : null,
    overallConfidence,
    decision,
    clarificationQuestion,
    alertMessage: firstAlertMessage,
    tokensUsed: totalTokens,
    cachedTokens,
    processingTimeMs: Date.now() - startTime,
    log,
  };

  // Cache successful classifications (auto_save and review only — don't cache clarify
  // because the user hasn't answered yet)
  if (decision === "auto_save" || decision === "review") {
    classificationCache.set(cacheKey, result);
  }

  return result;
}
