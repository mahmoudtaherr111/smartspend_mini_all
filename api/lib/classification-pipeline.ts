/**
 * SmartSpend Classification Pipeline
 * Orchestrates the full 7-step processing pipeline
 * Step 1: Normalize → Step 2: Extract → Step 3: Intent → Step 4: Rules → Step 5: AI → Step 6: Confidence → Step 7: Decision
 */

import { normalizeText } from "./text-normalizer";
import { extractEntities } from "./entity-extractor";
import { runRuleEngine, type ParsedTransaction } from "./rule-engine";
import { aiClassify, geminiSpeechToText } from "./ai-classifier";
import { scoreAndDecide, DEFAULT_THRESHOLDS, type ScoredResult } from "./confidence-scorer";
import { db } from "../queries/connection";
import { systemSettings } from "../../db/schema";

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
  monthlyContext: { totalIncome: number; totalExpense: number };
  skipClarification?: boolean;
}

export interface PipelineResult {
  items: ParsedTransaction[];
  parsedBy: "rule_engine" | "ai" | "hybrid";
  modelUsed: string;
  overallConfidence: number;
  decision: "auto_save" | "review" | "clarify";
  clarificationQuestion?: string;
  alertMessage?: string | null;
  tokensUsed: number;
  processingTimeMs: number;
  log: PipelineLog;
}

export interface PipelineLog {
  originalText: string;
  normalizedText: string;
  entitiesFound: { amountCount: number; people: string[]; merchants: string[] };
  ruleEngineResult: { attempted: boolean; succeeded: boolean; reason?: string };
  aiResult: { attempted: boolean; succeeded: boolean; modelUsed?: string };
  finalConfidence: number;
  finalDecision: string;
}

