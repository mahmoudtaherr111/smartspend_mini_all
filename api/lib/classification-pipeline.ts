import { normalizeText } from "./text-normalizer";
import { extractEntities } from "./entity-extractor";
import { runRuleEngine, type ParsedTransaction } from "./rule-engine";
import { aiClassify, geminiSpeechToText } from "./ai-classifier";
import { runEmbeddingClassifier } from "./embedding-engine";
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
  userProfileContext?: {
    promptSummary?: string;
    hasChildren?: boolean | null;
    responsibleForFamily?: boolean | null;
    supportsOthers?: unknown;
    fixedMonthlyCommitments?: unknown;
  };
  skipClarification?: boolean;
}

export interface PipelineResult {
  items: ParsedTransaction[];
  parsedBy: "rule_engine" | "ai" | "hybrid" | "embedding";
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
  embeddingResult: { attempted: boolean; succeeded: boolean; isSimple?: boolean; complexityScore?: number };
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
 * Run the full classification pipeline (with Hybrid Embedding Layer)
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
    embeddingResult: { attempted: false, succeeded: false },
    aiResult: { attempted: false, succeeded: false },
    finalConfidence: 0,
    finalDecision: "",
  };

  let items: ParsedTransaction[] = [];
  let parsedBy: "rule_engine" | "ai" | "hybrid" | "embedding" = "rule_engine";
  let modelUsed = "rule_engine";
  let alertMessage: string | null = null;
  let tokensUsed = 0;

  // ── Step 3+4: Intent Detection + Rule Engine ──
  log.ruleEngineResult.attempted = true;
  const ruleResult = runRuleEngine(normalizedText, input.userDict, input.userProfileContext);

  if (!ruleResult.needsAI && ruleResult.items.length > 0) {
    // Rule engine succeeded!
    items = ruleResult.items;
    log.ruleEngineResult.succeeded = true;
    parsedBy = "rule_engine";
    modelUsed = "rule_engine";
  } else {
    // ── Step 4.5: Hybrid Embedding Layer (NEW) ──
    log.ruleEngineResult.succeeded = false;
    log.ruleEngineResult.reason = ruleResult.reason;

    // Try embedding classifier before falling back to full LLM
    log.embeddingResult.attempted = true;
    try {
      const embResult = await runEmbeddingClassifier(normalizedText, input.apiKey);

      if (embResult) {
        log.embeddingResult.complexityScore = embResult.complexityScore;
        log.embeddingResult.isSimple = embResult.isSimple;

        if (embResult.isSimple && embResult.matches.length > 0) {
          // Embedding is confident enough → skip LLM entirely
          log.embeddingResult.succeeded = true;
          parsedBy = "embedding";
          modelUsed = "text-embedding-004";

          // Build ParsedTransaction items from embedding matches
          for (let i = 0; i < embResult.matches.length; i++) {
            const match = embResult.matches[i];
            const segAmounts = entities.amounts;
            const amount = segAmounts[i]?.amount || segAmounts[0]?.amount || 0;

            items.push({
              amount,
              category: match.category,
              subCategory: match.subCategory,
              description: embResult.segments[i] || normalizedText,
              type: ["مرتب", "عمل حر", "عوائد استثمار"].includes(match.category) ? "income" : "expense",
              confidence: match.score,
              currency: "EGP",
              needsReview: match.score < 85,
              parsedBy: "rule_engine",  // compatible type
              inferenceSource: "synonym",
              ambiguityFlags: match.margin < 10 ? ["low_embedding_margin"] : undefined,
              confidenceBreakdown: {
                intent: match.score,
                taxonomy: match.score,
                heuristics: match.margin,
              },
            });
          }
        }
      }
    } catch (embErr) {
      console.warn("Embedding classifier error (non-fatal):", embErr);
      log.embeddingResult.succeeded = false;
    }

    // ── Step 5: AI Classification (only if embedding didn't handle it) ──
    if (items.length === 0) {
      log.aiResult.attempted = true;

      // Determine if text needs AI
      const isComplexText = input.text.length > 35 || entities.hasMultipleTransactions;
      const isWeakRuleResult = ruleResult.items.some(
        it => it.category === "متنوعات" || it.confidence < 80
      );

      if (isComplexText || isWeakRuleResult || ruleResult.needsAI || input.skipClarification) {
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
              userProfileContext: input.userProfileContext?.promptSummary,
            },
            input.skipClarification
          );

          if (aiResult) {
            tokensUsed = aiResult.tokensUsed;
            modelUsed = aiResult.modelUsed;
            log.aiResult.modelUsed = aiResult.modelUsed;

            const isSkipped = input.skipClarification;

            if (isSkipped) {
              if (aiResult.items.length > 0) {
                items = aiResult.items.map(item => ({ ...item, confidence: Math.min(item.confidence, 55), needsReview: true }));
                alertMessage = aiResult.alertMessage || null;
                parsedBy = ruleResult.items.length > 0 ? "hybrid" : "ai";
                log.aiResult.succeeded = true;
              } else {
                const fallbackAmount = entities.amounts[0]?.amount || 0;
                if (fallbackAmount > 0) {
                  items = [{
                    amount: fallbackAmount,
                    category: "متنوعات",
                    subCategory: "أخرى",
                    description: input.text.slice(0, 60),
                    type: "expense",
                    confidence: 30,
                    currency: "EGP",
                    needsReview: true,
                    parsedBy: "rule_engine",
                    inferenceSource: "ai",
                    ambiguityFlags: ["skip_low_confidence"],
                  }];
                  log.aiResult.succeeded = false;
                  parsedBy = "rule_engine";
                } else if (ruleResult.items.length > 0) {
                  items = ruleResult.items;
                  parsedBy = "rule_engine";
                }
              }
            } else if (!aiResult.needsClarification && aiResult.items.length > 0) {
              // Normal successful AI classification
              items = aiResult.items;
              alertMessage = aiResult.alertMessage || null;
              parsedBy = ruleResult.items.length > 0 ? "hybrid" : "ai";
              log.aiResult.succeeded = true;
            } else if (aiResult.needsClarification) {
              // AI asked for clarification and user hasn't skipped yet → return clarify
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
            } else {
              // AI failed → fall back to rule engine results if any
              log.aiResult.succeeded = false;
              if (ruleResult.items.length > 0) {
                items = ruleResult.items;
                parsedBy = "rule_engine";
              }
            }
          } else {
            // AI returned null → fall back
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
  }

  // ── Step 6+7: Confidence Scoring + Decision ──
  const postProcessed = postProcessItems(items);
  const scored = scoreAndDecide(postProcessed, input.text, thresholds, input.skipClarification ?? false);

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
  modelName: string = "gemini-2.5-flash",
  sttMode: string = "standard"
): Promise<{ text: string; tokensUsed: number } | null> {
  return geminiSpeechToText(audioBase64, mimeType, apiKey, modelName, sttMode);
}
