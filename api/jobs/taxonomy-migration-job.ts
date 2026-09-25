/**
 * Moves stored rows to the current taxonomy (`contracts/categories.ts`).
 *
 * The 2026-09 taxonomy merged three categories (خدمات سيارات، خدمات رقمية، التزامات
 * وجمعيات), moved subcategories between categories, and retyped money movements that were
 * booked as spending or income — gam3eya payments, loans, ATM withdrawals — as transfers
 * (docs/decisions/0008-money-movements-and-taxonomy.md). `LEGACY_TAXONOMY` says where
 * each old pair lives now; this job applies it to what is already stored.
 *
 * It is application code rather than an SQL migration because a retyped row moves money
 * between the columns of `expense_daily_rollups`, and those are keyed by the Cairo
 * business day that `api/services/expense-rollups.ts` computes — SQL date functions on
 * the stored instant would bucket by UTC and corrupt the rollups.
 *
 * Each run handles a bounded batch and finds nothing once every row is current, so it is
 * safe to run repeatedly and it also catches rows an older client writes during a deploy.
 * Every changed expense keeps its old values in `parsed_metadata.legacy_taxonomy`; the
 * rollback is to restore them from there (and reverse the rollup delta the same way).
 */
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { db } from "../queries/connection";
import {
  expenses,
  userBudgets,
  userCorrectionRules,
  userDictionaries,
} from "../../db/schema";
import {
  LEGACY_TAXONOMY,
  resolveLegacyTaxonomy,
  type LegacyTaxonomyResult,
} from "../../contracts/categories";
import { applyExpenseRollupDelta, expenseToRollupDelta } from "../services/expense-rollups";
import { bumpFinanceCacheGen } from "../services/finance-semantic-layer";
import { createLogger } from "../lib/log";

const log = createLogger("taxonomy-migration");

export interface StoredTaxonomyRow {
  category: string;
  subCategory: string | null;
  type: string;
}

export interface TaxonomyRowChange {
  category: string;
  subCategory: string;
  type: string;
  /** Set when the row became a transfer, so the list shows which way it moved. */
  direction?: "incoming" | "outgoing";
}

/**
 * What a stored row becomes, or null when it is already current. Pure, so the mapping
 * can be tested without a database.
 */
export function planTaxonomyChange(row: StoredTaxonomyRow): TaxonomyRowChange | null {
  const resolved: LegacyTaxonomyResult | null = resolveLegacyTaxonomy(row.category, row.subCategory, row.type);
  if (!resolved) return null;
  const change: TaxonomyRowChange = {
    category: resolved.category,
    subCategory: resolved.subCategory,
    type: resolved.type ?? row.type,
    ...(resolved.direction ? { direction: resolved.direction } : {}),
  };
  const unchanged =
    change.category === row.category &&
    change.subCategory === (row.subCategory ?? "") &&
    change.type === row.type;
  return unchanged ? null : change;
}

/** A WHERE clause that finds the rows some legacy rule still applies to. */
function legacyRowFilter(
  categoryColumn: typeof expenses.category,
  subColumn: typeof expenses.subCategory,
  typeColumn?: typeof expenses.type,
): SQL {
  const clauses: SQL[] = [];
  for (const rule of LEGACY_TAXONOMY) {
    const parts: SQL[] = [eq(categoryColumn, rule.from.category)];
    if (rule.from.sub !== "*") parts.push(eq(subColumn, rule.from.sub));
    const identity =
      rule.from.category === rule.to.category && rule.from.sub === rule.to.sub;
    if (identity) {
      // A pair that stays where it is only changes when it was booked as spending or income.
      if (!typeColumn) continue;
      parts.push(inArray(typeColumn, ["expense", "income"]));
    }
    clauses.push(and(...parts) as SQL);
  }
  return or(...clauses) as SQL;
}

function withLegacy(metadata: unknown, row: StoredTaxonomyRow, change: TaxonomyRowChange): Record<string, unknown> {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
  // The first migration of a row keeps the original values; a later one does not overwrite them.
  if (!base.legacy_taxonomy) {
    base.legacy_taxonomy = { category: row.category, subCategory: row.subCategory, type: row.type };
  }
  if (change.direction && !base.direction) base.direction = change.direction;
  return base;
}

