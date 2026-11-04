/** Bounded, owner-scoped conversion of legacy movement rows. Default callers should preview before applying. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import Decimal from "decimal.js";
import { and, asc, count, eq, gt, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { expenses, systemSettings } from "../../db/schema";
import { getDb } from "../queries/connection";
import { financialMovement, normalizeFinancialMovement } from "../../contracts/ledger-movement";
import { getSystemSettings, invalidateSettingsCache } from "../lib/settings-cache";
import { keyRing } from "../lib/provider-key-crypto";
import { applyExpenseRollupDelta, expenseToRollupDelta, ledgerAmount } from "./expense-rollups";
import { afterLedgerWrite, assertWalletsInTx, lockLedgerOwner, type LedgerOwner, type LedgerRow } from "./ledger-writer";

const FLAG = "capture_financial_version";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? { ...value as Record<string, unknown> } : {};
function canonical(value: unknown, depth = 0): string {
  if (depth > 32) throw new Error("migration_metadata_depth");
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item, depth + 1)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], depth + 1)}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}
function fingerprint(row: LedgerRow): string {
  return createHash("sha256").update(canonical({ id: row.id, userId: row.userId, userType: row.userType,
    type: row.type, amount: new Decimal(row.amount).toFixed(2), category: row.category, subCategory: row.subCategory,
    description: row.description, date: row.date.toISOString(), walletId: row.walletId, businessId: row.businessId,
    contactId: row.contactId, financial: financialMovement(row), direction: object(row.parsedMetadata).direction })).digest("hex");
}
const snapshotSchema = z.strictObject({
  version: z.literal(1),
  before: z.strictObject({ type: z.enum(["transfer", "investment"]), amount: z.string().regex(/^-?\d+\.\d{2}$/),
    hasDirection: z.boolean(), direction: z.unknown(), hasFinancial: z.boolean(), financial: z.unknown() }),
  afterHash: z.string().regex(/^[a-f0-9]{64}$/), signature: z.string().regex(/^[a-f0-9]{64}$/),
});
type Snapshot = z.infer<typeof snapshotSchema>;
function signature(row: LedgerRow, data: Omit<Snapshot, "signature">, key: Buffer): string {
  return createHmac("sha256", key).update("smartspend:financial-migration:v1:").update(canonical([row.id, row.userId, row.userType, data])).digest("hex");
}
function validSignature(row: LedgerRow, snapshot: Snapshot): boolean {
  const { signature: actual, ...data } = snapshot;
  return keyRing().opening.some((candidate) => timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(signature(row, data, candidate.key), "hex")));
}

export interface FinancialMigrationOptions { apply?: boolean; batchSize?: number; cursor?: number; owner?: LedgerOwner }
function validatedOptions(options: FinancialMigrationOptions): number {
  if (options.batchSize !== undefined && (!Number.isSafeInteger(options.batchSize) || options.batchSize < 1)) throw new Error("migration_batch_size");
  if (options.cursor !== undefined && (!Number.isSafeInteger(options.cursor) || options.cursor < 0)) throw new Error("migration_cursor");
  if (options.owner && (!Number.isSafeInteger(options.owner.userId) || options.owner.userId < 1 || !["oauth", "local"].includes(options.owner.userType))) throw new Error("migration_owner");
  return Math.min(500, options.batchSize ?? 100);
}
export async function migrateFinancialBatch(options: FinancialMigrationOptions = {}) {
  const size = validatedOptions(options);
  const rows = await getDb().select().from(expenses).where(and(notInArray(expenses.type, ["income", "expense"]), gt(expenses.id, options.cursor ?? 0),
    ...(options.owner ? [eq(expenses.userId, options.owner.userId), eq(expenses.userType, options.owner.userType)] : [])))
    .orderBy(asc(expenses.id)).limit(size);
  const unresolved: Array<{ id: number; reason: string }> = [];
  let changed = 0;
  const owners = new Map<string, LedgerOwner>();
  for (const candidate of rows) {
    if (!["oauth", "local"].includes(candidate.userType)) { unresolved.push({ id: candidate.id, reason: "owner_type" }); continue; }
    if (!["transfer", "investment"].includes(candidate.type)) { unresolved.push({ id: candidate.id, reason: "legacy_type" }); continue; }
    const owner = { userId: candidate.userId, userType: candidate.userType };
    try {
      const result = await getDb().transaction(async (tx) => {
        await lockLedgerOwner(tx, owner);
        // Participate in the same cutover barrier as ordinary writers.
        await getSystemSettings(tx, { keys: [FLAG], lock: true });
        const scope = and(eq(expenses.id, candidate.id), eq(expenses.userId, owner.userId), eq(expenses.userType, owner.userType));
        const [row] = await tx.select().from(expenses).where(scope).for("update");
        if (!row || !["transfer", "investment"].includes(row.type)) return "gone";
        const normalized = normalizeFinancialMovement(row);
        if (!normalized) return "direction_unknown";
        await assertWalletsInTx(tx, owner, [row.walletId, normalized.financial.counterWalletId]);
        if (new Decimal(row.amount).isNegative()) return "negative_legacy_amount";
        const base = object(row.parsedMetadata);
        const original = { type: row.type as "transfer" | "investment", amount: new Decimal(row.amount).toFixed(2),
          hasDirection: Object.hasOwn(base, "direction"), direction: base.direction ?? null,
          hasFinancial: Object.hasOwn(base, "financial"), financial: base.financial ?? null };
        if (canonical(original).length > 8192) return "metadata_size";
        const metadata = { ...base, direction: normalized.financial.movement === "in" ? "incoming" : "outgoing", financial: normalized.financial };
        const amount = new Decimal(ledgerAmount(normalized.type, metadata.direction, row.amount)).toFixed(2);
        const after: LedgerRow = { ...row, type: normalized.type, amount, parsedMetadata: metadata };
        if (!options.apply) return "preview";
        const data = { version: 1 as const, before: original, afterHash: fingerprint(after) };
        const snapshot: Snapshot = { ...data, signature: signature(row, data, keyRing().sealing.key) };
        await tx.update(expenses).set({ type: after.type, amount, parsedMetadata: { ...metadata, cashflowMigration: snapshot } }).where(scope);
        await applyExpenseRollupDelta(tx, expenseToRollupDelta(row, -1));
        await applyExpenseRollupDelta(tx, expenseToRollupDelta(after, 1));
        return "changed";
      });
      if (result === "changed" || result === "preview") { changed++; owners.set(`${owner.userType}:${owner.userId}`, owner); }
      else if (result !== "gone") unresolved.push({ id: candidate.id, reason: result });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED") unresolved.push({ id: candidate.id, reason: "owner_missing" });
      else if (error && typeof error === "object" && "code" in error && error.code === "BAD_REQUEST") unresolved.push({ id: candidate.id, reason: "wallet_invalid" });
      else if (error instanceof Error && error.message === "migration_metadata_depth") unresolved.push({ id: candidate.id, reason: "metadata_depth" });
      else throw error;
    }
  }
  if (options.apply) for (const owner of owners.values()) await afterLedgerWrite(owner);
  return { apply: !!options.apply, scanned: rows.length, changed, unresolved, cursor: rows.at(-1)?.id ?? options.cursor ?? 0, done: rows.length < size };
}

/** Exclusive flag lock waits for all legacy writers' shared locks; re-count only after obtaining that barrier. */
export async function activateCashflowIfClean(): Promise<{ activated: boolean; remaining: number }> {
  const result = await getDb().transaction(async (tx) => {
    await tx.insert(systemSettings).values({ key: FLAG, value: "" }).onDuplicateKeyUpdate({ set: { key: FLAG } });
    await tx.select().from(systemSettings).where(eq(systemSettings.key, FLAG)).for("update");
    const [old] = await tx.select({ remaining: count() }).from(expenses).where(notInArray(expenses.type, ["income", "expense"]));
    if (old.remaining > 0) return { activated: false, remaining: old.remaining };
    await tx.update(systemSettings).set({ value: "cashflow-v1" }).where(eq(systemSettings.key, FLAG));
    return { activated: true, remaining: 0 };
  });
  invalidateSettingsCache();
  return result;
}

