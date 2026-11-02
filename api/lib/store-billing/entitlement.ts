/**
 * What a store subscription's state means, as pure rules. The state itself lives only in `store_purchases`
 * (see ledger.ts): a process keeps nothing, so any number of API replicas agree.
 */

export const STORE_IDS = ["google_play", "app_store"] as const;
export type StoreId = (typeof STORE_IDS)[number];

/** The subscriptions sold in the stores. A purchase of anything else is refused. */
export const STORE_PRODUCT_IDS = ["pro_monthly", "pro_yearly"] as const;

export type EntitlementState =
  | "active"
  | "in_grace_period"
  | "on_hold"
  | "paused"
  | "cancelled"
  | "expired"
  | "refunded"
  | "revoked"
  | "pending";

/** Whether a state grants the paid plan at `now`. A cancelled subscription runs until its paid period ends. */
export function grantsAccess(state: EntitlementState, expiresAt: Date | null, now: Date): boolean {
  if (state === "in_grace_period") return true;
  if (state !== "active" && state !== "cancelled") return false;
  return expiresAt !== null && expiresAt.getTime() > now.getTime();
}
