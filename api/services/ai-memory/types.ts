import type { Artifact, DataNeed, ResolvedFact } from "../ai-kernel/types";

export type MemoryType = "fact" | "agreement" | "preference" | "plan" | "action" | "summary";

export type EmbeddingDimensions = 256 | 768 | 1024;

export interface MemoryMessage {
  role: "user" | "assistant";
  content: string;
  id?: number;
}

export interface ConversationMemoryInput {
  userId: number;
  userType: string;
  conversationId: number;
  messages: MemoryMessage[];
  source?: "chat" | "voice" | "task";
}

export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  importance: number;
  sourceMessageId?: number;
  metadata?: Record<string, unknown>;
}

export interface ConversationMemoryDraft {
  capsule: string;
  runningSummary: string;
  memories: ExtractedMemory[];
}

export interface MemoryRetrievalContext {
  userId: number;
  userType: string;
  query: string;
  limit?: number;
}

export interface RetrievedMemory {
  id: number | string;
  type: MemoryType;
  content: string;
  score: number;
  importance: number;
  source: "capsule" | "memory" | "action";
  sourceConversationId?: number | null;
  createdAt?: Date | null;
}

export interface MemoryRetrievalResult {
  query: string;
  capsules: RetrievedMemory[];
  memories: RetrievedMemory[];
  actions: RetrievedMemory[];
  facts: ResolvedFact[];
  artifacts: Artifact[];
  errors: string[];
  cacheHits: string[];
}

export interface EmbeddingConfig {
  provider: "fireworks";
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: EmbeddingDimensions;
  enabled: boolean;
}

export interface EmbedTextInput {
  text: string;
  dimensions?: EmbeddingDimensions;
  userId?: number | string;
  userType?: string;
}

export interface EmbedTextResult {
  vector: number[];
  model: string;
  requestModel?: string;
  dimensions: EmbeddingDimensions;
  provider: "fireworks";
  cacheHit: boolean;
  fallback?: boolean;
  fallbackReason?: string;
}

export interface VectorDocument {
  id: string;
  userId: number;
  userType: string;
  text: string;
  vector?: number[];
  metadata?: Record<string, unknown>;
}

export interface VectorSearchQuery {
  userId: number;
  userType: string;
  text: string;
  vector?: number[];
  limit: number;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  document: VectorDocument;
}

export interface MemoryVectorStore {
  upsert(documents: VectorDocument[]): Promise<void>;
  search(query: VectorSearchQuery): Promise<VectorSearchResult[]>;
  deleteByUser(userId: number, userType: string): Promise<number>;
}

export interface MemoryResolverResult {
  facts: ResolvedFact[];
  artifacts: Artifact[];
  errors: string[];
  cacheHits: string[];
  handledNeeds: DataNeed[];
}
