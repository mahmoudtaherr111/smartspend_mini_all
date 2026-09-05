import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const DB_NAME = "smartspend_query_cache";
const STORE_NAME = "queries";
const LEGACY_KEY = "cache";
const KEY_PREFIX = "v2:";
const OFFLINE_IDENTITY_KEY = "smartspend_offline_identity_v1";

/** Cached financial data is intentionally short-lived on a device. */
export const PERSISTED_QUERY_MAX_AGE = 12 * 60 * 60 * 1_000;
export const PERSISTED_QUERY_BUSTER = "smartspend-query-cache-v2";

export type QueryCacheUser = {
  id: number;
  type: "oauth" | "local";
};

export type OfflineIdentity = QueryCacheUser & {
  name: string;
  avatar?: string | null;
  savedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> | null {
  if (typeof window === "undefined" || !window.indexedDB) return null;

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

function storageKey(scope: string): string {
  return `${KEY_PREFIX}${scope}`;
}

export function getQueryCacheScope(user: QueryCacheUser): string {
  if (!Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new Error("Cannot persist a query cache without a valid user id.");
  }
  return `${user.type}:${user.id}`;
}

async function readClient(key: string): Promise<PersistedClient | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  return new Promise<PersistedClient | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as PersistedClient | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function writeClient(key: string, client: PersistedClient): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.objectStore(STORE_NAME).put(client, key);
  });
}

async function deleteClient(key: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.objectStore(STORE_NAME).delete(key);
  });
}

/**
 * Creates a per-account IndexedDB persister. A shared-device browser can hold
 * caches for several accounts, but a cache can only be restored for its owner.
 */
export function createQueryPersister(user: QueryCacheUser): Persister {
  const key = storageKey(getQueryCacheScope(user));

  return {
    persistClient: async (client) => {
      try {
        await writeClient(key, client);
      } catch (error) {
        console.error("Failed to persist the query cache", error);
      }
    },
    restoreClient: async () => {
      try {
        return await readClient(key);
      } catch (error) {
        console.error("Failed to restore the query cache", error);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await deleteClient(key);
      } catch (error) {
        console.error("Failed to remove the query cache", error);
      }
    },
  };
}

/** Removes only the retired, unscoped cache written by older releases. */
export async function clearLegacyPersistedQueryCache(): Promise<void> {
  try {
    await deleteClient(LEGACY_KEY);
  } catch (error) {
    console.error("Failed to remove the legacy query cache", error);
  }
}

/** Removes a single account's cache, never every account on the device. */
export async function clearPersistedQueryCache(
  user: QueryCacheUser,
): Promise<void> {
  try {
    await deleteClient(storageKey(getQueryCacheScope(user)));
  } catch (error) {
    console.error("Failed to remove the query cache", error);
  }
}

function collectQueryKeySegments(value: unknown, segments: string[] = []): string[] {
  if (typeof value === "string") {
    segments.push(value.toLowerCase());
  } else if (Array.isArray(value)) {
    for (const item of value) collectQueryKeySegments(item, segments);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectQueryKeySegments(item, segments);
  }
  return segments;
}

/** Authentication and administrator responses must never be available offline. */
export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  const segments = collectQueryKeySegments(queryKey);
  return !segments.some(
    (segment) =>
      segment === "auth" ||
      segment === "localauth" ||
      segment === "admin" ||
      segment.startsWith("auth.") ||
      segment.startsWith("localauth.") ||
      segment.startsWith("admin."),
  );
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function saveOfflineIdentity(
  user: Omit<OfflineIdentity, "savedAt">,
): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(
      OFFLINE_IDENTITY_KEY,
      JSON.stringify({ ...user, savedAt: Date.now() }),
    );
  } catch (error) {
    console.error("Failed to save the offline identity", error);
  }
}

export function getOfflineIdentity(): OfflineIdentity | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(OFFLINE_IDENTITY_KEY);
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<OfflineIdentity>;
    const isValid =
      (value.type === "oauth" || value.type === "local") &&
      Number.isSafeInteger(value.id) &&
      typeof value.name === "string" &&
      typeof value.savedAt === "number" &&
      Date.now() - value.savedAt <= PERSISTED_QUERY_MAX_AGE;

    if (!isValid) {
      window.localStorage.removeItem(OFFLINE_IDENTITY_KEY);
      return null;
    }
    return value as OfflineIdentity;
  } catch (error) {
    console.error("Failed to read the offline identity", error);
    return null;
  }
}

export function clearOfflineIdentity(): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(OFFLINE_IDENTITY_KEY);
  } catch (error) {
    console.error("Failed to clear the offline identity", error);
  }
}
