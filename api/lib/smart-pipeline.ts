import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { normalizeV2 } from "./normalizer-v2";
import { runRuleEngine } from "./rule-engine";
import { buildSmartSystemPrompt } from "./dynamic-prompt-builder";
import { normalizeTransactionTaxonomyList } from "./category-registry";
import { callGroqAPI } from "./groq-client";
import { mapModelName } from "./model-mapper";
import type { ParsedTransaction } from "./rule-engine";
import { matchArabicPhrase } from "./fuzzy-match";
import { extractPeople, extractAmounts } from "./entity-extractor";
import { decomposeHeuristic, type DecompositionResult } from "./narrative-decomposer";
import { verifyClassifiedItems } from "./post-classifier-verifier";
import { cleanPersonName, resolvePersonForTransaction } from "./person-resolver";

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
  required: ["decomposed_sentences", "items"],
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

/**
 * Normalizes dynamic JSON outputs from different LLM providers into a standard array.
 */
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

/**
 * Attempts to parse broken JSON by finding array or object brackets
 */
function robustJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    // If strict parsing fails, try to extract the JSON part from the text
    console.warn("[JSON Fallback] Strict parse failed, attempting regex extraction...");
    const match = text.match(/\[.*\]|\{.*\}/s);
    if (match) {
      try {
        // Replace common LLM mistakes (like trailing commas)
        const fixedStr = match[0]
          .replace(/,\s*([}\]])/g, "$1") // Remove trailing commas
          .replace(/'/g, '"'); // Replace single quotes with double quotes
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
  return /(?:سلف|سلفة|سلفه|دين|قرض|استلف|استلفت)/.test(text);
}

function isDirectedPersonPayment(text: string, candidateName?: string | null): boolean {
  const compactText = normalizeArabicString(text);
  const compactName = candidateName ? normalizeArabicString(candidateName) : "";
  const hasDirectedVerb = /(?:اديت|أديت|عطيت|حولت|بعت|سلفت|دفعتل|دفعتلل)/.test(
    compactText,
  );
  const hasLamName =
    compactName.length >= 2 &&
    (compactText.includes(`ل${compactName}`) ||
      compactText.includes(`لل${compactName}`));

  return hasDirectedVerb || hasLamName;
}

function shouldResolvePerson(
  transactionText: string,
  candidateName: string | null | undefined,
  category?: string | null,
): boolean {
  if (!candidateName) return false;
  if (["العائلة", "أصدقاء", "موظفين"].includes(String(category || ""))) {
    return true;
  }
  return isDirectedPersonPayment(transactionText, candidateName);
}