function postProcessItems(items: ParsedTransaction[]): ParsedTransaction[] {
  const byKey = new Map<string, ParsedTransaction>();
  for (const item of items) {
    const key = `${item.type}|${item.amount}|${item.category}|${item.subCategory}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      continue;
    }

    // Keep higher confidence item and merge sparse fields.
    const winner = prev.confidence >= item.confidence ? prev : item;
    const loser = winner === prev ? item : prev;
    byKey.set(key, {
      ...winner,
      description: winner.description || loser.description,
      merchant: winner.merchant || loser.merchant,
      ambiguityFlags: [...(winner.ambiguityFlags || []), ...(loser.ambiguityFlags || [])],
    });
  }
  return Array.from(byKey.values());
}

/**
 * Get confidence thresholds from admin settings
 */
async function getThresholds(): Promise<typeof DEFAULT_THRESHOLDS> {
  try {
    const settings = await db.select().from(systemSettings);
    const cfg: Record<string, string> = {};
    settings.forEach(s => { if (s.value) cfg[s.key] = s.value; });

    return {
      autoSave: parseInt(cfg.confidence_auto_save || "85"),
      review: parseInt(cfg.confidence_review || "60"),
      clarify: 0,
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

/**
 * Run the full classification pipeline
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const startTime = Date.now();
  const thresholds = await getThresholds();

  // ── Step 1: Normalize Text ──
  const normalizedText = normalizeText(input.text);

  // ── Step 2: Extract Entities ──
  const entities = extractEntities(normalizedText);

  // ── Initialize Log ──
  const log: PipelineLog = {
    originalText: input.text,
    normalizedText,
    entitiesFound: {
      amountCount: entities.amounts.length,
      people: entities.people,
      merchants: entities.merchants,
    },
    ruleEngineResult: { attempted: false, succeeded: false },
    aiResult: { attempted: false, succeeded: false },
    finalConfidence: 0,
    finalDecision: "",
  };

  let items: ParsedTransaction[] = [];
  let parsedBy: "rule_engine" | "ai" | "hybrid" = "rule_engine";
  let modelUsed = "rule_engine";
  let alertMessage: string | null = null;
  let tokensUsed = 0;

  // ── Step 3+4: Intent Detection + Rule Engine ──
  log.ruleEngineResult.attempted = true;
  const ruleResult = runRuleEngine(normalizedText, input.userDict);

  if (!ruleResult.needsAI && ruleResult.items.length > 0) {
    // Rule engine succeeded!
    items = ruleResult.items;
    log.ruleEngineResult.succeeded = true;
    parsedBy = "rule_engine";
    modelUsed = "rule_engine";
  } else {
    // ── Step 5: AI Classification ──
    log.ruleEngineResult.succeeded = false;
    log.ruleEngineResult.reason = ruleResult.reason;
    log.aiResult.attempted = true;

    // Determine if text needs AI or is just complex for rule engine
    const isComplexText = input.text.length > 35 || entities.hasMultipleTransactions;
    const isWeakRuleResult = ruleResult.items.some(
      it => it.category === "متنوعات" || it.confidence < 60
    );

    if (isComplexText || isWeakRuleResult || ruleResult.needsAI) {
      try {
        const currentDate = new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });
        const aiResult = await aiClassify(
          input.text,
          input.apiKey,
          input.apiKey2,
          input.modelName,
          input.maxTokens,
          {
            totalIncome: input.monthlyContext.totalIncome,
            totalExpense: input.monthlyContext.totalExpense,
            currentDate,
          },
          input.skipClarification
        );

        if (aiResult && aiResult.items.length > 0) {
          items = aiResult.items;
          alertMessage = aiResult.alertMessage || null;
          tokensUsed = aiResult.tokensUsed;
          modelUsed = aiResult.modelUsed;
          parsedBy = ruleResult.items.length > 0 ? "hybrid" : "ai";
          log.aiResult.succeeded = true;
          log.aiResult.modelUsed = aiResult.modelUsed;

          // If AI returned clarification
          if (aiResult.needsClarification) {
            const scored = scoreAndDecide([], input.text, thresholds);
            scored.clarificationQuestion = aiResult.clarificationQuestion || scored.clarificationQuestion;
            log.finalConfidence = 0;
            log.finalDecision = "clarify";

            return {
              items: [],
              parsedBy,
              modelUsed,
              overallConfidence: 0,
              decision: "clarify",
              clarificationQuestion: aiResult.clarificationQuestion || "مش قادر أفهم. ممكن توضح أكتر؟",
              alertMessage,
              tokensUsed,
              processingTimeMs: Date.now() - startTime,
              log,
            };
          }
        } else {
          // AI failed, fall back to rule engine results if any
          log.aiResult.succeeded = false;
          if (ruleResult.items.length > 0) {
            items = ruleResult.items;
            parsedBy = "rule_engine";
          }
        }
      } catch (err) {
        console.error("Pipeline AI Error:", err);
        log.aiResult.succeeded = false;
        if (ruleResult.items.length > 0) {
          items = ruleResult.items;
          parsedBy = "rule_engine";
        }
      }
    } else if (ruleResult.items.length > 0) {
      items = ruleResult.items;
    }
  }

  // ── Step 6+7: Confidence Scoring + Decision ──
  const postProcessed = postProcessItems(items);
  const scored = scoreAndDecide(postProcessed, input.text, thresholds);

  log.finalConfidence = scored.overallConfidence;
  log.finalDecision = scored.decision;

  return {
    items: scored.items,
    parsedBy,
    modelUsed,
    overallConfidence: scored.overallConfidence,
    decision: scored.decision,
    clarificationQuestion: scored.clarificationQuestion,
    alertMessage,
    tokensUsed,
    processingTimeMs: Date.now() - startTime,
    log,
  };
}

/**
 * Speech-to-Text pipeline entry point
 * Uses Gemini API for transcription with financial context
 */
export async function runSTTPipeline(
  audioBase64: string,
  mimeType: string,
  apiKey: string,
  modelName: string = "gemini-2.5-flash"
): Promise<{ text: string; tokensUsed: number } | null> {
  return geminiSpeechToText(audioBase64, mimeType, apiKey, modelName);
}
