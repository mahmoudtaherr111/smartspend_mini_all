/** Expand/contract deploys must still let an account delete its data before additive capture migrations run. */
import { sql } from "drizzle-orm";
import type { LedgerTx } from "../../services/ledger-writer";

export async function optionalCaptureTables(
  tx: LedgerTx,
): Promise<Set<string>> {
  const [raw] =
    await tx.execute(sql`SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE()
    AND table_name IN ('capture_questions', 'capture_ai_accounts', 'capture_ai_reservations')`);
  return new Set(
    Array.isArray(raw)
      ? raw.flatMap((row) =>
          row &&
          typeof row === "object" &&
          "tableName" in row &&
          typeof row.tableName === "string"
            ? [row.tableName]
            : [],
        )
      : [],
  );
}
