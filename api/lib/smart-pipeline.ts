import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { normalizeV2 } from "./normalizer-v2";
import { runRuleEngine, SUB_CATEGORY_MAP } from "./rule-engine";
import { CATEGORY_DICTIONARY } from "./egyptian-dictionary";
import { buildSmartSystemPrompt } from "./dynamic-prompt-builder";
import { normalizeTransactionTaxonomyList } from "./category-registry";
import { callGroqAPI } from "./groq-client";
import { mapModelName } from "./model-mapper";
import type { ParsedTransaction } from "./rule-engine";
import { matchArabicPhrase, stripArabicPrefix } from "./fuzzy-match";
import { extractPeople, extractAmounts } from "./entity-extractor";
import { decomposeHeuristic, type DecompositionResult } from "./narrative-decomposer";
import { verifyClassifiedItems } from "./post-classifier-verifier";
import { pickPersonCandidate, pickAllPersonCandidates, resolvePersonForTransaction } from "./person-resolver";
import { db } from "../queries/connection";
import { expenses } from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";

export interface PipelineInput {
  text: string;
  userId: number;
  userType: string;
  userPlan: string;
  userDict: Array<{ word: string; category: string; subCategory?: string }>;
  apiKey: string;
  apiKey2: string;
  modelName: string;
  maxTokens: number;
  monthlyContext?: any;
  userProfileContext?: any;
  skipClarification?: boolean;
  provider?: string;
  groqApiKey?: string;
  pipelineSettings?: Record<string, string>;
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
}

