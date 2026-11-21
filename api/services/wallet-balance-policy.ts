/** A card network is not a balance type. Credit availability never enters cash liquidity. */
import { and, eq } from "drizzle-orm";
import { captureMarkers } from "../../db/schema";
import { CAPTURE_WALLET_KINDS, type CaptureWalletKind } from "../../contracts/capture";
import { getDb } from "../queries/connection";
import type { LedgerOwner } from "./ledger-writer";

export async function walletBalancePolicies(owner: LedgerOwner) {
  const rows = await getDb().select({ value: captureMarkers.value }).from(captureMarkers).where(and(eq(captureMarkers.userId, owner.userId), eq(captureMarkers.userType, owner.userType), eq(captureMarkers.kind, "wallet_kind")));
  const kinds = new Map<number, CaptureWalletKind>();
  const ambiguous = new Set<number>();
  const creditWalletIds = new Set<number>();
  for (const row of rows) {
    const match = /^(\d+):(cash|bank|debit|credit|unknown)$/.exec(row.value);
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) <= 0) continue;
    const id = Number(match[1]), kind = match[2] as CaptureWalletKind;
    if (kind === "credit") creditWalletIds.add(id);
    if (kinds.has(id)) ambiguous.add(id);
    if (CAPTURE_WALLET_KINDS.includes(kind)) kinds.set(id, kind);
  }
  // A conflicting policy cannot make known credit available as cash.
  for (const id of ambiguous) kinds.set(id, "unknown");
  return { kinds, creditWalletIds };
}
