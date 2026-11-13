/**
 * What recording a sentence answers, whichever engine read it.
 *
 * `ParseResponse` is the shape `ai.parseExpense` and `ai.parseVoiceExpense` return. Store builds
 * of the phone app read its decision, items, question, clarification id and log id, so under the
 * understanding engine every field keeps its type; what is added is optional: each item's
 * `reading`, which the apps ignore.
 */
import type { MovementKind } from "../../../contracts/ledger-movement";
import type { ParsedTransaction } from "../../lib/rule-engine";

/** What the understanding engine read for one item, kept on the item and in the reading log. */
export interface ReadingSummary {
  /** Taxonomy v2 ids (`contracts/taxonomy.ts`). */
  category: string;
  sub: string;
  kind: MovementKind;
  flow: "in" | "out";
  /** The commitment the sentence named, resolved from its reference; null when none. */
  commitmentId: number | null;
  commitmentDueDay: string | null;
  installments: number;
  /** The wallet the sentence named, resolved from its reference; null when none. */
  walletId: number | null;
  /** The guard's flags on this event. */
  flags: string[];
}

export type RecordedItem = ParsedTransaction & { reading?: ReadingSummary };

export type ParseDecision = "auto_save" | "review" | "clarify";

/** The trace of a reading, in the fields of the parser trace (`api/services/parser-trace.ts`); no screen reads it. */
export interface UnderstandingTrace {
  schemaVersion: 2;
  route: "expense_parse" | "voice_expense_parse";
  engine: "understanding_engine.v1";
  engineRole: "expense_classification";
  agentBoundary: "independent_classification_engine";
  tools: string[];
  dataNeeds: string[];
  costPolicy: { llm: "model_reads_sentence" | "skipped"; embedding: "skipped"; sendsRawHistoryToLLM: false; usesFinanceSummaryOnly: false };
  inputChannel: "text" | "voice";
  provider: string | null;
  model: string | null;
  parsedBy: string;
  decision: ParseDecision;
  confidence: number;
  itemCount: number;
  llmCalls: number;
  embeddingCalls: 0;
  inputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  latencyMs: number;
  financeContextSource: "none";
  hallucinationRisk: "low" | "medium" | "high";
  routing: null;
  versions: { contract: string; prompt: string; taxonomy: string };
  stt?: { model: string; tokensUsed: number; durationSeconds: number };
}

export interface ParseResponse {
  text: string;
  items: RecordedItem[];
  model: string;
  parsedBy: string;
  alertMessage?: string;
  decision: ParseDecision;
  overallConfidence: number;
  clarificationQuestion?: string;
  clarificationId?: number;
  processingTimeMs: number;
  trace: UnderstandingTrace;
  classificationLogId?: number;
}
