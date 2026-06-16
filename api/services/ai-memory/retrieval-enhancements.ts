import { keywordTokens, lexicalScore, normalizeMemoryText } from "./text-utils";
import type { VectorSearchResult } from "./types";

export interface RerankOptions {
  ambiguousScoreGap?: number;
  lowConfidenceThreshold?: number;
}

export interface ReformulatedQuery {
  original: string;
  expanded: string;
  terms: string[];
  reason: string;
}

const DOMAIN_TERMS: Array<{ pattern: RegExp; terms: string[]; reason: string }> = [
  {
    pattern: /(هدف|اهداف|احوش|ادخر|توفير|saving|goal|خطة)/i,
    terms: ["هدف", "ادخار", "خطة", "توفير", "target", "saving"],
    reason: "goal_or_saving_query",
  },
  {
    pattern: /(اكل|مطعم|قهوة|food|restaurant|cafe)/i,
    terms: ["اكل", "مطاعم", "قهوة", "food", "category"],
    reason: "food_spending_query",
  },
  {
    pattern: /(عربية|سيارة|car)/i,
    terms: ["عربية", "سيارة", "car", "vehicle"],
    reason: "car_goal_query",
  },
  {
    pattern: /(اتفقنا|فاكر|كلمتك|المحادثة|memory|remember)/i,
    terms: ["اتفاق", "محادثة", "ذاكرة", "خطة", "memory"],
    reason: "conversation_memory_query",
  },
  {
    pattern: /(محفظة|فيزا|كارت|wallet|card|visa)/i,
    terms: ["محفظة", "كارت", "فيزا", "wallet", "card"],
    reason: "wallet_or_card_query",
  },
];

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

export function reformulateMemoryQuery(query: string): ReformulatedQuery {
  const matched = DOMAIN_TERMS.filter((entry) => entry.pattern.test(query));
  const terms = unique(matched.flatMap((entry) => entry.terms));
  if (terms.length === 0) {
    return {
      original: query,
      expanded: query,
      terms: [],
      reason: "no_reformulation_needed",
    };
  }

  return {
    original: query,
    expanded: unique([query, ...terms]).join(" "),
    terms,
    reason: unique(matched.map((entry) => entry.reason)).join("+"),
  };
}

export function isRetrievalAmbiguous(
  results: Pick<VectorSearchResult, "score">[],
  options: RerankOptions = {},
): boolean {
  if (results.length < 2) return false;
  const gap = options.ambiguousScoreGap ?? 0.08;
  const lowConfidence = options.lowConfidenceThreshold ?? 0.28;
  const [first, second] = results;
  return first.score < lowConfidence || Math.abs(first.score - second.score) <= gap;
}

function metadataNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function phraseBonus(query: string, candidate: string): number {
  const normalizedQuery = normalizeMemoryText(query);
  const normalizedCandidate = normalizeMemoryText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedCandidate.includes(normalizedQuery)) return 0.2;

  const queryTokens = [...keywordTokens(query)];
  if (queryTokens.length === 0) return 0;
  const orderedHits = queryTokens.filter((token) => normalizedCandidate.includes(token)).length;
  return Math.min(0.16, orderedHits * 0.04);
}

export function cheapRerankResults(
  query: string,
  results: VectorSearchResult[],
  options: RerankOptions = {},
): VectorSearchResult[] {
  if (!isRetrievalAmbiguous(results, options)) return results;
  const reformulated = reformulateMemoryQuery(query);

  return results
    .map((result) => {
      const importance = metadataNumber(result.document.metadata?.importance) / 1000;
      const lexical = lexicalScore(reformulated.expanded, result.document.text);
      return {
        ...result,
        score: result.score * 0.55 + lexical * 0.3 + phraseBonus(query, result.document.text) + importance,
      };
    })
    .sort((a, b) => b.score - a.score);
}
