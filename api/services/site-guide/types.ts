import type { Artifact, DataNeed, ResolvedFact } from "../ai-kernel/types";

export interface SiteGuideChunk {
  id: string;
  title: string;
  area: "sms" | "wallet" | "card" | "expenses" | "goals" | "reports" | "plans";
  tags: string[];
  content: string;
  steps: string[];
}

export interface SiteGuideSearchResult {
  query: string;
  chunks: Array<SiteGuideChunk & { score: number }>;
  facts: ResolvedFact[];
  artifacts: Artifact[];
  errors: string[];
  cacheHits: string[];
}

export interface SiteGuideResolverResult {
  facts: ResolvedFact[];
  artifacts: Artifact[];
  errors: string[];
  cacheHits: string[];
  handledNeeds: DataNeed[];
}
