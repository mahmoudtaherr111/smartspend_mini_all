import { normalizeText } from "./text-normalizer";
import { extractEntities } from "./entity-extractor";
import { runRuleEngine, type ParsedTransaction } from "./rule-engine";
import { aiClassify, geminiSpeechToText } from "./ai-classifier";
import { runEmbeddingClassifier } from "./embedding-engine";
import { scoreAndDecide, DEFAULT_THRESHOLDS, type ScoredResult } from "./confidence-scorer";
import { muscleMemoryLookup } from "./muscle-memory";
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
    personalContextPrompt?: string;
    hasChildren?: boolean | null;
    responsibleForFamily?: boolean | null;
    supportsOthers?: unknown;
    fixedMonthlyCommitments?: unknown;
    isSmoker?: boolean | null;
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
  let parsedBy: "rule_engine" | "ai" | "hybrid" | "embedding" | "muscle_memory" = "rule_engine" as any;
  let modelUsed = "rule_engine";
  let alertMessage: string | null = null;
  let tokensUsed = 0;

  // ── Step 2.5: Muscle Memory (Phase 2) ──
  // Instantly match recurring transactions with 0 tokens
  const memoryMatch = await muscleMemoryLookup(input.text, input.userId, input.userType);
  if (memoryMatch) {
    items = [{
      amount: memoryMatch.amount || entities.amounts[0]?.amount || 0,
      category: memoryMatch.pattern.category,
      subCategory: memoryMatch.pattern.subCategory,
      description: input.text,
      type: memoryMatch.pattern.type,
      confidence: 100, // Trusted from history
      currency: "EGP",
      needsReview: false,
      parsedBy: "rule_engine" as any, // Compatible type
      inferenceSource: "dictionary" as any,
      ambiguityFlags: ["muscle_memory_hit"],
    }];
    parsedBy = "muscle_memory" as any;
    modelUsed = "cache";
    log.finalConfidence = 100;
    log.finalDecision = "auto_save";

    return {
      items,
      parsedBy: parsedBy as any,
      modelUsed,
      overallConfidence: 100,
      decision: "auto_save",
      alertMessage: null,
      tokensUsed: 0,
      processingTimeMs: Date.now() - startTime,
      log,
    };
  }

  // ── Step 3+4: Intent Detection + Rule Engine ──
  log.ruleEngineResult.attempted = true;
  const ruleResult = runRuleEngine(normalizedText, input.userDict, input.userProfileContext);

  // Check if the text contains known personal names → force AI for better context understanding
  const personalContextPrompt = input.userProfileContext?.personalContextPrompt || "";
  const knownNameMentioned = personalContextPrompt.length > 0 && entities.people.length > 0;

  if (!ruleResult.needsAI && ruleResult.items.length > 0 && !knownNameMentioned) {
    // Rule engine succeeded and no known names detected
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
    let candidateCategories: string[] | undefined = undefined;

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

      const isComplexText = input.text.length > 35 || entities.hasMultipleTransactions;
      const isWeakRuleResult = ruleResult.items.some(
        it => it.category === "متنوعات" || it.confidence < 80
      );

      const forceSkipClarification = input.skipClarification || entities.amounts.length >= 2;

      if (isComplexText || isWeakRuleResult || ruleResult.needsAI || forceSkipClarification) {
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
              personalContext: input.userProfileContext?.personalContextPrompt,
              ruleHints: ruleResult.items.filter(i => i.confidence >= 60),
              amountCount: entities.amounts.length,
              isSmoker: input.userProfileContext?.isSmoker,
            },
            forceSkipClarification
          );

          if (aiResult) {
            tokensUsed = aiResult.tokensUsed;
            modelUsed = aiResult.modelUsed;
            log.aiResult.modelUsed = aiResult.modelUsed;

            const isSkipped = forceSkipClarification;

            // ── The Local Taxonomy Engine (Zero Token Categorization) ──
            // AI extracted amounts and item names. We use local embeddings to map them to categories!
            if (aiResult.items.length > 0 && !aiResult.needsClarification) {
              for (const item of aiResult.items) {
                if (item.category === "متنوعات") {
                  try {
                    const embMatch = await runEmbeddingClassifier(item.description, input.apiKey);
                    if (embMatch && embMatch.matches.length > 0) {
                      item.category = embMatch.matches[0].category;
                      item.subCategory = embMatch.matches[0].subCategory;
                      item.confidence = Math.round((item.confidence + embMatch.matches[0].score) / 2);
                    }
                  } catch (e) {
                    console.warn("Local taxonomy mapping failed for:", item.description);
                  }
                }
              }
            }

            if (isSkipped) {
              if (aiResult.items.length > 0) {
                // If it was forced because of amounts, we don't necessarily want to cap confidence at 55
                // Let's cap only if it was an explicit user skip, otherwise trust the AI
                const capConfidence = input.skipClarification;
                items = aiResult.items.map(item => ({ 
                  ...item, 
                  confidence: capConfidence ? Math.min(item.confidence, 55) : item.confidence, 
                  needsReview: capConfidence ? true : item.needsReview 
                }));
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

  // ── Step 5.3: Hybrid Dispute Resolution (Strategy 8) ──
  // When Gemini has low confidence, cross-check against the local Embedding Engine.
  // If they disagree completely → flag for user review. Once confirmed, Strategy 6
  // auto-learns the correction into user_dictionaries permanently.
  if (items.length > 0 && parsedBy !== "rule_engine" && parsedBy !== ("muscle_memory" as any)) {
    for (const item of items) {
      if (item.confidence < 75 && item.description && item.description.length >= 3) {
        try {
          const disputeCheck = await runEmbeddingClassifier(item.description, input.apiKey);
          if (disputeCheck && disputeCheck.matches.length > 0) {
            const embeddingCategory = disputeCheck.matches[0].category;
            const embeddingScore = disputeCheck.matches[0].score;

            // Dispute detected: embedding and AI disagree on category entirely
            if (embeddingCategory !== item.category && embeddingScore >= 60) {
              item.needsReview = true;
              item.ambiguityFlags = [
                ...(item.ambiguityFlags || []),
                "gemini_embedding_dispute",
                `emb_says:${embeddingCategory}`,
              ];

              // If embedding has significantly higher confidence, prefer its answer
              // but still flag for review to let the user confirm
              if (embeddingScore > item.confidence + 15) {
                item.category = embeddingCategory;
                item.subCategory = disputeCheck.matches[0].subCategory;
                item.confidence = Math.round((item.confidence + embeddingScore) / 2);
                item.ambiguityFlags.push("emb_override");
              }
            }
          }
        } catch (disputeErr) {
          console.warn("Dispute resolution error (non-fatal):", disputeErr);
        }
      }
    }
  }

  // ── Step 5.5: Apply Date Hints ──
  if (entities.dateHints && entities.dateHints.length > 0 && items.length > 0) {
    const hint = entities.dateHints[0];
    const targetDate = new Date();
    if (hint === "امبارح") {
      targetDate.setDate(targetDate.getDate() - 1);
    } else if (hint === "أول امبارح" || hint === "اول امبارح") {
      targetDate.setDate(targetDate.getDate() - 2);
    }
    const isoDate = targetDate.toISOString();
    items.forEach(item => { item.date = isoDate; });
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