function pickPersonCandidate(
  preferred: string | null | undefined,
  transactionText: string,
  knownNames: string[],
): string | null {
  const cleanedPreferred = cleanPersonName(preferred);
  if (cleanedPreferred) return cleanedPreferred;

  const extracted = extractPeople(transactionText, knownNames)
    .map((name) => cleanPersonName(name))
    .find(Boolean);
  if (extracted) return extracted;

  const directedMatch = transactionText.match(
    /(?:^|\s)(?:اديت|أديت|عطيت|حولت|بعت|سلفت|دفعتل|دفعت\s+ل)\s+(?:ل|لـ|لل)?\s*([\u0600-\u06FF]{2,})/u,
  );
  return cleanPersonName(directedMatch?.[1]);
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
  if (!shouldResolvePerson(transactionText, candidateName, item.category)) {
    return { item, needsClarification: false };
  }

  const resolution = resolvePersonForTransaction({
    candidateName,
    transactionText,
    originalText,
    knownPeople,
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
    return {
      item: {
        ...next,
        category: "متنوعات",
        subCategory: "أشخاص",
        confidence: Math.min(next.confidence, 60),
        needsReview: true,
      },
      needsClarification: true,
      clarificationQuestion: resolution.clarificationQuestion,
    };
  }

  if (resolution.category && resolution.subCategory) {
    next.category = resolution.category;
    next.subCategory = resolution.subCategory;
    if (!hasLoanIntent(transactionText) && ["العائلة", "أصدقاء", "موظفين"].includes(next.category)) {
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
  if (!decomposition || decomposition.segments.length <= 1) {
    return `النص:\n${originalText}`;
  }

  const segmentLines = decomposition.segments
    .map(
      (seg) =>
        `- [${seg.segmentIndex + 1}] text="${seg.text}" amount=${seg.amount ?? "unknown"} direction=${seg.direction}`,
    )
    .join("\n");

  return `النص الأصلي:\n${originalText}\n\nخريطة مبدئية للعمليات والمبالغ، استخدمها لمنع نسيان أي مبلغ أو خلط السياقات:\n${segmentLines}`;
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
  
  // 1. Normalize
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
    
    // Allow if there is a known keyword or if it's very short (maybe a fixed recurring expense like "بنزين")
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
  let ruleResult: ReturnType<typeof runRuleEngine> | null = null;
  let ruleSucceeded = false;
  const decomposition: DecompositionResult = decompositionEnabled
    ? decomposeHeuristic(input.text)
    : { segments: [], method: "simple", isComplex: false };

  // Fast path for long/multi-transaction narratives: classify each segment locally.
  // This keeps the common case under a second and reserves the LLM for ambiguity.
  if (decomposition.segments.length > 1) {
    const segmentItems: ParsedTransaction[] = [];
    let canResolveLocally = true;
    let localClarification: string | undefined;
    const knownNames = knownPeople.map((p) => p.name).filter(Boolean);

    for (const segment of decomposition.segments) {
      const segmentText = segment.text.trim();
      const segmentNormalized = normalizeV2(segmentText).forRules;
      const segmentRule = runRuleEngine(
        segmentNormalized,
        input.userDict,
        input.userProfileContext,
      );
      let bestItem = segmentRule.items[0];

      if (!bestItem) {
        canResolveLocally = false;
        break;
      }

      const candidateName = pickPersonCandidate(
        bestItem.person_mentioned || segment.personMentioned,
        segmentText,
        knownNames,
      );
      const personApplied = personMemoryEnabled
        ? applyPersonResolution(
            bestItem,
            candidateName,
            segmentText,
            input.text,
            knownPeople,
          )
        : { item: bestItem, needsClarification: false, clarificationQuestion: undefined };
      bestItem = personApplied.item;

      segmentItems.push(bestItem);

      if (personApplied.needsClarification) {
        localClarification = personApplied.clarificationQuestion;
        canResolveLocally = false;
        break;
      }

      if (bestItem.confidence < 78 || bestItem.category === "متنوعات") {
        canResolveLocally = false;
        break;
      }
    }

    if (segmentItems.length > 0 && (canResolveLocally || localClarification)) {
      finalItems.push(...segmentItems);
      ruleSucceeded = true;
      decision = localClarification ? "clarify" : "auto_save";
      clarificationQuestion = localClarification;
      overallConfidence = localClarification
        ? 0
        : Math.round(
            segmentItems.reduce((sum, item) => sum + item.confidence, 0) /
              segmentItems.length,
          );
    }
  }
  
  // Only trust Rule Engine for short phrases (<= 8 words) with max 1 amount
  if (!ruleSucceeded && numAmounts <= 1 && numWords <= 8) {
    ruleResult = runRuleEngine(normalizedText, input.userDict, input.userProfileContext);
    
    if (ruleResult.items.length > 0) {
      let bestItem = ruleResult.items.reduce((prev, current) => 
        (prev.confidence > current.confidence) ? prev : current
      );
      const knownNames = knownPeople.map((p) => p.name).filter(Boolean);
      const candidateName = pickPersonCandidate(
        bestItem.person_mentioned,
        input.text,
        knownNames,
      );
      const personApplied = personMemoryEnabled
        ? applyPersonResolution(
            bestItem,
            candidateName,
            input.text,
            input.text,
            knownPeople,
          )
        : { item: bestItem, needsClarification: false, clarificationQuestion: undefined };
      bestItem = personApplied.item;

      if (personApplied.needsClarification) {
        finalItems.push(bestItem);
        ruleSucceeded = true;
        decision = "clarify";
        clarificationQuestion = personApplied.clarificationQuestion;
        overallConfidence = 0;
      }
      
      const isPro = input.userPlan === "pro" || input.userPlan === "ultra";

      if (ruleSucceeded) {
        // Person clarification already decided the response.
      } else if (isPro) {
        // Pro: Must be >= 90 to trust Rule Engine. Otherwise fallback to AI immediately.
        if (bestItem.confidence >= Math.max(autoSaveThreshold, 90) && bestItem.category !== "متنوعات") {
           finalItems.push(bestItem);
           ruleSucceeded = true;
           decision = "auto_save";
           overallConfidence = bestItem.confidence;
        }
      } else {
        // Free: >= 83 triggers auto_save. 
        // >= 75 and < 83 triggers a clarification/review prompt instead of AI.
        if (bestItem.confidence >= autoSaveThreshold && bestItem.category !== "متنوعات") {
           finalItems.push(bestItem);
           ruleSucceeded = true;
           decision = "auto_save";
           overallConfidence = bestItem.confidence;
        } else if (bestItem.confidence >= reviewThreshold && bestItem.confidence < autoSaveThreshold && bestItem.category !== "متنوعات") {
           finalItems.push(bestItem);
           ruleSucceeded = true;
           decision = "clarify"; // Force review by user
           clarificationQuestion = `هل تقصد تسجيل مصروف بقيمة ${bestItem.amount} جنيه في قسم "${bestItem.category}"؟`;
           overallConfidence = bestItem.confidence;
        }
      }
    }
  }

  // 3. Single-Pass Semantic Extraction (AI)
  if (!ruleSucceeded) {
    requiresAI = true;
    
    // Pass the raw text directly to the AI
    const systemPrompt = buildSmartSystemPrompt(
      input.text,
      knownPeople.map((p) => ({
        name: p.name,
        relationship: p.relationship || "شخص معروف",
        category: p.category || "تحويل",
        subCategory: p.subCategory || "تحويلات شخصية",
      })),
    );
    
    const classifierUserPrompt = buildGlobalVerifierPrompt(
      input.text,
      decomposition,
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
            responseSchema: SMART_CLASSIFIER_SCHEMA,
          },
        });

        const dRes = await geminiModel.generateContent(classifierUserPrompt);
        totalTokens += dRes.response.usageMetadata?.totalTokenCount || 0;
        const cleanedText = dRes.response.text().replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
        classItems = safeExtractItems(JSON.parse(cleanedText));
      }

      // Fallback to Rule Engine if AI fails or returns empty array
      if (classItems.length === 0) {
         if (numAmounts <= 3 && numWords <= 15) {
             if (!ruleResult) {
                ruleResult = runRuleEngine(normalizedText, input.userDict, input.userProfileContext);
             }
             if (ruleResult.items.length > 0) {
                finalItems.push(...ruleResult.items);
             }
         } else {
             decision = "clarify";
             clarificationQuestion = "عذراً، الجملة طويلة ومفصلة ولم أتمكن من استخراج العمليات. يرجى تقسيمها أو إعادة المحاولة.";
         }
      } else {
        // Pre-extract all people from the text using the deterministic regex/dictionary extractor
        const allKnownNames = knownPeople.map(p => p.name);
        const deterministicPeople = extractPeople(input.text, allKnownNames);

        // Process AI results
        for (const item of classItems) {
            let itemClarify = Boolean(item.needsClarification);
            let itemClarifyQ = item.clarificationQuestion || "ممكن توضح أكتر؟";
            
            // Safety Switch (is_valid_transaction) & Confidence Trap
            const conf = item.confidence || 0;
            if (item.is_valid_transaction === false) {
                 itemClarify = true;
                 itemClarifyQ = "عفواً، لم أتمكن من العثور على معاملة مالية صحيحة أو منطقية في كلامك.";
            } else if (conf < 60 && !input.skipClarification) {
                 itemClarify = true;
                 itemClarifyQ = "عفواً، كلامك مش واضح بالنسبالي أو ناقص، ممكن تعيد صياغته بشكل أوضح؟";
            }

            // --- DEEP FIX: Robust Person Extraction & Clarification ---
            let detectedPersonName = item.person_mentioned && typeof item.person_mentioned === "string" ? item.person_mentioned.trim() : null;
            
            // If AI missed it but our deterministic extractor found a person in this item's context (or global text for short items)
            if (!detectedPersonName) {
               // See if any of the deterministically extracted people are mentioned in this item's description
               for (const dp of deterministicPeople) {
                  const desc = item.item_name || item.description || item.name || "";
                  // Safe fallback to text ONLY IF there is a single transaction. Otherwise, strictly use description.
                  if (matchArabicPhrase(desc, dp) || (classItems.length === 1 && matchArabicPhrase(input.text, dp))) { 
                      detectedPersonName = dp;
                      item.person_mentioned = dp;
                      break;
                  }
               }
            }
            detectedPersonName = pickPersonCandidate(
              detectedPersonName,
              item.item_name || item.description || item.name || input.text,
              allKnownNames,
            );

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

            const itemContext = item.item_name || item.description || item.name || input.text;
            const personApplied = personMemoryEnabled
              ? applyPersonResolution(
                  parsedItem,
                  detectedPersonName || parsedItem.person_mentioned || null,
                  itemContext,
                  input.text,
                  knownPeople,
                )
              : {
                  item: parsedItem,
                  needsClarification: false,
                  clarificationQuestion: undefined,
                };
            parsedItem = personApplied.item;

            if (personApplied.needsClarification) {
              itemClarify = true;
              itemClarifyQ = personApplied.clarificationQuestion || itemClarifyQ;
            }

            if (itemClarify && !input.skipClarification) {
                decision = "clarify";
                clarificationQuestion = itemClarifyQ;
                overallConfidence = 0;
            }

            finalItems.push(parsedItem);
        }
      }
    } catch (err) {
      console.error("Smart Pipeline Single-Pass AI Error:", err);
      // Fallback to Rule Engine ONLY if it's not a complex sentence
      if (numAmounts <= 3 && numWords <= 15) {
          if (!ruleResult) {
             ruleResult = runRuleEngine(normalizedText, input.userDict, input.userProfileContext);
          }
          if (ruleResult.items.length > 0) {
             finalItems.push(...ruleResult.items);
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
      
      // Find amounts that were extracted by regex but dropped/hallucinated by AI
      const missingAmounts = deterministicAmounts.filter(da => !aiAmounts.includes(da));
      
      if (missingAmounts.length > 0) {
          console.warn(`[Reconciliation] AI missed amounts: ${missingAmounts.join(", ")}. Attempting recovery...`);
          if (!ruleResult) {
              ruleResult = runRuleEngine(normalizedText, input.userDict, input.userProfileContext);
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

  // Normalize taxonomy, then run the local verifier as the final gate before saving/review.
  const normalizedFinalItems = normalizeTransactionTaxonomyList(finalItems, input.text);
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