/** Restores only authentic snapshots whose protected financial fields have not subsequently changed. */
export async function rollbackFinancialBatch(options: Omit<FinancialMigrationOptions, "apply"> = {}) {
  const size = validatedOptions(options);
  // Stop new canonical writes before restoring any legacy rows; compatible readers must remain deployed.
  await getDb().transaction(async (tx) => {
    await tx.insert(systemSettings).values({ key: FLAG, value: "" }).onDuplicateKeyUpdate({ set: { value: "" } });
  });
  invalidateSettingsCache();
  const rows = await getDb().select().from(expenses).where(and(gt(expenses.id, options.cursor ?? 0), sql`JSON_EXTRACT(${expenses.parsedMetadata}, '$.cashflowMigration.version') = 1`,
    ...(options.owner ? [eq(expenses.userId, options.owner.userId), eq(expenses.userType, options.owner.userType)] : []))).orderBy(asc(expenses.id)).limit(size);
  const skipped: Array<{ id: number; reason: string }> = [];
  let restored = 0;
  for (const candidate of rows) {
    if (!["oauth", "local"].includes(candidate.userType)) { skipped.push({ id: candidate.id, reason: "owner_type" }); continue; }
    const owner = { userId: candidate.userId, userType: candidate.userType };
    try {
    const result = await getDb().transaction(async (tx) => {
      await lockLedgerOwner(tx, owner);
      const scope = and(eq(expenses.id, candidate.id), eq(expenses.userId, owner.userId), eq(expenses.userType, owner.userType));
      const [row] = await tx.select().from(expenses).where(scope).for("update");
      if (!row) return "gone";
      const metadata = object(row.parsedMetadata);
      const parsed = snapshotSchema.safeParse(metadata.cashflowMigration);
      if (!parsed.success || !validSignature(row, parsed.data)) return "invalid_snapshot";
      if (fingerprint(row) !== parsed.data.afterHash) return "changed_after_migration";
      const before = parsed.data.before;
      if (before.hasDirection) metadata.direction = before.direction; else delete metadata.direction;
      if (before.hasFinancial) metadata.financial = before.financial; else delete metadata.financial;
      delete metadata.cashflowMigration;
      const after = { ...row, type: before.type, amount: before.amount, parsedMetadata: metadata };
      await tx.update(expenses).set({ type: after.type, amount: after.amount, parsedMetadata: metadata }).where(scope);
      await applyExpenseRollupDelta(tx, expenseToRollupDelta(row, -1));
      await applyExpenseRollupDelta(tx, expenseToRollupDelta(after, 1));
      return "restored";
    });
    if (result === "restored") { restored++; await afterLedgerWrite(owner); }
    else if (result !== "gone") skipped.push({ id: candidate.id, reason: result });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED") skipped.push({ id: candidate.id, reason: "owner_missing" });
      else throw error;
    }
  }
  return { restored, skipped, cursor: rows.at(-1)?.id ?? options.cursor ?? 0, done: rows.length < size };
}
