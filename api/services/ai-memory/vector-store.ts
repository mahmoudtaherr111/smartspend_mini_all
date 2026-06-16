import { cosineSimilarity, lexicalScore } from "./text-utils";
import { cheapRerankResults, reformulateMemoryQuery } from "./retrieval-enhancements";
import type {
  MemoryVectorStore,
  VectorDocument,
  VectorSearchQuery,
  VectorSearchResult,
} from "./types";

export class InMemoryVectorStore implements MemoryVectorStore {
  private readonly documents = new Map<string, VectorDocument>();

  async upsert(documents: VectorDocument[]): Promise<void> {
    for (const document of documents) {
      this.documents.set(document.id, document);
    }
  }

  async search(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const reformulated = reformulateMemoryQuery(query.text);
    const results = [...this.documents.values()]
      .filter((document) => document.userId === query.userId && document.userType === query.userType)
      .map((document) => ({
        id: document.id,
        document,
        score: Math.max(
          lexicalScore(reformulated.expanded, document.text),
          cosineSimilarity(query.vector, document.vector),
        ),
      }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(query.limit, 2));

    return cheapRerankResults(query.text, results).slice(0, query.limit);
  }

  async deleteByUser(userId: number, userType: string): Promise<number> {
    let deleted = 0;
    for (const [id, document] of this.documents.entries()) {
      if (document.userId === userId && document.userType === userType) {
        this.documents.delete(id);
        deleted++;
      }
    }
    return deleted;
  }
}
