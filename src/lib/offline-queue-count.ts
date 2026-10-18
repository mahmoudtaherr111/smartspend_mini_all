/** The two queues entries written offline wait in until they are sent (`ExpenseForm`, `PwaOfflineSyncDialog`). */
const OFFLINE_QUEUE_KEYS = ["smartspend_offline_texts", "smartspend_offline_manual"] as const;

/** How many entries were written offline and are still waiting to be sent; signing out deletes them. */
export function countUnsentOffline(): number {
  let total = 0;
  for (const key of OFFLINE_QUEUE_KEYS) {
    try {
      const items: unknown = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(items)) total += items.length;
    } catch {
      // An unreadable queue counts as empty, as the sync dialog treats it.
    }
  }
  return total;
}
