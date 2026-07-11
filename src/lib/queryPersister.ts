import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const DB_NAME = "smartspend_query_cache";
const STORE_NAME = "queries";
const KEY = "cache";

const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof window === "undefined") {
    reject(new Error("IndexedDB is only available in the browser"));
    return;
  }
  const request = window.indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const idbPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      const db = await dbPromise;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(client, KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error("Failed to persist query cache to IndexedDB", e);
    }
  },
  restoreClient: async () => {
    try {
      const db = await dbPromise;
      return await new Promise<PersistedClient | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error("Failed to restore query cache from IndexedDB", e);
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      const db = await dbPromise;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error("Failed to remove query cache from IndexedDB", e);
    }
  },
};

export async function clearPersistedQueryCache(): Promise<void> {
  await idbPersister.removeClient();
}