export interface PipelineResult {
  items: ParsedTransaction[];
  decision: "auto_save" | "review" | "clarify";
  clarificationQuestion?: string;
  overallConfidence: number;
  tokensUsed: number;
  parsedBy: string;
  modelUsed: string;
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
    thoughts: {
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

export function normalizeArabicString(str: string): string {
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
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn("[JSON Fallback] Strict parse failed, attempting regex extraction...");
    const match = text.match(/\[.*\]|\{.*\}/s);
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
    next.confidence = Math.max(next.confidence, resolution.isKnown ? 96 : 90);
    next.needsReview = false;
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
  const provider = input.provider || "gemini";
  const modelUsed = mapModelName(input.modelName);
  
  // 1. Normalize (Light Normalization for AI, aggressive for rules)
  const normalized = normalizeV2(input.text);
  const normalizedText = normalized.forRules;

  const finalItems: ParsedTransaction[] = [];
  let requiresAI = false;
  let clarificationQuestion: string | undefined = undefined;
  let decision: "auto_save" | "review" | "clarify" | "unknown" = "unknown";
  let firstAlertMessage: string | undefined = undefined;
  let overallConfidence = 100;
  const knownPeople: KnownPersonContext[] = Array.isArray(
    input.userProfileContext?.knownPeople,
  )
    ? input.userProfileContext.knownPeople
    : [];
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
  const reviewThreshold = settingNumber(
    pipelineSettings,
    "parser_review_threshold",
    settingNumber(pipelineSettings, "confidence_review", 60),
  );

  // Helper to count amounts
  const countAmounts = (text: string): number => {
    const digitMatches = text.match(/\d+(?:[.,]\d+)?/g);
    const textualAmountWords = new Set([
      "عشرين",
      "تلاتين",
      "ثلاثين",
      "اربعين",
      "أربعين",
      "خمسين",
      "ستين",
      "سبعين",
      "تمانين",
      "ثمانين",
      "تسعين",
      "ميه",
      "مية",
      "ميتين",
      "ألف",
      "الف",
      "آلاف",
      "تلاف",
      "مليون",
      "ارنب",
      "أرنب",
      "باكو",
      "باكوين",
      "نص",
      "ربع",
      "تلت",
    ]);
    const textualMatches = text
      .split(/\s+/)
      .map((word) => word.replace(/[^\u0600-\u06FF]/g, ""))
      .filter((word) => textualAmountWords.has(word));
    return (digitMatches ? digitMatches.length : 0) + textualMatches.length;
  };
  
  const countWords = (text: string): number => {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  };
  
  const numAmounts = countAmounts(normalizedText);
  const numWords = countWords(normalizedText);

  // 1.5 Pre-filtering logic (Prevent AI Hallucination & Token Waste)
  if (numAmounts === 0) {
    const strongFinancialKeywords = ["صرفت", "حولت", "بعت", "خدت", "قبضت", "دفعت", "اشتريت", "جبت", "سلف", "دين", "حساب", "اديت"];
    const hasFinancialKeyword = strongFinancialKeywords.some(kw => normalizedText.includes(kw));
    
    if (!hasFinancialKeyword && numWords > 2) {
       return {
          items: [],
          overallConfidence: 0,
          clarificationQuestion: "عذراً، لم أتمكن من العثور على معاملة مالية واضحة (مبلغ أو عملية) في كلامك.",
          decision: "clarify",
          tokensUsed: 0,
          parsedBy: "system",
          modelUsed,
          processingTimeMs: Date.now() - startTime,
          log: {
            originalText: input.text,
            normalizedText,
            finalConfidence: 0,
            finalDecision: "clarify",
            routing: { route: "system_prefilter", reason: "no_amounts_found" },
          },
       };
    }
  }

  // 2. Try Rule Engine for simple cases (1 amount, short sentence)
  let ruleResult: Awaited<ReturnType<typeof runRuleEngine>> | null = null;
  let ruleSucceeded = false;
  const decomposition: DecompositionResult = decompositionEnabled
    ? decomposeHeuristic(input.text)
    : { segments: [], method: "simple", isComplex: false };

  const localSucceededItems: ParsedTransaction[] = [];
  const failedSegments: typeof decomposition.segments = [];

  // Fast path for long/multi-transaction narratives: classify each segment locally.
  if (decomposition.segments.length > 1) {
    let localClarification: string | undefined;
    const localUnknownNames: string[] = [];
    const knownNames = knownPeople.map((p) => p.name).filter(Boolean);

    for (const segment of decomposition.segments) {
      const segmentText = segment.text.trim();
      const segmentTextWithVerb = (segment.linkedVerb && !segmentText.includes(segment.linkedVerb))
        ? `${segment.linkedVerb} ${segmentText}`
        : segmentText;
        
      const segmentNormalized = normalizeV2(segmentTextWithVerb).forRules;
      const segmentRule = await runRuleEngine(
        segmentNormalized,
        input.userDict,
        input.userProfileContext,
      );
      let bestItem = segmentRule.items[0];

      if (!bestItem) {
        failedSegments.push(segment);
        continue;
      }

      const candidates = pickAllPersonCandidates(
        bestItem.person_mentioned || segment.personMentioned,
        segmentTextWithVerb,
        knownNames,
      );

      let anyNeedsClarification = false;
      const segmentResolvedItems: ParsedTransaction[] = [];

      if (candidates.length > 0) {
        const splitAmount = numAmounts === 1 && candidates.length > 1 
          ? Number((bestItem.amount / candidates.length).toFixed(2)) 
          : bestItem.amount;

        for (const candidateName of candidates) {
          const clonedItem = { ...bestItem, amount: splitAmount };
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
        segmentResolvedItems.push(bestItem);
      }

      const isPro = input.userPlan === "pro" || input.userPlan === "ultra";
      const threshold = isPro ? Math.max(autoSaveThreshold, 90) : autoSaveThreshold;

      const passedItems = segmentResolvedItems.filter(it => 
        (it.confidence >= threshold && it.category !== "متنوعات") || 
        anyNeedsClarification
      );
      
      if (passedItems.length === 0) {
        failedSegments.push(segment);
        continue;
      }
      
      localSucceededItems.push(...segmentResolvedItems);

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
    ruleResult = await runRuleEngine(normalizedText, input.userDict, input.userProfileContext);
    
    if (ruleResult.items.length > 0) {
      let bestItem = ruleResult.items.reduce((prev, current) => 
        (prev.confidence > current.confidence) ? prev : current
      );
      const knownNames = knownPeople.map((p) => p.name).filter(Boolean);
      const candidates = pickAllPersonCandidates(
        bestItem.person_mentioned,
        input.text,
        knownNames,
      );
      
      const segmentResolvedItems: ParsedTransaction[] = [];
      let localClarification: string | undefined;
      const localUnknownNames: string[] = [];
      let anyNeedsClarification = false;

      if (candidates.length > 0) {
        const splitAmount = numAmounts === 1 && candidates.length > 1 
          ? Number((bestItem.amount / candidates.length).toFixed(2)) 
          : bestItem.amount;

        for (const candidateName of candidates) {
          const clonedItem = { ...bestItem, amount: splitAmount };
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
        segmentResolvedItems.push(bestItem);
      }

      if (anyNeedsClarification) {
        const uniqueUnknowns = Array.from(new Set(localUnknownNames));
        localClarification = uniqueUnknowns.length === 1 
          ? `مين ${uniqueUnknowns[0]}؟ (أخوك، صديقك، موظف عندك...)`
          : `محتاج أوضح دول مين: ${uniqueUnknowns.join(" و ")}؟`;
        
        finalItems.push(...segmentResolvedItems);
        ruleSucceeded = true;
        decision = "clarify";
        clarificationQuestion = localClarification;
        overallConfidence = 0;
      } else {
         bestItem = segmentResolvedItems[0];
      }
      
      const isPro = input.userPlan === "pro" || input.userPlan === "ultra";

      if (ruleSucceeded) {
        // Handled
      } else if (isPro) {
        if (bestItem.confidence >= Math.max(autoSaveThreshold, 90) && bestItem.category !== "متنوعات") {
            finalItems.push(...segmentResolvedItems);
            ruleSucceeded = true;
            decision = "auto_save";
            overallConfidence = bestItem.confidence;
        }
      } else {
        if (bestItem.confidence >= autoSaveThreshold && bestItem.category !== "متنوعات") {
            finalItems.push(...segmentResolvedItems);
            ruleSucceeded = true;
            decision = "auto_save";
            overallConfidence = bestItem.confidence;
        } else if (bestItem.confidence >= reviewThreshold && bestItem.confidence < autoSaveThreshold && bestItem.category !== "متنوعات") {
            finalItems.push(...segmentResolvedItems);
            ruleSucceeded = true;
            decision = "clarify";
            clarificationQuestion = `هل تقصد تسجيل مصروف بقيمة ${bestItem.amount} جنيه في قسم "${bestItem.category}"؟`;
            overallConfidence = bestItem.confidence;
        }
      }
    }
  }

  // Force local acceptance for massive inputs to avoid 429 rate limit death
  if (!ruleSucceeded && (numAmounts > 5 || numWords > 30)) {
    // If we have failed segments but the text is massive, we MUST NOT use AI.
    // Re-run the rule engine on the whole thing and just accept whatever it gives, or accept the failed segments.
    // For simplicity, we just dump localSucceededItems + whatever we can get from failed.
    ruleSucceeded = true;
    for (const seg of failedSegments) {
      const segRule = await runRuleEngine(seg.text, input.userDict, input.userProfileContext);
      if (segRule.items.length > 0) finalItems.push(...segRule.items);
    }
  }

  // 3. Single-Pass Semantic Extraction (AI)
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
            }).slice(0, 5)
          : [];

        if (matchedTx.length > 0) {
          userHistoryContext = matchedTx.map(tx => `- "${tx.item_name}" -> ${tx.main_category}/${tx.sub_category || "عام"}`).join("\n");
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

    const systemPrompt = buildSmartSystemPrompt(
      textToClassify,
      knownPeople.map((p) => ({
        name: p.name,
        relationship: p.relationship || "شخص معروف",
        category: p.category || "تحويل",
        subCategory: p.subCategory || "تحويلات شخصية",
      })),
      undefined,
      useSimpleSchema,
      userHistoryContext,
      userHistoryCategories,
      numAmountsToClassify
    );
    
    const classifierUserPrompt = buildGlobalVerifierPrompt(
      textToClassify,
      filteredDecomp,
    );
    let classItems: any[] = [];
    try {
      if (provider === "groq") {
        const result = await callGroqAPI(
          input.groqApiKey || input.apiKey,
          modelUsed,
          systemPrompt,
          classifierUserPrompt,
          input.maxTokens || 4096
        );
        totalTokens += result.tokensUsed;
        const cleanedText = result.text.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
        classItems = safeExtractItems(robustJsonParse(cleanedText));
      } else {
        const genAI = new GoogleGenerativeAI(input.apiKey);
        const geminiModel = genAI.getGenerativeModel({
          model: modelUsed,
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema,
          },
        });

        const dRes = await geminiModel.generateContent(classifierUserPrompt);
        totalTokens += dRes.response.usageMetadata?.totalTokenCount || 0;
        const cleanedText = dRes.response.text().replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
        classItems = safeExtractItems(JSON.parse(cleanedText));
      }

      if (classItems.length === 0) {
         if (numAmounts <= 3 && numWords <= 15) {
              if (!ruleResult) {
                 ruleResult = await runRuleEngine(normalizedText, input.userDict, input.userProfileContext);
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
            
            let namesList = detectedPersonName ? detectedPersonName.split(/\s+و\s+|،|,|and/).map(n => n.trim()).filter(Boolean) : [];
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
      console.error("Smart Pipeline Single-Pass AI Error:", err);
      if (numAmounts <= 3 && numWords <= 15) {
          const fallbackRuleResult = await runRuleEngine(textToClassify, input.userDict, input.userProfileContext);
          if (fallbackRuleResult.items.length > 0) {
             finalItems.push(...fallbackRuleResult.items);
          }
      } else {
         decision = "clarify";
         clarificationQuestion = "عذراً، حدث خطأ في السيرفر أثناء معالجة الجملة الطويلة. يرجى تقسيمها أو المحاولة لاحقاً.";
      }
    }
  }

  // --- DEEP FIX: Reconciliation Layer (Amount Matching) ---
  if (finalItems.length > 0 && decision === "unknown") {
      const deterministicAmounts = extractAmounts(input.text).map(a => a.amount);
      const aiAmounts = finalItems.map(i => i.amount);
      
      const missingAmounts = deterministicAmounts.filter(da => !aiAmounts.includes(da));
      
      if (missingAmounts.length > 0) {
          console.warn(`[Reconciliation] AI/Rules missed amounts: ${missingAmounts.join(", ")}. Attempting recovery...`);
          if (!ruleResult) {
              ruleResult = await runRuleEngine(normalizedText, input.userDict, input.userProfileContext);
          }
          
          for (const missing of missingAmounts) {
              const recoveredItem = ruleResult.items.find(ri => ri.amount === missing);
              if (recoveredItem) {
                  finalItems.push(recoveredItem);
                  console.warn(`[Reconciliation] Successfully recovered amount ${missing} using deterministic rules!`);
              } else if (!input.skipClarification) {
                  decision = "clarify";
                  clarificationQuestion = `لقد ذكرت مبلغ ${missing} ولكن السياق غير واضح لتصنيفه. في إيه صرفته؟`;
                  overallConfidence = 0;
                  break;
              }
          }
      }
  }

  // --- DEEP FIX: Logical Amount Thresholds ---
  for (const item of finalItems) {
      if ((item.category === "استثمار" || item.category === "عقارات") && item.amount < 50) {
          item.category = "متنوعات";
          item.subCategory = "عام";
      } else if (item.category === "مرتب" && item.amount < 100) {
          item.category = "هدايا وصدقات";
          item.subCategory = "عيدية";
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
                  console.log(`[Reverse Mapping] Rescued '${item.description}' into ${item.category}/${item.subCategory} using bigram '${bigram}'`);
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
                      console.log(`[Reverse Mapping] SUB_CATEGORY_MAP rescued '${item.description}' → ${item.category}/${item.subCategory} via '${word}'`);
                      break;
                  }
              }
          }
      }
  }

  const verification = verifierEnabled
    ? verifyClassifiedItems(
        normalizedFinalItems,
        input.text,
        input.monthlyContext
          ? {
              totalIncome: Number(input.monthlyContext.totalIncome || 0),
              totalExpense: Number(input.monthlyContext.totalExpense || 0),
            }
          : undefined,
      )
    : {
        items: normalizedFinalItems,
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
  };

  return {
    items: verifiedFinalItems,
    parsedBy: requiresAI ? "hybrid" : "rule_engine",
    modelUsed,
    overallConfidence,
    decision,
    clarificationQuestion,
    alertMessage: firstAlertMessage,
    tokensUsed: totalTokens,
    processingTimeMs: Date.now() - startTime,
    log,
  };
}
