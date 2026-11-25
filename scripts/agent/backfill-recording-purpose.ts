/** One account per run. Preview by default. Interrupted writes resume at the first unversioned row. */
import "dotenv/config";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { expenses } from "../../db/schema";
import { db, mysqlPool } from "../../api/queries/connection";
import { purposeColumnsFor } from "../../api/services/recording/saved-reading";
import { invalidateLedgerCaches } from "../../api/services/ledger-writer";

async function main() {
  const [type, id, flag, ...extra] = process.argv.slice(2);
  if (!["local", "oauth"].includes(type) || !/^[1-9]\d*$/.test(id ?? "") || !Number.isSafeInteger(Number(id)) ||
      (flag !== undefined && flag !== "--apply") || extra.length) {
    throw new Error("Usage: tsx scripts/agent/backfill-recording-purpose.ts <local|oauth> <user id> [--apply]");
  }
  const apply = flag === "--apply";
  const scope = and(eq(expenses.userType, type), eq(expenses.userId, Number(id)), isNull(expenses.purposeVersion));
  let cursor = 0, precise = 0, broad = 0;
  for (;;) {
    const batch = await db.transaction(async tx => {
      const query = tx.select().from(expenses).where(and(scope, gt(expenses.id, cursor))).orderBy(expenses.id).limit(100);
      const rows = await (apply ? query.for("update") : query);
      let exact = 0;
      for (const row of rows) {
        const purpose = purposeColumnsFor(row);
        if (purpose.purposeCategoryId) exact++;
        if (apply) await tx.update(expenses).set({ ...purpose, updatedAt: sql`updated_at` })
          .where(and(scope, eq(expenses.id, row.id)));
      }
      return { cursor: rows.at(-1)?.id, count: rows.length, exact };
    });
    if (!batch.cursor) break;
    cursor = batch.cursor;
    precise += batch.exact;
    broad += batch.count - batch.exact;
    if (apply) await invalidateLedgerCaches(Number(id), type);
  }
  process.stdout.write(JSON.stringify({ apply, precise, broad, scanned: precise + broad }) + "\n");
}
main().catch(() => { process.stderr.write("Purpose migration failed. Check account arguments and database connection.\n"); process.exitCode = 1; })
  .finally(() => mysqlPool.end());
