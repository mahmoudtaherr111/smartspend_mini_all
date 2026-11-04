/** Display a fee bundle from one SQL snapshot, keeping the stored principal and fee separate. */
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import Decimal from "decimal.js";
import { expenses } from "../../db/schema";
import { movementOf } from "../../contracts/ledger-movement";
import type { LedgerRow } from "./ledger-writer";

export const linkedLedgerFee = alias(expenses, "linked_ledger_fee");
export const ledgerBundleColumns = { entry: expenses, fee: { id: linkedLedgerFee.id, amount: linkedLedgerFee.amount, walletId: linkedLedgerFee.walletId } };
export const ledgerBundleJoin = and(eq(linkedLedgerFee.userId, expenses.userId), eq(linkedLedgerFee.userType, expenses.userType),
  eq(linkedLedgerFee.clientRequestId, sql`CONCAT('cap:e', JSON_UNQUOTE(JSON_EXTRACT(${expenses.parsedMetadata}, '$.capture.eventId')), ':fee')`),
  sql`JSON_EXTRACT(${linkedLedgerFee.parsedMetadata}, '$.capture.parentExpenseId') = ${expenses.id}`);

/** Orphan fees stay visible: an owner-scoped parent and exact server linkage are required for grouping. */
export const standaloneLedgerRowSql = sql`NOT EXISTS (SELECT 1 FROM expenses AS bundle_parent
  WHERE bundle_parent.user_id = ${expenses.userId} AND bundle_parent.user_type = ${expenses.userType}
  AND bundle_parent.id = JSON_EXTRACT(${expenses.parsedMetadata}, '$.capture.parentExpenseId')
  AND ${expenses.clientRequestId} = CONCAT('cap:e', JSON_UNQUOTE(JSON_EXTRACT(bundle_parent.parsed_metadata, '$.capture.eventId')), ':fee'))`;

export function ledgerBundle<T extends Pick<LedgerRow, "id" | "type" | "amount" | "walletId" | "parsedMetadata">>(row: T, child: { id: number; amount: string; walletId: number | null } | null, contextWalletId?: number) {
  const event = (row.parsedMetadata as { capture?: { eventId?: unknown } } | null)?.capture?.eventId;
  const eligible = typeof event === "number" && Number.isSafeInteger(event) && event > 0;
  const feeRow = child && (contextWalletId === undefined || child.walletId === contextWalletId) ? child : null;
  const principal = new Decimal(row.amount).abs();
  const fee = feeRow ? new Decimal(feeRow.amount).abs() : new Decimal(0);
  return { ...row, bundle: eligible ? { principalAmount: principal.toFixed(2), feeId: feeRow?.id ?? null, feeAmount: fee.toFixed(2),
    totalAmount: (movementOf(row) === "in" ? principal : principal.plus(fee)).toFixed(2) } : null };
}
