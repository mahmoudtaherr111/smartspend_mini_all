import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname } from "path";
import { cosineSimilarity, lexicalScore } from "./text-utils";
import type {
  MemoryVectorStore,
  VectorDocument,
  VectorSearchQuery,
  VectorSearchResult,
} from "./types";

interface QuantizedVector {
  values: number[];
  scale: number;
}

interface StoredVectorDocument extends Omit<VectorDocument, "vector"> {
  quantizedVector?: QuantizedVector;
}

interface StoreFile {
  version: 1;
  documents: StoredVectorDocument[];
}

export function quantizeVector(vector: number[] | undefined): QuantizedVector | undefined {
  if (!vector || vector.length === 0) return undefined;
  const maxAbs = Math.max(...vector.map((value) => Math.abs(value)));
  const scale = maxAbs > 0 ? maxAbs / 127 : 1;
  return {
    scale,
    values: vector.map((value) => Math.max(-127, Math.min(127, Math.round(value / scale)))),
  };
}

export function dequantizeVector(vector: QuantizedVector | undefined): number[] | undefined {
  if (!vector) return undefined;
  return vector.values.map((value) => value * vector.scale);
}

export class QuantizedOnDiskVectorStore implements MemoryVectorStore {
  private documents = new Map<string, StoredVectorDocument>();
  private loaded = false;

  constructor(private readonly filePath: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const data = JSON.parse(await readFile(this.filePath, "utf8")) as StoreFile;
      for (const document of data.documents || []) {
        this.documents.set(document.id, document);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    const data: StoreFile = {
      version: 1,
      documents: [...this.documents.values()],
    };
    await writeFile(tempPath, JSON.stringify(data), "utf8");
    await rename(tempPath, this.filePath);
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    await this.load();
    for (const document of documents) {
      const { vector, ...rest } = document;
      this.documents.set(document.id, {
        ...rest,
        quantizedVector: quantizeVector(vector),
      });
    }
    await this.persist();
  }

  async search(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    await this.load();
    return [...this.documents.values()]
      .filter((document) => document.userId === query.userId && document.userType === query.userType)
      .map((document) => {
        const vector = dequantizeVector(document.quantizedVector);
        const restored: VectorDocument = {
          ...document,
          vector,
        };
        return {
          id: document.id,
          document: restored,
          score: Math.max(
            lexicalScore(query.text, document.text),
            cosineSimilarity(query.vector, vector),
          ),
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit);
  }

  async deleteByUser(userId: number, userType: string): Promise<number> {
    await this.load();
    let deleted = 0;
    for (const [id, document] of this.documents.entries()) {
      if (document.userId === userId && document.userType === userType) {
        this.documents.delete(id);
        deleted += 1;
      }
    }
    if (deleted > 0) await this.persist();
    return deleted;
  }
}