export async function runTaxonomyMigrationJob(batchSize = 500): Promise<{
  expenses: number;
  dictionaries: number;
  corrections: number;
  budgets: number;
}> {
  const rows = await db
    .select({
      id: expenses.id,
      userId: expenses.userId,
      userType: expenses.userType,
      businessId: expenses.businessId,
      date: expenses.date,
      type: expenses.type,
      amount: expenses.amount,
      category: expenses.category,
      subCategory: expenses.subCategory,
      source: expenses.source,
      status: expenses.status,
      parsedMetadata: expenses.parsedMetadata,
    })
    .from(expenses)
    .where(legacyRowFilter(expenses.category, expenses.subCategory, expenses.type))
    .limit(batchSize);

  const touchedUsers = new Map<string, { userId: number; userType: string }>();
  let migratedExpenses = 0;

  for (const row of rows) {
    const change = planTaxonomyChange(row);
    if (!change) continue;
    const metadata = withLegacy(row.parsedMetadata, row, change);

    await db.transaction(async (tx) => {
      await tx
        .update(expenses)
        .set({
          category: change.category,
          subCategory: change.subCategory,
          type: change.type,
          parsedMetadata: metadata,
        })
        .where(and(eq(expenses.id, row.id), eq(expenses.userId, row.userId), eq(expenses.userType, row.userType)));

      // Money moves between the rollup's columns only when the type changed.
      if (change.type !== row.type) {
        await applyExpenseRollupDelta(tx, expenseToRollupDelta(row, -1));
        await applyExpenseRollupDelta(tx, expenseToRollupDelta({ ...row, type: change.type }, 1));
      }
    });

    migratedExpenses++;
    touchedUsers.set(`${row.userType}:${row.userId}`, { userId: row.userId, userType: row.userType });
  }

  for (const user of touchedUsers.values()) {
    await bumpFinanceCacheGen(user.userId, user.userType as "oauth" | "local").catch(() => undefined);
  }

  const dictionaries = await migrateUserDictionaries(batchSize);
  const corrections = await migrateCorrectionRules(batchSize);
  const budgets = await migrateBudgets(batchSize);

  if (migratedExpenses + dictionaries + corrections + budgets > 0) {
    log.info(
      { event: "taxonomy.migrated", expenses: migratedExpenses, dictionaries, corrections, budgets },
      "Stored rows moved to the current taxonomy",
    );
  }
  return { expenses: migratedExpenses, dictionaries, corrections, budgets };
}

async function migrateUserDictionaries(batchSize: number): Promise<number> {
  const rows = await db
    .select({
      id: userDictionaries.id,
      category: userDictionaries.category,
      subCategory: userDictionaries.subCategory,
    })
    .from(userDictionaries)
    .where(legacyRowFilter(userDictionaries.category as never, userDictionaries.subCategory as never))
    .limit(batchSize);
  let count = 0;
  for (const row of rows) {
    // A taught word has no type of its own; the retype rules do not apply to it.
    const change = planTaxonomyChange({ ...row, type: "transfer" });
    if (!change) continue;
    await db
      .update(userDictionaries)
      .set({ category: change.category, subCategory: change.subCategory })
      .where(eq(userDictionaries.id, row.id));
    count++;
  }
  return count;
}

async function migrateCorrectionRules(batchSize: number): Promise<number> {
  const rows = await db
    .select({
      id: userCorrectionRules.id,
      category: userCorrectionRules.category,
      subCategory: userCorrectionRules.subCategory,
      type: userCorrectionRules.type,
    })
    .from(userCorrectionRules)
    .where(
      legacyRowFilter(
        userCorrectionRules.category as never,
        userCorrectionRules.subCategory as never,
        userCorrectionRules.type as never,
      ),
    )
    .limit(batchSize);
  let count = 0;
  for (const row of rows) {
    const change = planTaxonomyChange(row);
    if (!change) continue;
    await db
      .update(userCorrectionRules)
      .set({ category: change.category, subCategory: change.subCategory, type: change.type })
      .where(eq(userCorrectionRules.id, row.id));
    count++;
  }
  return count;
}

async function migrateBudgets(batchSize: number): Promise<number> {
  // A budget names a category only; a retired category moves to where most of it went.
  const retired = LEGACY_TAXONOMY.filter((rule) => rule.from.sub === "*");
  const names = retired.map((rule) => rule.from.category);
  if (names.length === 0) return 0;
  const rows = await db
    .select({ id: userBudgets.id, category: userBudgets.category })
    .from(userBudgets)
    .where(inArray(userBudgets.category, names))
    .limit(batchSize);
  let count = 0;
  for (const row of rows) {
    const rule = retired.find((candidate) => candidate.from.category === row.category);
    if (!rule) continue;
    await db.update(userBudgets).set({ category: rule.to.category }).where(eq(userBudgets.id, row.id));
    count++;
  }
  return count;
}
