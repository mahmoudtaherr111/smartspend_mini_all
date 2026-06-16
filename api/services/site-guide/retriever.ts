import type { Artifact, DataNeed, ResolvedFact } from "../ai-kernel/types";
import {
  SITE_GUIDE_EMBEDDING_DIMENSIONS,
  buildSiteGuideEmbedding,
  cosineSimilarity,
  normalizeSiteGuideText,
  siteGuideTokens,
} from "./embedding";
import { SITE_GUIDE_CHUNKS } from "./knowledge-base";
import type {
  SiteGuideResolverResult,
  SiteGuideSearchResult,
  SiteGuideChunk,
} from "./types";

const chunkVectors = new Map<string, number[]>();

function vectorForChunk(chunk: SiteGuideChunk): number[] {
  const existing = chunkVectors.get(chunk.id);
  if (existing) return existing;
  const vector = buildSiteGuideEmbedding(
    [chunk.title, chunk.area, chunk.tags.join(" "), chunk.content, chunk.steps.join(" ")].join(" "),
  );
  chunkVectors.set(chunk.id, vector);
  return vector;
}

function keywordScore(query: string, chunk: SiteGuideChunk): number {
  const queryTokens = new Set(siteGuideTokens(query));
  const haystack = normalizeSiteGuideText(
    [chunk.title, chunk.area, chunk.tags.join(" "), chunk.content, chunk.steps.join(" ")].join(" "),
  );
  let score = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 0.08;
  }

  for (const tag of chunk.tags) {
    if (queryTokens.has(normalizeSiteGuideText(tag))) score += 0.18;
  }

  return score;
}

function siteGuideFact(dataNeedId: string, chunk: SiteGuideChunk & { score: number }, index: number): ResolvedFact {
  return {
    id: `${dataNeedId}:site_guide_${index + 1}`,
    dataNeedId,
    label: chunk.title,
    value: `${chunk.content} الخطوات: ${chunk.steps.join(" | ")}`,
    source: "site_guide.search",
    confidence: Math.min(1, Math.max(0.2, chunk.score)),
    evidence: [
      {
        id: chunk.id,
        label: chunk.area,
        value: chunk.tags.join(", "),
      },
    ],
  };
}

function siteGuideArtifact(dataNeedId: string, chunk: SiteGuideChunk & { score: number }): Artifact {
  return {
    id: `${dataNeedId}:${chunk.id}`,
    type: "text_block",
    title: chunk.title,
    payload: {
      contractVersion: 1,
      source: "site_guide",
      area: chunk.area,
      content: chunk.content,
      steps: chunk.steps,
      tags: chunk.tags,
      score: Number(chunk.score.toFixed(4)),
      embeddingDimensions: SITE_GUIDE_EMBEDDING_DIMENSIONS,
    },
  };
}

export function searchSiteGuide(query: string, limit = 4): SiteGuideSearchResult {
  const safeLimit = Math.min(Math.max(Math.floor(limit || 4), 1), 8);
  const queryVector = buildSiteGuideEmbedding(query);
  const chunks = SITE_GUIDE_CHUNKS
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryVector, vectorForChunk(chunk)) + keywordScore(query, chunk),
    }))
    .filter((chunk) => chunk.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, safeLimit);

  const selected = chunks.length > 0 ? chunks : SITE_GUIDE_CHUNKS.slice(0, safeLimit).map((chunk) => ({ ...chunk, score: 0.05 }));
  const facts = selected.map((chunk, index) => siteGuideFact("site_guide.search", chunk, index));
  const artifacts = selected.slice(0, 2).map((chunk) => siteGuideArtifact("site_guide.search", chunk));

  return {
    query,
    chunks: selected,
    facts,
    artifacts,
    errors: [],
    cacheHits: ["site_guide:static_256"],
  };
}

export async function resolveSiteGuideDataNeeds(
  dataNeeds: DataNeed[],
): Promise<SiteGuideResolverResult> {
  const facts: ResolvedFact[] = [];
  const artifacts: Artifact[] = [];
  const errors: string[] = [];
  const cacheHits: string[] = [];
  const handledNeeds = dataNeeds.filter((need) => need.kind === "site_guide.search");

  for (const need of handledNeeds) {
    try {
      const result = searchSiteGuide(need.scope?.query ?? "", need.scope?.limit ?? need.maxRows ?? 4);
      facts.push(
        ...result.facts.map((fact) => ({
          ...fact,
          id: fact.id.replace("site_guide.search", need.id),
          dataNeedId: need.id,
        })),
      );
      artifacts.push(
        ...result.artifacts.map((artifact) => ({
          ...artifact,
          id: artifact.id.replace("site_guide.search", need.id),
        })),
      );
      cacheHits.push(...result.cacheHits);
    } catch (error) {
      errors.push(`${need.id}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    facts,
    artifacts,
    errors,
    cacheHits,
    handledNeeds,
  };
}
