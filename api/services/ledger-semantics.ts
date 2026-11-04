/** SQL view of the shared financial bucket, for direct queries that do not use daily rollups. */
import { sql } from "drizzle-orm";
import { expenses } from "../../db/schema";

const excludedMovementSql = sql`(JSON_TYPE(JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.version')) IN ('INTEGER', 'DOUBLE', 'DECIMAL')
   AND JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.version') = 1
   AND JSON_UNQUOTE(JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.movement')) IN ('in', 'out')
   AND JSON_UNQUOTE(JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.kind')) IN ('own_transfer', 'cash_transfer', 'card_payment', 'investment'))`;
export const ledgerBucketSql = sql<string>`CASE WHEN ${excludedMovementSql}
  THEN CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.kind')) = 'investment' THEN 'investment' ELSE 'transfer' END
  ELSE ${expenses.type} END`;

export const spendingRowSql = sql`${ledgerBucketSql} = 'expense'`;
export const incomeRowSql = sql`${ledgerBucketSql} = 'income'`;
export const ledgerMovementSql = sql<string>`CASE WHEN ${expenses.type} = 'income' THEN 'in'
  WHEN ${expenses.type} = 'expense' THEN CASE WHEN ${expenses.amount} < 0 THEN 'in' ELSE 'out' END
  WHEN JSON_UNQUOTE(JSON_EXTRACT(${expenses.parsedMetadata}, '$.direction')) IN ('incoming','in') THEN 'in'
  WHEN JSON_UNQUOTE(JSON_EXTRACT(${expenses.parsedMetadata}, '$.direction')) IN ('outgoing','out') THEN 'out'
  ELSE NULL END`;
export const counterWalletSql = sql<number>`CASE WHEN ${excludedMovementSql}
  AND JSON_TYPE(JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.counterWalletId')) IN ('INTEGER','DOUBLE','DECIMAL')
  AND JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.counterWalletId') > 0
  AND JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.counterWalletId') <= 9007199254740991
  AND FLOOR(JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.counterWalletId')) = JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.counterWalletId')
  THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(${expenses.parsedMetadata}, '$.financial.counterWalletId')) AS UNSIGNED) ELSE NULL END`;
