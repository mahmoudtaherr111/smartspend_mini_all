import { createHash } from "crypto";
import type {
  MemoryVectorStore,
  VectorDocument,
  VectorSearchQuery,
  VectorSearchResult,
} from "./types";

export interface QdrantVectorStoreConfig {
  baseUrl: string;
  collection: string;
  apiKey?: string;
}

interface QdrantSearchPoint {
  id: string | number;
  score?: number;
  payload?: {
    id?: string;
    userId?: number;
    userType?: string;
    text?: string;
    metadata?: Record<string, unknown>;
  };
}

function qdrantUrl(config: QdrantVectorStoreConfig, path: string): string {
  return `${config.baseUrl.replace(/\/+$/, "")}/collections/${encodeURIComponent(config.collection)}${path}`;
}

function pointId(documentId: string): string {
  const hex = createHash("sha256").update(documentId).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function headers(config: QdrantVectorStoreConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.apiKey ? { "api-key": config.apiKey } : {}),
  };
}

async function qdrantRequest<T>(
  config: QdrantVectorStoreConfig,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(qdrantUrl(config, path), {
    ...init,
    headers: {
      ...headers(config),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Qdrant request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export class QdrantVectorStore implements MemoryVectorStore {
  constructor(private readonly config: QdrantVectorStoreConfig) {}

  async upsert(documents: VectorDocument[]): Promise<void> {
    const points = documents
      .filter((document) => Array.isArray(document.vector) && document.vector.length > 0)
      .map((document) => ({
        id: pointId(document.id),
        vector: document.vector,
        payload: {
          id: document.id,
          userId: document.userId,
          userType: document.userType,
          text: document.text,
          metadata: document.metadata || {},
        },
      }));

    if (points.length === 0) return;

    await qdrantRequest(this.config, "/points?wait=true", {
      method: "PUT",
      body: JSON.stringify({ points }),
    });
  }

  async search(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    if (!query.vector || query.vector.length === 0) return [];

    const response = await qdrantRequest<{ result?: QdrantSearchPoint[] }>(this.config, "/points/search", {
      method: "POST",
      body: JSON.stringify({
        vector: query.vector,
        limit: query.limit,
        with_payload: true,
        filter: {
          must: [
            { key: "userId", match: { value: query.userId } },
            { key: "userType", match: { value: query.userType } },
          ],
        },
      }),
    });

    return (response.result || [])
      .map((point) => {
        const payload = point.payload || {};
        const document: VectorDocument = {
          id: String(payload.id ?? point.id),
          userId: Number(payload.userId ?? query.userId),
          userType: String(payload.userType ?? query.userType),
          text: String(payload.text ?? ""),
          metadata: payload.metadata || {},
        };
        return {
          id: document.id,
          score: Number(point.score || 0),
          document,
        };
      })
      .filter((result) => result.document.userId === query.userId && result.document.userType === query.userType);
  }

  async deleteByUser(userId: number, userType: string): Promise<number> {
    await qdrantRequest(this.config, "/points/delete?wait=true", {
      method: "POST",
      body: JSON.stringify({
        filter: {
          must: [
            { key: "userId", match: { value: userId } },
            { key: "userType", match: { value: userType } },
          ],
        },
      }),
    });
    return 0;
  }
}
