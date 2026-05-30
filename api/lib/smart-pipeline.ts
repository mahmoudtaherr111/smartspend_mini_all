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
import { normalizeRelationship } from "./relationship-normalizer";

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
}

export interface PipelineLog {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  timestamp: string;
}

export interface PipelineResult {
  items: ParsedTransaction[];
  decision: "auto_save" | "review" | "clarify";
  clarificationQuestion?: string;
  overallConfidence: number;
  tokensUsed: number;
  parsedBy: string;
  logs: PipelineLog[];
}

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
  const knownPeople = input.userProfileContext?.knownPeople || [];

  // Helper to count amounts
  const countAmounts = (text: string): number => {
    const digitMatches = text.match(/\d+(?:[.,]\d+)?/g);
    const textualMatches = text.match(/(?:عشرين|تلاتين|ثلاثين|اربعين|أربعين|خمسين|ستين|سبعين|تمانين|ثمانين|تسعين|ميه|مية|ميتين|ألف|الف|آلاف|تلاف|مليون|جنيه)/g);
    return (digitMatches ? digitMatches.length : 0) + (textualMatches ? textualMatches.length : 0);
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
          requiresAI: false,
          overallConfidence: 0,
          clarificationQuestion: "عذراً، لم أتمكن من العثور على معاملة مالية واضحة (مبلغ أو عملية) في كلامك.",
          decision: "clarify",
          tokensUsed: 0,
          parsedBy: "system",
          logs: [],
       };
    }
  }

  // 2. Try Rule Engine for simple cases (1 amount, short sentence)
  let ruleResult: ReturnType<typeof runRuleEngine> | null = null;
  let ruleSucceeded = false;
  
  // Only trust Rule Engine for short phrases (<= 8 words) with max 1 amount
  if (numAmounts <= 1 && numWords <= 8) {
    ruleResult = runRuleEngine(normalizedText, input.userDict, input.userProfileContext);
    
    if (ruleResult.items.length > 0) {
      const bestItem = ruleResult.items.reduce((prev, current) => 
        (prev.confidence > current.confidence) ? prev : current
      );
      
      const isPro = input.userPlan === "pro" || input.userPlan === "ultra";

      if (isPro) {
        // Pro: Must be >= 90 to trust Rule Engine. Otherwise fallback to AI immediately.
        if (bestItem.confidence >= 90 && bestItem.category !== "متنوعات") {
           finalItems.push(bestItem);
           ruleSucceeded = true;
           decision = "auto_save";
           overallConfidence = bestItem.confidence;
        }
      } else {
        // Free: >= 83 triggers auto_save. 
        // >= 75 and < 83 triggers a clarification/review prompt instead of AI.
        if (bestItem.confidence >= 83 && bestItem.category !== "متنوعات") {
           finalItems.push(bestItem);
           ruleSucceeded = true;
           decision = "auto_save";
           overallConfidence = bestItem.confidence;
        } else if (bestItem.confidence >= 75 && bestItem.confidence < 83 && bestItem.category !== "متنوعات") {
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
    const systemPrompt = buildSmartSystemPrompt(input.text, knownPeople);
    
    let classItems: any[] = [];
    try {
      if (provider === "groq") {
        const result = await callGroqAPI(
          input.groqApiKey || input.apiKey,
          modelUsed,
          systemPrompt,
          `النص:\\n${input.text}`,
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

        const dRes = await geminiModel.generateContent(`النص:\\n${input.text}`);
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
            let itemClarify = item.needsClarification;
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

            if (detectedPersonName && detectedPersonName !== "") {
               const pName = detectedPersonName;
               const hasRel = item.person_relationship && typeof item.person_relationship === "string" && item.person_relationship.trim() !== "";
               
               let isKnown = false;
               for (const knownPerson of knownPeople) {
                  if (matchArabicPhrase(pName, knownPerson.name) || matchArabicPhrase(knownPerson.name, pName)) {
                      isKnown = true;
                      // Fallback: If AI missed the relationship but we know the person, fill it in!
                      if (!hasRel && knownPerson.subCategory) {
                          item.person_relationship = knownPerson.subCategory;
                      }
                      break;
                  }
               }
               
               let verifiedRel = hasRel;
               if (!isKnown && hasRel) {
                  // Verify if the AI hallucinated the relationship
                  const relStr = String(item.person_relationship);
                  const familyKw = ["اخ", "اخت", "اب", "ام", "عم", "خال", "مرات", "زوج", "ابن", "بنت", "عائله", "قريب"];
                  const friendKw = ["صاحب", "صديق", "زميل", "معرف", "شله"];
                  const workerKw = ["شغال", "موظف", "صنايعي", "بواب", "عامل", "سواق"];
                  
                  let hasEvidence = false;
                  const textToCheck = normalizeArabicString(input.text);
                  const normalizedRelStr = normalizeArabicString(relStr);
                  
                  if (normalizedRelStr.includes("صديق") || normalizedRelStr.includes("صاحب") || normalizedRelStr.includes("اصدقاء")) {
                     hasEvidence = friendKw.some(kw => textToCheck.includes(kw));
                  } else if (normalizedRelStr.includes("عائل") || normalizedRelStr.includes("اخ") || normalizedRelStr.includes("قريب")) {
                     hasEvidence = familyKw.some(kw => textToCheck.includes(kw));
                  } else if (normalizedRelStr.includes("موظف") || normalizedRelStr.includes("عامل")) {
                     hasEvidence = workerKw.some(kw => textToCheck.includes(kw));
                  } else {
                     // If it's a generic or unknown relationship, we don't trust it without evidence
                     hasEvidence = false;
                  }
                  
                  if (!hasEvidence) {
                     // AI Hallucinated! Neutralize it.
                     verifiedRel = false;
                     item.person_relationship = null;
                     item.main_category = "متنوعات";
                     item.sub_category = "أشخاص";
                  }
               }

               if (!isKnown && !verifiedRel) {
                 itemClarify = true;
                 itemClarifyQ = `مين ${pName}؟ (أخوك، صديقك، موظف عندك...)`;
               }
            }

            if (itemClarify && !input.skipClarification) {
                decision = "clarify";
                clarificationQuestion = itemClarifyQ;
                overallConfidence = 0;
            }
            
            if (item.alertMessage && item.alertMessage.toLowerCase() !== "ok" && !firstAlertMessage) {
                firstAlertMessage = item.alertMessage;
            }

            // --- DEEP FIX: Force Taxonomy for Human Relationships ---
            let forcedCategory = item.main_category || item.category || item.mainCategory;
            let forcedSubCategory = item.sub_category || item.subCategory || item.sub_category;

            const finalRel = item.person_relationship;
            if (finalRel && typeof finalRel === "string" && finalRel.trim() !== "") {
                const normRel = normalizeRelationship(finalRel);
                if (["العائلة", "أصدقاء", "موظفين"].includes(normRel.category)) {
                    forcedCategory = normRel.category;
                    forcedSubCategory = normRel.subCategory;
                    // Reset confidence to a high number if it was low, because we are certain of the person
                    if ((item.confidence || 0) < 85 && !itemClarify) {
                        item.confidence = 90;
                    }
                }
            }
            
            finalItems.push({
                amount: Number(item.amount) || Number(item.price) || Number(item.value) || 0,
                category: forcedCategory,
                subCategory: forcedSubCategory,
                description: item.item_name || item.description || item.name || "عملية",
                type: item.type === "income" ? "income" : item.type === "transfer" ? "transfer" : item.type === "investment" ? "investment" : "expense",
                confidence: item.confidence || 0,
                needsReview: (item.confidence || 0) < 85,
                parsedBy: "ai",
                inferenceSource: "ai",
                currency: "EGP",
                person_mentioned: item.person_mentioned,
                person_relationship: item.person_relationship,
            });
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

  // Normalize Taxonomy
  const normalizedFinalItems = normalizeTransactionTaxonomyList(finalItems, input.text);

  if (decision === "unknown") {
      if (normalizedFinalItems.length > 0) {
          overallConfidence = Math.round(
            normalizedFinalItems.reduce((acc, curr) => acc + curr.confidence, 0) /
              normalizedFinalItems.length
          );
          decision = overallConfidence >= 85 ? "auto_save" : "review";
      } else {
          decision = "clarify";
          clarificationQuestion = "عذراً، لم أتمكن من استخراج عملية مالية واضحة. ممكن توضح؟";
          overallConfidence = 0;
      }
  }

  const log: PipelineLog = {
    originalText: input.text,
    normalizedText: normalizedText,
    entitiesFound: {
      amountCount: normalizedFinalItems.length,
      people: [],
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
      succeeded: normalizedFinalItems.length > 0,
      modelUsed,
      routeReason: "smart_pipeline_fallback",
    },
    routing: { route: "smart_hybrid", reason: "v3_architecture" },
    finalConfidence: overallConfidence,
    finalDecision: decision,
  };

  return {
    items: normalizedFinalItems,
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
